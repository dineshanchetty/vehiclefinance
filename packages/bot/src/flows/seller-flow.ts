/**
 * Seller conversation flow state machine.
 *
 * States:
 *   WELCOME → CONSENT → ID_UPLOAD → VEHICLE_DOC_UPLOAD → VEHICLE_PHOTOS
 *   → DATA_CONFIRMATION → WAITING_FOR_CONTRACT → CONTRACT_SIGNING → DONE
 *
 * Vehicle photo sub-flow tracks all 9 mandatory angles:
 *   FRONT_VIEW, REAR_VIEW, LEFT_SIDE, RIGHT_SIDE, FRONT_LEFT_ANGLE,
 *   FRONT_RIGHT_ANGLE, ODOMETER, INTERIOR_DASHBOARD, VIN_CHASSIS
 *
 * Reminder schedule (handled externally by the reminder scheduler):
 *   2h idle → first reminder
 *  24h idle → second reminder
 *  48h idle → final reminder / escalation
 */

import type {
  BotResponse,
  ConversationContext,
  ConversationState,
  D360Message,
  FlowResult,
  SellerStep,
  VehiclePhotoAngle,
} from '../types/index.js';
import { MANDATORY_VEHICLE_ANGLES } from '../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function text(body: string): BotResponse {
  return { type: 'text', text: body };
}

function buttons(
  body: string,
  opts: Array<{ id: string; title: string }>,
): BotResponse {
  return { type: 'interactive', body, buttons: opts };
}

function extractText(msg: D360Message): string | null {
  if (msg.type === 'text' && msg.text) return msg.text.body.trim();
  if (msg.type === 'interactive' && msg.interactive) {
    return (
      msg.interactive.button_reply?.title ??
      msg.interactive.list_reply?.title ??
      null
    );
  }
  if (msg.type === 'button' && msg.button) return msg.button.payload;
  return null;
}

function extractButtonId(msg: D360Message): string | null {
  if (msg.type === 'interactive' && msg.interactive?.button_reply) {
    return msg.interactive.button_reply.id;
  }
  if (msg.type === 'button' && msg.button) return msg.button.payload;
  return null;
}

function hasMedia(msg: D360Message): boolean {
  return ['image', 'document'].includes(msg.type);
}

/** Human-readable label for each angle used in prompts. */
const ANGLE_LABELS: Record<VehiclePhotoAngle, string> = {
  FRONT_VIEW: 'Front view (straight on)',
  REAR_VIEW: 'Rear view (straight on)',
  LEFT_SIDE: 'Left side (full profile)',
  RIGHT_SIDE: 'Right side (full profile)',
  FRONT_LEFT_ANGLE: 'Front-left angle (3/4 view)',
  FRONT_RIGHT_ANGLE: 'Front-right angle (3/4 view)',
  ODOMETER: 'Odometer / instrument cluster',
  INTERIOR_DASHBOARD: 'Interior dashboard & steering wheel',
  VIN_CHASSIS: 'VIN / chassis number plate',
};

/** Produce the next-angle prompt asking for remaining photos. */
function buildPhotoPrompt(received: VehiclePhotoAngle[]): string {
  const remaining = MANDATORY_VEHICLE_ANGLES.filter((a) => !received.includes(a));
  if (remaining.length === 0) return '';

  const nextAngle = remaining[0];
  const remainingList = remaining.map((a, i) => `${i + 1}. ${ANGLE_LABELS[a]}`).join('\n');

  return (
    `Please send a photo for: *${ANGLE_LABELS[nextAngle]}*\n\n` +
    `Remaining photos needed (${remaining.length}):\n${remainingList}`
  );
}

