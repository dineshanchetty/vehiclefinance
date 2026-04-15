import { downloadAndStoreMedia, sendTextMessage } from '../services/dialog360.js';
import { sendSMS as bulkSmsSend } from '../services/bulksms.js';
import { sendEmail as sgSendEmail } from '../services/sendgrid.js';
import {
  getDealByBuyerPhone,
  getDealBySellerPhone,
  getDealById,
  updateDealStatus as dbUpdateDealStatus,
  storeDocument as dbStoreDocument,
  createExtractionTask,
  getExtractionResult,
  updateDocumentExtraction,
  storeVehiclePhoto as dbStoreVehiclePhoto,
  getVehiclePhotos,
  createOpsTask,
  logAuditEvent as dbLogAuditEvent,
  storeSellerDetails as dbStoreSellerDetails,
  getLatestQuote,
  recordQuoteResponse as dbRecordQuoteResponse,
  getContract,
} from '../services/supabase.js';

const MANDATORY_ANGLES = [
  'front',
  'rear',
  'driver_side',
  'passenger_side',
  'interior_front',
  'interior_rear',
  'engine_bay',
  'boot',
  'odometer',
] as const;

type ToolInput = Record<string, unknown>;
type ToolResult = { success: boolean; [key: string]: unknown };

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function handle_get_deal_info(input: ToolInput): Promise<ToolResult> {
  const { phone, party_type } = input as { phone: string; party_type: 'buyer' | 'seller' };
  const deal =
    party_type === 'buyer'
      ? await getDealByBuyerPhone(phone)
      : await getDealBySellerPhone(phone);

  if (!deal) {
    return { success: false, error: 'No active deal found for this phone number' };
  }
  return { success: true, deal };
}

export async function handle_update_deal_status(input: ToolInput): Promise<ToolResult> {
  const { deal_id, status } = input as { deal_id: string; status: string };
  const VALID_STATUSES = [
    'new', 'popia_consent_pending', 'id_uploaded', 'address_uploaded',
    'statements_uploaded', 'seller_details_captured', 'under_review',
    'quote_sent', 'quote_accepted', 'quote_declined', 'contract_sent',
    'seller_onboarding', 'seller_docs_complete', 'completed', 'cancelled',
  ];
  if (!VALID_STATUSES.includes(status)) {
    return { success: false, error: `Invalid status "${status}". Valid statuses: ${VALID_STATUSES.join(', ')}` };
  }
  const updated = await dbUpdateDealStatus(deal_id, status);
  return { success: true, deal: updated };
}

export async function handle_store_document(input: ToolInput): Promise<ToolResult> {
  const { deal_id, party_type, document_type, media_id, mime_type } = input as {
    deal_id: string;
    party_type: 'buyer' | 'seller';
    document_type: string;
    media_id: string;
    mime_type?: string;
  };

  const ext = mime_type?.split('/')[1] ?? 'bin';
  const storagePath = `documents/${deal_id}/${party_type}/${document_type}_${Date.now()}.${ext}`;

  const { publicUrl } = await downloadAndStoreMedia(media_id, storagePath);

  const doc = await dbStoreDocument({
    deal_id,
    party_type,
    document_type,
    storage_path: publicUrl,
    mime_type,
  });

  return { success: true, document_id: doc.id, storage_path: publicUrl };
}

export async function handle_trigger_extraction(input: ToolInput): Promise<ToolResult> {
  const { document_id } = input as { document_id: string };
  const task = await createExtractionTask(document_id);
  // In production, this would publish to a queue. For now, it creates a pending task.
  return { success: true, task_id: task.id, message: 'Extraction task created. Check results in a moment.' };
}

export async function handle_get_extraction_results(input: ToolInput): Promise<ToolResult> {
  const { document_id } = input as { document_id: string };
  const result = await getExtractionResult(document_id);
  if (!result) {
    return { success: false, error: 'Document not found' };
  }
  if (result.status !== 'extracted') {
    return { success: true, status: result.status ?? 'pending', message: 'Extraction still in progress. Please try again in a moment.' };
  }
  return {
    success: true,
    status: 'extracted',
    extracted_data: result.extracted_data,
    confidence_scores: result.confidence_scores,
  };
}

export async function handle_confirm_buyer_data(input: ToolInput): Promise<ToolResult> {
  const { deal_id, document_id, confirmed_fields } = input as {
    deal_id: string;
    document_id: string;
    confirmed_fields: Record<string, string>;
  };
  await updateDocumentExtraction(document_id, confirmed_fields, {});
  await dbLogAuditEvent({
    deal_id,
    event_type: 'buyer_data_confirmed',
    description: `Buyer confirmed fields: ${Object.keys(confirmed_fields).join(', ')}`,
    metadata: { document_id, confirmed_fields },
  });
  return { success: true, message: 'Buyer data confirmed and stored.' };
}

