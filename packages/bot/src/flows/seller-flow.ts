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
 * CONTRACT: every state handler MUST persist conversation_state before returning.
 * Persistence is handled via advance / saveState from state/conversation.ts.
 *
 * Reminder schedule (handled externally by the reminder/escalation scheduler):
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
import { STRINGS } from './strings.js';
import { advance, incrementMalformed, saveState } from '../state/conversation.js';
import { createOpsTask } from '../services/supabase.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a text BotResponse. */
function text(body: string): BotResponse {
  return { type: 'text', text: body };
}

/** Build an interactive button BotResponse. */
function buttons(
  body: string,
  opts: Array<{ id: string; title: string }>,
): BotResponse {
  return { type: 'interactive', body, buttons: opts };
}

/** Extract plain text from any inbound message. */
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

/** Extract the button reply ID. */
function extractButtonId(msg: D360Message): string | null {
  if (msg.type === 'interactive' && msg.interactive?.button_reply) {
    return msg.interactive.button_reply.id;
  }
  if (msg.type === 'button' && msg.button) return msg.button.payload;
  return null;
}

/** True if the message carries an image or document attachment. */
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

/** Infer which angle the caption indicates (simple keyword matching). */
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

/**
 * Create a Q_HUMAN_ESCALATION ops task and advance state to DONE.
 * Called when malformed_count reaches 3.
 */
async function escalateToHuman(
  state: ConversationState,
): Promise<FlowResult> {
  try {
    await createOpsTask({
      deal_id: state.deal_id ?? undefined,
      task_type: 'Q_HUMAN_ESCALATION',
      description: `Seller ${state.phone} sent 3 consecutive unrecognised inputs at step ${state.current_step}. Human agent required.`,
      priority: 'high',
    });
  } catch {
    console.warn(`[seller-flow] Failed to create escalation task for ${state.phone}`);
  }

  return {
    nextStep: 'DONE',
    responses: [text(STRINGS.ESCALATED_TO_HUMAN)],
  };
}

// ---------------------------------------------------------------------------
// State handlers
// ---------------------------------------------------------------------------

/**
 * WELCOME
 * Triggered on the very first message from a new seller contact.
 * Always advances to CONSENT — no input validation needed.
 */
async function handleWelcome(
  _msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  await advance(state.phone, 'CONSENT', 'seller', state.deal_id);
  return {
    nextStep: 'CONSENT',
    responses: [
      text(STRINGS.SELLER.WELCOME_INTRO),
      buttons(STRINGS.SELLER.WELCOME_CONSENT_QUESTION, [
        { id: 'consent_yes', title: STRINGS.SELLER.WELCOME_CONSENT_YES },
        { id: 'consent_no', title: STRINGS.SELLER.WELCOME_CONSENT_NO },
      ]),
    ],
  };
}

/**
 * CONSENT
 * Capture yes/no consent response.
 */
async function handleConsent(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  const id = extractButtonId(msg);
  const txt = (extractText(msg) ?? '').toLowerCase();

  const agreed =
    id === 'consent_yes' ||
    txt.includes('yes') ||
    txt.includes('agree');

  const declined =
    id === 'consent_no' ||
    txt.includes('no') ||
    txt.includes('decline');

  if (agreed) {
    await advance(state.phone, 'ID_UPLOAD', 'seller', state.deal_id, { consented: true });
    return {
      nextStep: 'ID_UPLOAD',
      responses: [text(STRINGS.SELLER.CONSENT_ACCEPTED_ID_PROMPT)],
    };
  }

  if (declined) {
    await saveState(state.phone, 'DONE', 'seller', state.deal_id, {}, 0, false);
    return {
      nextStep: 'DONE',
      responses: [text(STRINGS.SELLER.CONSENT_DECLINED)],
    };
  }

  const count = await incrementMalformed(state.phone);
  if (count >= 3) return escalateToHuman(state);

  return {
    nextStep: 'CONSENT',
    responses: [
      buttons(STRINGS.SELLER.WELCOME_CONSENT_QUESTION, [
        { id: 'consent_yes', title: STRINGS.SELLER.WELCOME_CONSENT_YES },
        { id: 'consent_no', title: STRINGS.SELLER.WELCOME_CONSENT_NO },
      ]),
    ],
  };
}

/**
 * ID_UPLOAD
 * Wait for an image or document containing the seller's ID.
 */