/** Infer which angle the caption or context indicates (simple keyword matching). */
function inferAngleFromCaption(caption: string | undefined): VehiclePhotoAngle | null {
  if (!caption) return null;
  const c = caption.toLowerCase();
  if (c.includes('front') && c.includes('left')) return 'FRONT_LEFT_ANGLE';
  if (c.includes('front') && c.includes('right')) return 'FRONT_RIGHT_ANGLE';
  if (c.includes('front')) return 'FRONT_VIEW';
  if (c.includes('rear') || c.includes('back')) return 'REAR_VIEW';
  if (c.includes('left')) return 'LEFT_SIDE';
  if (c.includes('right')) return 'RIGHT_SIDE';
  if (c.includes('odometer') || c.includes('mileage') || c.includes('speedo')) return 'ODOMETER';
  if (c.includes('interior') || c.includes('dashboard') || c.includes('dash')) return 'INTERIOR_DASHBOARD';
  if (c.includes('vin') || c.includes('chassis')) return 'VIN_CHASSIS';
  return null;
}

// ---------------------------------------------------------------------------
// State handlers
// ---------------------------------------------------------------------------

async function handleWelcome(
  _msg: D360Message,
  _state: ConversationState,
): Promise<FlowResult> {
  return {
    nextStep: 'CONSENT',
    responses: [
      text(
        "Welcome to VehicleFinance! 🚗\n\nA buyer has requested vehicle finance and has provided your WhatsApp number as the seller.\n\nWe need to collect some documentation from you to proceed with the transaction.",
      ),
      buttons(
        'Do you consent to our Terms of Service and Privacy Policy, and agree for us to process your personal information for the purposes of this vehicle sale transaction?',
        [
          { id: 'consent_yes', title: 'Yes, I agree' },
          { id: 'consent_no', title: 'No, decline' },
        ],
      ),
    ],
  };
}

async function handleConsent(
  msg: D360Message,
  _state: ConversationState,
): Promise<FlowResult> {
  const id = extractButtonId(msg);
  const txt = (extractText(msg) ?? '').toLowerCase();

  const agreed =
    id === 'consent_yes' ||
    txt.includes('yes') ||
    txt.includes('agree');

  if (!agreed) {
    return {
      nextStep: 'CONSENT',
      responses: [
        text(
          "No problem. The buyer will be notified that the seller has declined to participate. If you change your mind, feel free to message us again.",
        ),
      ],
    };
  }

  return {
    nextStep: 'ID_UPLOAD',
    responses: [
      text(
        "Thank you! ✅\n\n*Step 1 of 3 — Identity Document*\n\nPlease send a clear photo or PDF of your South African ID document (green bar-coded ID, Smart ID card, or Passport).",
      ),
    ],
  };
}

async function handleIdUpload(
  msg: D360Message,
  _state: ConversationState,
): Promise<FlowResult> {
  if (!hasMedia(msg)) {
    return {
      nextStep: 'ID_UPLOAD',
      responses: [
        text(
          "Please send your ID document as a *photo* or *PDF file*. Make sure all four corners are visible and the text is legible.",
        ),
      ],
    };
  }

  return {
    nextStep: 'VEHICLE_DOC_UPLOAD',
    responses: [
      text(
        "ID document received! ✅\n\n*Step 2 of 3 — Vehicle Documentation*\n\nPlease send the vehicle's *Registration Certificate (RC1/natis)* as a photo or PDF.",
      ),
    ],
  };
}

async function handleVehicleDocUpload(
  msg: D360Message,
  _state: ConversationState,
): Promise<FlowResult> {
  if (!hasMedia(msg)) {
    return {
      nextStep: 'VEHICLE_DOC_UPLOAD',
      responses: [
        text(
          "Please send the vehicle's *Registration Certificate (natis/RC1)* as a *photo* or *PDF file*.",
        ),
      ],
    };
  }

  return {
    nextStep: 'VEHICLE_PHOTOS',
    responses: [
      text(
        `Vehicle document received! ✅\n\n*Step 3 of 3 — Vehicle Photos*\n\nWe need *9 photos* of the vehicle to complete the inspection.\n\nRequired photos:\n${MANDATORY_VEHICLE_ANGLES.map((a, i) => `${i + 1}. ${ANGLE_LABELS[a]}`).join('\n')}\n\nPlease send each photo one at a time. Start with: *${ANGLE_LABELS['FRONT_VIEW']}*`,
      ),
    ],
  };
}