export async function handle_confirm_seller_data(input: ToolInput): Promise<ToolResult> {
  const { deal_id, document_id, confirmed_fields } = input as {
    deal_id: string;
    document_id: string;
    confirmed_fields: Record<string, string>;
  };
  await updateDocumentExtraction(document_id, confirmed_fields, {});
  await dbLogAuditEvent({
    deal_id,
    event_type: 'seller_data_confirmed',
    description: `Seller confirmed fields: ${Object.keys(confirmed_fields).join(', ')}`,
    metadata: { document_id, confirmed_fields },
  });
  return { success: true, message: 'Seller data confirmed and stored.' };
}

export async function handle_store_vehicle_photo(input: ToolInput): Promise<ToolResult> {
  const { deal_id, angle, media_id, mime_type } = input as {
    deal_id: string;
    angle: string;
    media_id: string;
    mime_type?: string;
  };

  const ext = mime_type?.split('/')[1] ?? 'jpg';
  const storagePath = `vehicle-photos/${deal_id}/${angle}_${Date.now()}.${ext}`;

  const { publicUrl } = await downloadAndStoreMedia(media_id, storagePath);

  const photo = await dbStoreVehiclePhoto({
    deal_id,
    angle,
    storage_path: publicUrl,
  });

  return { success: true, photo_id: photo.id, angle, storage_path: publicUrl };
}

export async function handle_get_photo_progress(input: ToolInput): Promise<ToolResult> {
  const { deal_id } = input as { deal_id: string };
  const photos = await getVehiclePhotos(deal_id);
  const receivedAngles = photos.map((p: { angle: string }) => p.angle);
  const missingAngles = MANDATORY_ANGLES.filter((a) => !receivedAngles.includes(a));

  return {
    success: true,
    total_required: MANDATORY_ANGLES.length,
    received: receivedAngles.length,
    received_angles: receivedAngles,
    missing_angles: missingAngles,
    complete: missingAngles.length === 0,
  };
}

export async function handle_trigger_photo_evaluation(input: ToolInput): Promise<ToolResult> {
  const { deal_id } = input as { deal_id: string };
  // Placeholder: in production this publishes to a vision evaluation queue
  await createOpsTask({
    deal_id,
    task_type: 'photo_evaluation',
    description: `Trigger photo quality evaluation for deal ${deal_id}`,
    priority: 'normal',
    metadata: { deal_id },
  });
  return { success: true, message: 'Photo evaluation triggered. Results will be available shortly.' };
}