async function handleIdUpload(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  if (!hasMedia(msg)) {
    const count = await incrementMalformed(state.phone);
    if (count >= 3) return escalateToHuman(state);
    return {
      nextStep: 'ID_UPLOAD',
      responses: [text(STRINGS.SELLER.ID_UPLOAD_PROMPT)],
    };
  }

  await advance(state.phone, 'VEHICLE_DOC_UPLOAD', 'seller', state.deal_id);
  return {
    nextStep: 'VEHICLE_DOC_UPLOAD',
    responses: [text(STRINGS.SELLER.ID_UPLOAD_RECEIVED)],
  };
}

/**
 * VEHICLE_DOC_UPLOAD
 * Wait for the vehicle registration certificate (natis/RC1).
 */
async function handleVehicleDocUpload(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  if (!hasMedia(msg)) {
    const count = await incrementMalformed(state.phone);
    if (count >= 3) return escalateToHuman(state);
    return {
      nextStep: 'VEHICLE_DOC_UPLOAD',
      responses: [text(STRINGS.SELLER.VEHICLE_DOC_PROMPT)],
    };
  }

  await advance(state.phone, 'VEHICLE_PHOTOS', 'seller', state.deal_id, {
    photos_received: [],
  });

  const angleList = MANDATORY_VEHICLE_ANGLES.map((a, i) => `${i + 1}. ${ANGLE_LABELS[a]}`).join('\n');
  return {
    nextStep: 'VEHICLE_PHOTOS',
    responses: [text(STRINGS.SELLER.VEHICLE_DOC_RECEIVED(angleList))],
  };
}

/**
 * VEHICLE_PHOTOS
 * Collect all 9 mandatory vehicle photos.
 * Infers angle from image caption; falls back to sequential ordering.
 */
async function handleVehiclePhotos(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  const received: VehiclePhotoAngle[] =
    (state.context.photos_received as VehiclePhotoAngle[] | undefined) ?? [];

  if (!hasMedia(msg)) {
    const prompt = buildPhotoPrompt(received);
    const count = await incrementMalformed(state.phone);
    if (count >= 3) return escalateToHuman(state);
    return {
      nextStep: 'VEHICLE_PHOTOS',
      responses: [text(prompt || STRINGS.SELLER.PHOTO_PROMPT_GENERIC)],
    };
  }

  const caption =
    msg.image?.caption ?? msg.document?.caption ?? undefined;
  const inferredAngle = inferAngleFromCaption(caption);
  const nextExpected = MANDATORY_VEHICLE_ANGLES.find((a) => !received.includes(a));
  const angleToRecord = inferredAngle ?? nextExpected ?? null;

  const updatedReceived = [...received];
  if (angleToRecord && !updatedReceived.includes(angleToRecord)) {
    updatedReceived.push(angleToRecord);
  }

  const remaining = MANDATORY_VEHICLE_ANGLES.filter((a) => !updatedReceived.includes(a));

  if (remaining.length === 0) {
    await advance(state.phone, 'DATA_CONFIRMATION', 'seller', state.deal_id, {
      photos_received: updatedReceived,
      photos_complete: true,
    });
    return {
      nextStep: 'DATA_CONFIRMATION',
      responses: [text(STRINGS.SELLER.ALL_PHOTOS_RECEIVED)],
      dealUpdate: { photos_complete: true } as never,
    };
  }

  const nextAngle = remaining[0];
  const countDone = updatedReceived.length;

  await advance(state.phone, 'VEHICLE_PHOTOS', 'seller', state.deal_id, {
    photos_received: updatedReceived,
  });

  return {
    nextStep: 'VEHICLE_PHOTOS',
    responses: [
      text(
        STRINGS.SELLER.PHOTO_RECEIVED(
          countDone,
          angleToRecord ? ANGLE_LABELS[angleToRecord] : null,
          ANGLE_LABELS[nextAngle],
          remaining.length,
        ),
      ),
    ],
    dealUpdate: { photos_received: updatedReceived } as never,
  };
}

/**
 * DATA_CONFIRMATION
 * Show extracted vehicle data to seller for confirmation.
 */