async function handleVehiclePhotos(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  const received: VehiclePhotoAngle[] =
    (state.context.photos_received as VehiclePhotoAngle[] | undefined) ?? [];

  if (!hasMedia(msg)) {
    const prompt = buildPhotoPrompt(received);
    return {
      nextStep: 'VEHICLE_PHOTOS',
      responses: [text(prompt || 'Please send the next vehicle photo.')],
    };
  }

  // Determine which angle this photo represents
  const caption =
    msg.image?.caption ?? msg.document?.caption ?? undefined;
  const inferredAngle = inferAngleFromCaption(caption);

  // If we can infer the angle, record it; otherwise record the next expected angle
  const nextExpected = MANDATORY_VEHICLE_ANGLES.find((a) => !received.includes(a));
  const angleToRecord = inferredAngle ?? nextExpected ?? null;

  let updatedReceived = [...received];

  if (angleToRecord && !updatedReceived.includes(angleToRecord)) {
    updatedReceived.push(angleToRecord);
  }

  const remaining = MANDATORY_VEHICLE_ANGLES.filter((a) => !updatedReceived.includes(a));

  if (remaining.length === 0) {
    // All 9 photos received
    return {
      nextStep: 'DATA_CONFIRMATION',
      responses: [
        text(
          "All 9 vehicle photos received! ✅\n\nI am now extracting the vehicle details from your documents. Please hold on for a moment...",
        ),
      ],
      dealUpdate: { photos_complete: true } as never,
    };
  }

  const nextAngle = remaining[0];
  const countDone = updatedReceived.length;

  return {
    nextStep: 'VEHICLE_PHOTOS',
    responses: [
      text(
        `Photo ${countDone}/9 received ✅${angleToRecord ? ` (${ANGLE_LABELS[angleToRecord]})` : ''}\n\nNext photo needed: *${ANGLE_LABELS[nextAngle]}*\n\n${remaining.length} photo(s) remaining.`,
      ),
    ],
    dealUpdate: { photos_received: updatedReceived } as never,
  };
}

async function handleDataConfirmation(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  const id = extractButtonId(msg);
  const txt = (extractText(msg) ?? '').toLowerCase();

  if (!state.context.data_shown) {
    const extracted = (state.context.extracted_data as Record<string, string> | undefined) ?? {};
    const summary =
      Object.keys(extracted).length > 0
        ? Object.entries(extracted)
            .map(([k, v]) => `• *${k}*: ${v}`)
            .join('\n')
        : '_(Data extraction in progress — please wait a moment and try again)_';

    return {
      nextStep: 'DATA_CONFIRMATION',
      responses: [
        text(`Here is the vehicle information we extracted:\n\n${summary}`),
        buttons('Is all the vehicle information above correct?', [
          { id: 'confirm_yes', title: 'Yes, correct' },
          { id: 'confirm_no', title: 'Something is wrong' },
        ]),
      ],
    };
  }

  const confirmed =
    id === 'confirm_yes' || txt.includes('yes') || txt.includes('correct');

  if (!confirmed) {
    return {
      nextStep: 'DATA_CONFIRMATION',
      responses: [
        text(
          "I'm sorry about that. Please describe what is incorrect and a consultant will assist you to update the information.",
        ),
      ],
    };
  }

  return {
    nextStep: 'WAITING_FOR_CONTRACT',
    responses: [
      text(
        "Vehicle information confirmed! ✅\n\nThe buyer's finance application is being processed. Once approved, you will receive a sale agreement to sign.\n\nWe will notify you on WhatsApp when the contract is ready. 📋",
      ),
    ],
  };
}

async function handleWaitingForContract(
  _msg: D360Message,
  _state: ConversationState,
): Promise<FlowResult> {
  return {
    nextStep: 'WAITING_FOR_CONTRACT',
    responses: [
      text(
        "The contract is being prepared. We will notify you here as soon as it is ready to sign. Thank you for your patience! 🙏",
      ),
    ],
  };
}