export async function handle_get_photo_evaluation(input: ToolInput): Promise<ToolResult> {
  const { deal_id } = input as { deal_id: string };
  const { getSupabaseClient } = await import('../services/supabase.js');
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('photo_evaluations')
    .select('*')
    .eq('deal_id', deal_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  if (!data) {
    return { success: true, status: 'pending', message: 'Evaluation not yet complete.' };
  }
  return { success: true, evaluation: data };
}

export async function handle_send_whatsapp_message(input: ToolInput): Promise<ToolResult> {
  const { phone, message } = input as { phone: string; message: string };
  await sendTextMessage(phone, message);
  return { success: true, message: `WhatsApp message sent to ${phone}` };
}

export async function handle_send_sms(input: ToolInput): Promise<ToolResult> {
  const { phone, message } = input as { phone: string; message: string };
  await bulkSmsSend(phone, message);
  return { success: true, message: `SMS sent to ${phone}` };
}

export async function handle_send_email(input: ToolInput): Promise<ToolResult> {
  const { to, subject, html_body } = input as { to: string; subject: string; html_body: string };
  await sgSendEmail(to, subject, html_body);
  return { success: true, message: `Email sent to ${to}` };
}

export async function handle_create_task(input: ToolInput): Promise<ToolResult> {
  const { deal_id, task_type, description, priority } = input as {
    deal_id?: string;
    task_type: string;
    description: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  };
  const task = await createOpsTask({ deal_id, task_type, description, priority });
  return { success: true, task_id: task.id, message: 'Task created and assigned to the ops team.' };
}

export async function handle_log_audit_event(input: ToolInput): Promise<ToolResult> {
  const { deal_id, phone, event_type, description, metadata } = input as {
    deal_id?: string;
    phone?: string;
    event_type: string;
    description: string;
    metadata?: Record<string, unknown>;
  };
  await dbLogAuditEvent({ deal_id, phone, event_type, description, metadata });
  return { success: true };
}

export async function handle_get_conversation_history(input: ToolInput): Promise<ToolResult> {
  const { phone, limit = 20 } = input as { phone: string; limit?: number };
  const { getSupabaseClient } = await import('../services/supabase.js');
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('conversation_messages')
    .select('role, content, created_at')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return { success: true, messages: (data ?? []).reverse() };
}

export async function handle_store_seller_details(input: ToolInput): Promise<ToolResult> {
  const {
    deal_id,
    seller_name,
    seller_phone,
    vehicle_make,
    vehicle_model,
    vehicle_year,
    vehicle_price,
  } = input as {
    deal_id: string;
    seller_name: string;
    seller_phone: string;
    vehicle_make?: string;
    vehicle_model?: string;
    vehicle_year?: number;
    vehicle_price?: number;
  };

  await dbStoreSellerDetails(deal_id, {
    name: seller_name,
    phone: seller_phone,
    vehicle_make,
    vehicle_model,
    vehicle_year,
    vehicle_price,
  });

  // Send onboarding message to seller
  const onboardingMsg =
    `Hi ${seller_name}! 👋 A buyer has applied for vehicle finance to purchase your vehicle. ` +
    `I'm your vehicle finance assistant and I'll guide you through the process right here on WhatsApp. ` +
    `It only takes about 10 minutes. Shall we get started?`;

  await sendTextMessage(seller_phone, onboardingMsg);

  return {
    success: true,
    message: `Seller details stored. Onboarding message sent to ${seller_phone}.`,
  };
}

export async function handle_present_quote(input: ToolInput): Promise<ToolResult> {
  const { deal_id, buyer_phone } = input as { deal_id: string; buyer_phone: string };
  const quote = await getLatestQuote(deal_id);
  if (!quote) {
    return { success: false, error: 'No quote found for this deal' };
  }

  const quoteMessage =
    `🎉 Great news! Your finance quote is ready:\n\n` +
    `• Monthly instalment: R${Number(quote.monthly_instalment).toLocaleString('en-ZA')}\n` +
    `• Term: ${quote.term_months} months\n` +
    `• Interest rate: ${quote.interest_rate}% per annum\n` +
    `• Total repayable: R${Number(quote.total_repayable).toLocaleString('en-ZA')}\n\n` +
    `Reply *ACCEPT* to accept this offer or *DECLINE* to decline.`;

  await sendTextMessage(buyer_phone, quoteMessage);
  await dbUpdateDealStatus(deal_id, 'quote_sent');

  return { success: true, quote_id: quote.id, message: 'Quote sent to buyer.' };
}

export async function handle_record_quote_response(input: ToolInput): Promise<ToolResult> {
  const { deal_id, response } = input as {
    deal_id: string;
    response: 'accepted' | 'declined';
  };
  const quote = await getLatestQuote(deal_id);
  if (!quote) {
    return { success: false, error: 'No quote found for this deal' };
  }
  await dbRecordQuoteResponse(quote.id, response);
  await dbUpdateDealStatus(deal_id, response === 'accepted' ? 'quote_accepted' : 'quote_declined');
  await dbLogAuditEvent({
    deal_id,
    event_type: `quote_${response}`,
    description: `Buyer ${response} the finance quote`,
    metadata: { quote_id: quote.id },
  });
  return { success: true, message: `Quote ${response} recorded.` };
}

export async function handle_send_contract_link(input: ToolInput): Promise<ToolResult> {
  const { deal_id, phone, party_type } = input as {
    deal_id: string;
    phone: string;
    party_type: 'buyer' | 'seller';
  };
  const contract = await getContract(deal_id);
  if (!contract) {
    return { success: false, error: 'No contract found for this deal' };
  }

  const signingUrl =
    party_type === 'buyer' ? contract.buyer_signing_url : contract.seller_signing_url;

  if (!signingUrl) {
    return { success: false, error: `No ${party_type} signing URL available yet` };
  }

  const contractMsg =
    `📄 Your contract is ready to sign!\n\n` +
    `Please click the link below to review and sign your vehicle finance contract:\n` +
    `${signingUrl}\n\n` +
    `The link is valid for 48 hours. Let me know if you have any questions.`;

  await sendTextMessage(phone, contractMsg);
  await dbUpdateDealStatus(deal_id, 'contract_sent');

  return { success: true, message: `Contract signing link sent to ${phone}` };
}

// ── Dispatch map ──────────────────────────────────────────────────────────────

export const TOOL_HANDLERS: Record<string, (input: ToolInput) => Promise<ToolResult>> = {
  get_deal_info: handle_get_deal_info,
  update_deal_status: handle_update_deal_status,
  store_document: handle_store_document,
  trigger_extraction: handle_trigger_extraction,
  get_extraction_results: handle_get_extraction_results,
  confirm_buyer_data: handle_confirm_buyer_data,
  confirm_seller_data: handle_confirm_seller_data,
  store_vehicle_photo: handle_store_vehicle_photo,
  get_photo_progress: handle_get_photo_progress,
  trigger_photo_evaluation: handle_trigger_photo_evaluation,
  get_photo_evaluation: handle_get_photo_evaluation,
  send_whatsapp_message: handle_send_whatsapp_message,
  send_sms: handle_send_sms,
  send_email: handle_send_email,
  create_task: handle_create_task,
  log_audit_event: handle_log_audit_event,
  get_conversation_history: handle_get_conversation_history,
  store_seller_details: handle_store_seller_details,
  present_quote: handle_present_quote,
  record_quote_response: handle_record_quote_response,
  send_contract_link: handle_send_contract_link,
};