async function handleDataConfirmation(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  const id = extractButtonId(msg);
  const txt = (extractText(msg) ?? '').toLowerCase();

  if (!state.context.data_shown) {
    const extracted =
      (state.context.extracted_data as Record<string, string> | undefined) ?? {};
    const summary =
      Object.keys(extracted).length > 0
        ? Object.entries(extracted)
            .map(([k, v]) => `• *${k}*: ${v}`)
            .join('\n')
        : STRINGS.SELLER.DATA_CONFIRM_PENDING;

    await advance(state.phone, 'DATA_CONFIRMATION', 'seller', state.deal_id, {
      data_shown: true,
    });

    return {
      nextStep: 'DATA_CONFIRMATION',
      responses: [
        text(`${STRINGS.SELLER.DATA_CONFIRM_HEADER}${summary}`),
        buttons(STRINGS.SELLER.DATA_CONFIRM_QUESTION, [
          { id: 'confirm_yes', title: STRINGS.SELLER.DATA_CONFIRM_YES },
          { id: 'confirm_no', title: STRINGS.SELLER.DATA_CONFIRM_NO },
        ]),
      ],
    };
  }

  const confirmed =
    id === 'confirm_yes' || txt.includes('yes') || txt.includes('correct');

  const denied =
    id === 'confirm_no' ||
    txt.includes('no') ||
    txt.includes('wrong') ||
    txt.includes('incorrect');

  if (confirmed) {
    await advance(state.phone, 'WAITING_FOR_CONTRACT', 'seller', state.deal_id);
    return {
      nextStep: 'WAITING_FOR_CONTRACT',
      responses: [text(STRINGS.SELLER.DATA_CONFIRMED)],
    };
  }

  if (denied) {
    await advance(state.phone, 'DATA_CONFIRMATION', 'seller', state.deal_id, {
      data_shown: false,
    });
    return {
      nextStep: 'DATA_CONFIRMATION',
      responses: [text(STRINGS.SELLER.DATA_CONFIRM_CORRECTION_REQUEST)],
    };
  }

  const count = await incrementMalformed(state.phone);
  if (count >= 3) return escalateToHuman(state);

  return {
    nextStep: 'DATA_CONFIRMATION',
    responses: [
      buttons(STRINGS.SELLER.DATA_CONFIRM_QUESTION, [
        { id: 'confirm_yes', title: STRINGS.SELLER.DATA_CONFIRM_YES },
        { id: 'confirm_no', title: STRINGS.SELLER.DATA_CONFIRM_NO },
      ]),
    ],
  };
}

/**
 * WAITING_FOR_CONTRACT
 * Passive state — seller waits for contract to be generated.
 */
async function handleWaitingForContract(
  _msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  await advance(state.phone, 'WAITING_FOR_CONTRACT', 'seller', state.deal_id);
  return {
    nextStep: 'WAITING_FOR_CONTRACT',
    responses: [text(STRINGS.SELLER.WAITING_FOR_CONTRACT)],
  };
}

/**
 * CONTRACT_SIGNING
 * Seller needs to sign the sale agreement via the link sent separately.
 */
async function handleContractSigning(
  msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  const txt = (extractText(msg) ?? '').toLowerCase();

  if (txt.includes('signed') || txt.includes('done') || txt.includes('complete')) {
    await saveState(state.phone, 'DONE', 'seller', state.deal_id, {}, 0, false);
    return {
      nextStep: 'DONE',
      responses: [text(STRINGS.SELLER.CONTRACT_SIGNED)],
      dealUpdate: { status: 'contract_signed' },
    };
  }

  await advance(state.phone, 'CONTRACT_SIGNING', 'seller', state.deal_id);
  return {
    nextStep: 'CONTRACT_SIGNING',
    responses: [text(STRINGS.SELLER.CONTRACT_SIGNING_PROMPT)],
  };
}

/**
 * DONE
 * Terminal state — acknowledge any further messages gracefully.
 */
async function handleDone(
  _msg: D360Message,
  state: ConversationState,
): Promise<FlowResult> {
  await advance(state.phone, 'DONE', 'seller', state.deal_id);
  return {
    nextStep: 'DONE',
    responses: [text(STRINGS.SELLER.DONE_MESSAGE)],
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/** Map each SellerStep to its handler function. */
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
      ? STRINGS.SELLER.REMINDER_PREFIX_2H
      : level === '24h'
        ? STRINGS.SELLER.REMINDER_PREFIX_24H
        : STRINGS.SELLER.REMINDER_PREFIX_48H;

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