async function handleContractSigning(
  msg: D360Message,
  _state: ConversationState,
): Promise<FlowResult> {
  const txt = (extractText(msg) ?? '').toLowerCase();

  if (txt.includes('signed') || txt.includes('done') || txt.includes('complete')) {
    return {
      nextStep: 'DONE',
      responses: [
        text(
          "Congratulations! 🎉 You have signed the sale agreement. The finance will be disbursed to the buyer and the vehicle transfer process will begin.\n\nA consultant will contact you with further instructions. Thank you for using VehicleFinance!",
        ),
      ],
      dealUpdate: { status: 'contract_signed' },
    };
  }

  return {
    nextStep: 'CONTRACT_SIGNING',
    responses: [
      text(
        "Please sign the sale agreement using the link we sent you. Once signed, reply *Signed* here to confirm. If you have not received the link, reply *Resend*.",
      ),
    ],
  };
}

async function handleDone(
  _msg: D360Message,
  _state: ConversationState,
): Promise<FlowResult> {
  return {
    nextStep: 'DONE',
    responses: [
      text(
        "This transaction is complete. For further queries, please contact our support team. Thank you! 🚗",
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const HANDLERS: Record<
  SellerStep,
  (msg: D360Message, state: ConversationState) => Promise<FlowResult>
> = {
  WELCOME: handleWelcome,
  CONSENT: handleConsent,
  ID_UPLOAD: handleIdUpload,
  VEHICLE_DOC_UPLOAD: handleVehicleDocUpload,
  VEHICLE_PHOTOS: handleVehiclePhotos,
  DATA_CONFIRMATION: handleDataConfirmation,
  WAITING_FOR_CONTRACT: handleWaitingForContract,
  CONTRACT_SIGNING: handleContractSigning,
  DONE: handleDone,
};

/**
 * Route an inbound message through the seller flow.
 *
 * @param msg   - Parsed Dialog360 inbound message
 * @param state - Current conversation state (or a synthetic WELCOME state for new contacts)
 * @returns Next step + responses to dispatch
 */
export async function handleSellerMessage(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  const step = (state.current_step as SellerStep) ?? 'WELCOME';
  const handler = HANDLERS[step] ?? handleWelcome;
  return handler(msg, state);
}

/**
 * Build an initial ConversationState for a brand-new seller contact.
 */
export function newSellerState(phone: string): ConversationState {
  return {
    phone,
    party_type: 'seller',
    current_step: 'WELCOME',
    deal_id: null,
    last_activity: new Date().toISOString(),
    context: {} as ConversationContext,
  };
}

// ---------------------------------------------------------------------------
// Reminder helpers (called by external scheduler)
// ---------------------------------------------------------------------------

export type ReminderLevel = '2h' | '24h' | '48h';

/**
 * Return the appropriate reminder message text for the seller's current step.
 */
export function buildSellerReminderMessage(
  step: SellerStep,
  level: ReminderLevel,
  context: ConversationContext,
): string {
  const prefix =
    level === '2h'
      ? "Just a gentle reminder:"
      : level === '24h'
        ? "We noticed you haven't continued your application. Reminder:"
        : "⚠️ Final reminder: Your vehicle transaction is waiting on your action.";

  switch (step) {
    case 'CONSENT':
      return `${prefix} Please accept our Terms of Service to proceed with the vehicle sale transaction.`;
    case 'ID_UPLOAD':
      return `${prefix} Please send a photo or PDF of your ID document to continue.`;
    case 'VEHICLE_DOC_UPLOAD':
      return `${prefix} Please send the vehicle's Registration Certificate (natis/RC1) to continue.`;
    case 'VEHICLE_PHOTOS': {
      const received = (context.photos_received as VehiclePhotoAngle[] | undefined) ?? [];
      const remaining = MANDATORY_VEHICLE_ANGLES.filter((a) => !received.includes(a));
      return `${prefix} You still need to send ${remaining.length} vehicle photo(s). Next needed: *${ANGLE_LABELS[remaining[0]]}*`;
    }
    case 'DATA_CONFIRMATION':
      return `${prefix} Please confirm the extracted vehicle information to proceed.`;
    case 'CONTRACT_SIGNING':
      return `${prefix} Your sale agreement is ready to sign. Please use the link provided and reply *Signed* when done.`;
    default:
      return `${prefix} Please continue your VehicleFinance transaction.`;
  }
}
