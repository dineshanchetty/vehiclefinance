/**
 * Core TypeScript types for the vehicle finance WhatsApp bot.
 * Covers Dialog360 payloads, conversation state, and deal stage enums.
 */

// ---------------------------------------------------------------------------
// WhatsApp / Dialog360 message types
// ---------------------------------------------------------------------------

export type WaMessageType =
  | 'text'
  | 'image'
  | 'document'
  | 'audio'
  | 'video'
  | 'interactive'
  | 'button'
  | 'location'
  | 'sticker'
  | 'unsupported';

export interface WaTextContent {
  body: string;
  preview_url?: boolean;
}

export interface WaMediaContent {
  /** Dialog360 media ID (used to download via API) */
  id: string;
  mime_type?: string;
  sha256?: string;
  filename?: string;
  caption?: string;
}

export interface WaInteractiveReply {
  type: 'button_reply' | 'list_reply';
  button_reply?: { id: string; title: string };
  list_reply?: { id: string; title: string; description?: string };
}

export interface WaButtonReply {
  /** Button payload ID */
  id: string;
  title: string;
}

// ---------------------------------------------------------------------------
// Dialog360 inbound webhook payload
// ---------------------------------------------------------------------------

export interface D360Contact {
  profile: { name: string };
  wa_id: string;
}

export interface D360Message {
  from: string;
  id: string;
  timestamp: string;
  type: WaMessageType;
  text?: WaTextContent;
  image?: WaMediaContent;
  document?: WaMediaContent;
  audio?: WaMediaContent;
  video?: WaMediaContent;
  interactive?: WaInteractiveReply;
  button?: { payload: string; text: string };
}

export interface D360Status {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
}

export interface D360Entry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: { display_phone_number: string; phone_number_id: string };
      contacts?: D360Contact[];
      messages?: D360Message[];
      statuses?: D360Status[];
    };
    field: string;
  }>;
}

/** Root Dialog360 webhook payload */
export interface D360WebhookPayload {
  object: string;
  entry: D360Entry[];
}

// ---------------------------------------------------------------------------
// Outbound message builders
// ---------------------------------------------------------------------------

export interface D360InteractiveButton {
  type: 'reply';
  reply: { id: string; title: string };
}

export interface D360InteractiveBody {
  type: 'button';
  body: { text: string };
  action: { buttons: D360InteractiveButton[] };
  header?: { type: 'text'; text: string };
  footer?: { text: string };
}

// ---------------------------------------------------------------------------
// Deal stage types (mirror database enums)
// ---------------------------------------------------------------------------

export type DealStatus =
  | 'initiated'
  | 'buyer_docs_pending'
  | 'seller_docs_pending'
  | 'docs_complete'
  | 'under_review'
  | 'quote_sent'
  | 'quote_accepted'
  | 'quote_declined'
  | 'contract_sent'
  | 'contract_signed'
  | 'disbursed'
  | 'cancelled';

export type PartyType = 'buyer' | 'seller';

export type DocumentType =
  | 'id_document'
  | 'proof_of_address'
  | 'bank_statement'
  | 'vehicle_registration'
  | 'vehicle_photo'
  | 'contract';

export type VehiclePhotoAngle =
  | 'FRONT_VIEW'
  | 'REAR_VIEW'
  | 'LEFT_SIDE'
  | 'RIGHT_SIDE'
  | 'FRONT_LEFT_ANGLE'
  | 'FRONT_RIGHT_ANGLE'
  | 'ODOMETER'
  | 'INTERIOR_DASHBOARD'
  | 'VIN_CHASSIS';

export const MANDATORY_VEHICLE_ANGLES: VehiclePhotoAngle[] = [
  'FRONT_VIEW',
  'REAR_VIEW',
  'LEFT_SIDE',
  'RIGHT_SIDE',
  'FRONT_LEFT_ANGLE',
  'FRONT_RIGHT_ANGLE',
  'ODOMETER',
  'INTERIOR_DASHBOARD',
  'VIN_CHASSIS',
];

// ---------------------------------------------------------------------------
// Conversation / flow state types
// ---------------------------------------------------------------------------

export type BuyerStep =
  | 'WELCOME'
  | 'CONSENT'
  | 'ID_UPLOAD'
  | 'POA_UPLOAD'
  | 'BANK_STATEMENT_UPLOAD'
  | 'DATA_CONFIRMATION'
  | 'SELLER_DETAILS'
  | 'WAITING_FOR_QUOTE'
  | 'QUOTE_REVIEW'
  | 'CONTRACT_SIGNING'
  | 'DONE';

export type SellerStep =
  | 'WELCOME'
  | 'CONSENT'
  | 'ID_UPLOAD'
  | 'VEHICLE_DOC_UPLOAD'
  | 'VEHICLE_PHOTOS'
  | 'DATA_CONFIRMATION'
  | 'WAITING_FOR_CONTRACT'
  | 'CONTRACT_SIGNING'
  | 'DONE';

export type FlowStep = BuyerStep | SellerStep;

/** Persisted record in the conversation_states table */
export interface ConversationState {
  phone: string;
  party_type: PartyType;
  current_step: FlowStep;
  deal_id: string | null;
  last_activity: string; // ISO timestamp
  context: ConversationContext;
}

/** Free-form JSONB context stored alongside state */
export interface ConversationContext {
  /** Photos received so far (seller flow) */
  photos_received?: VehiclePhotoAngle[];
  /** Confirmed extracted data awaiting user approval */
  extracted_data?: Record<string, unknown>;
  /** Seller's WhatsApp number (collected during buyer flow) */
  seller_phone?: string;
  /** Whether the user consented to terms */
  consented?: boolean;
  /** Number of reminder messages sent */
  reminders_sent?: number;
  /** Arbitrary extra fields */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Flow handler return type
// ---------------------------------------------------------------------------

export interface FlowResult {
  nextStep: FlowStep;
  /** Messages to send back to the user */
  responses: BotResponse[];
  /** Optional deal state updates */
  dealUpdate?: Partial<{ status: DealStatus; [key: string]: unknown }>;
}

export type BotResponse =
  | { type: 'text'; text: string }
  | { type: 'interactive'; body: string; buttons: Array<{ id: string; title: string }> }
  | { type: 'image'; url: string; caption?: string }
  | { type: 'document'; url: string; filename: string; caption?: string };

// ---------------------------------------------------------------------------
// Notification types
// ---------------------------------------------------------------------------

export type ReminderType = 'upload_pending' | 'quote_pending' | 'contract_pending' | 'generic';

export interface QuoteData {
  loanAmount: number;
  interestRate: number;
  termMonths: number;
  monthlyInstalment: number;
  totalRepayable: number;
  expiresAt: string;
}
