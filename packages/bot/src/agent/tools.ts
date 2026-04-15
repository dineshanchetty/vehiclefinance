import Anthropic from '@anthropic-ai/sdk';

// The full set of tools available to the Vehicle Finance agent
export const AGENT_TOOLS: Anthropic.Tool[] = [
  // ── Deal information ───────────────────────────────────────────────────────
  {
    name: 'get_deal_info',
    description:
      'Fetch the current deal state including buyer info, seller info, vehicle info, and deal status. Always call this at the start of a conversation to understand the current state.',
    input_schema: {
      type: 'object' as const,
      properties: {
        phone: {
          type: 'string',
          description: 'The phone number of the buyer or seller',
        },
        party_type: {
          type: 'string',
          enum: ['buyer', 'seller'],
          description: 'Whether the phone belongs to a buyer or seller',
        },
      },
      required: ['phone', 'party_type'],
    },
  },
  {
    name: 'update_deal_status',
    description:
      'Update the status of a deal. Valid statuses: new, popia_consent_pending, id_uploaded, address_uploaded, statements_uploaded, seller_details_captured, under_review, quote_sent, quote_accepted, quote_declined, contract_sent, seller_onboarding, seller_docs_complete, completed, cancelled.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
        status: { type: 'string', description: 'The new status value' },
      },
      required: ['deal_id', 'status'],
    },
  },

  // ── Document handling ──────────────────────────────────────────────────────
  {
    name: 'store_document',
    description:
      'Record an uploaded document in the database after downloading from Dialog360 and storing in Supabase Storage. Returns a document ID for subsequent extraction.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
        party_type: {
          type: 'string',
          enum: ['buyer', 'seller'],
          description: 'Whether this document belongs to the buyer or seller',
        },
        document_type: {
          type: 'string',
          enum: ['id_document', 'proof_of_address', 'bank_statement', 'natis', 'registration', 'other'],
          description: 'The type of document',
        },
        media_id: {
          type: 'string',
          description: 'The Dialog360 media ID from the incoming webhook',
        },
        mime_type: {
          type: 'string',
          description: 'The MIME type of the file (e.g. image/jpeg, application/pdf)',
        },
      },
      required: ['deal_id', 'party_type', 'document_type', 'media_id'],
    },
  },
  {
    name: 'trigger_extraction',
    description:
      'Trigger data extraction for a document that has been stored. Creates an extraction task and returns a task ID. The extraction may take a few seconds.',
    input_schema: {
      type: 'object' as const,
      properties: {
        document_id: { type: 'string', description: 'The document UUID returned by store_document' },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_extraction_results',
    description:
      'Fetch the extraction results for a document. Returns extracted fields and confidence scores. If the extraction is still pending, status will be "pending" — try again in a moment.',
    input_schema: {
      type: 'object' as const,
      properties: {
        document_id: { type: 'string', description: 'The document UUID' },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'confirm_buyer_data',
    description:
      'Mark extracted buyer fields as confirmed by the buyer. Call this after the buyer reviews extracted data and says it is correct.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
        document_id: { type: 'string', description: 'The document UUID' },
        confirmed_fields: {
          type: 'object',
          description: 'Key-value pairs of confirmed field names and their values',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['deal_id', 'document_id', 'confirmed_fields'],
    },
  },
  {
    name: 'confirm_seller_data',
    description:
      'Mark extracted seller fields as confirmed by the seller. Call this after the seller reviews extracted data and says it is correct.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
        document_id: { type: 'string', description: 'The document UUID' },
        confirmed_fields: {
          type: 'object',
          description: 'Key-value pairs of confirmed field names and their values',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['deal_id', 'document_id', 'confirmed_fields'],
    },
  },

  // ── Vehicle photos ─────────────────────────────────────────────────────────
  {
    name: 'store_vehicle_photo',
    description:
      'Record a vehicle photo with its angle classification. Downloads from Dialog360 and stores in Supabase Storage.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
        angle: {
          type: 'string',
          enum: [
            'front',
            'rear',
            'driver_side',
            'passenger_side',
            'interior_front',
            'interior_rear',
            'engine_bay',
            'boot',
            'odometer',
          ],
          description: 'The angle/view of the photo',
        },
        media_id: {
          type: 'string',
          description: 'The Dialog360 media ID from the incoming webhook',
        },
        mime_type: {
          type: 'string',
          description: 'The MIME type (e.g. image/jpeg)',
        },
      },
      required: ['deal_id', 'angle', 'media_id'],
    },
  },
  {
    name: 'get_photo_progress',
    description:
      'Check which mandatory vehicle photo angles have been received and which are still missing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
      },
      required: ['deal_id'],
    },
  },
  {
    name: 'trigger_photo_evaluation',
    description:
      'Trigger an AI quality evaluation of the vehicle photo set once all 9 mandatory angles are received.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
      },
      required: ['deal_id'],
    },
  },
  {
    name: 'get_photo_evaluation',
    description:
      'Fetch the AI photo evaluation results. Returns quality scores and any issues per photo angle.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
      },
      required: ['deal_id'],
    },
  },

  // ── Messaging ──────────────────────────────────────────────────────────────
  {
    name: 'send_whatsapp_message',
    description:
      'Send a WhatsApp text message to a phone number via Dialog360. Use this when you need to send a message to a different number than the current conversation (e.g. to notify the seller from the buyer conversation).',
    input_schema: {
      type: 'object' as const,
      properties: {
        phone: { type: 'string', description: 'The recipient phone number with country code' },
        message: { type: 'string', description: 'The message text' },
      },
      required: ['phone', 'message'],
    },
  },
  {
    name: 'send_sms',
    description:
      'Send an SMS via BulkSMS. Use as a fallback when WhatsApp delivery is uncertain or for important notifications.',
    input_schema: {
      type: 'object' as const,
      properties: {
        phone: { type: 'string', description: 'The recipient phone number with country code' },
        message: { type: 'string', description: 'The SMS text (max 160 chars recommended)' },
      },
      required: ['phone', 'message'],
    },
  },
  {
    name: 'send_email',
    description: 'Send an email via SendGrid.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject' },
        html_body: { type: 'string', description: 'HTML body of the email' },
      },
      required: ['to', 'subject', 'html_body'],
    },
  },

  // ── Operations ─────────────────────────────────────────────────────────────
  {
    name: 'create_task',
    description:
      'Create an internal ops task in the task queue. Use when something requires human intervention or is outside the bot\'s capability.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID (optional)' },
        task_type: {
          type: 'string',
          description: 'Category of the task (e.g. manual_review, customer_query, document_issue)',
        },
        description: { type: 'string', description: 'What needs to be done' },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'urgent'],
          description: 'Task priority',
        },
      },
      required: ['task_type', 'description'],
    },
  },
  {
    name: 'log_audit_event',
    description:
      'Log a significant event to the audit trail. Use for POPIA consent, document confirmations, status changes, and important user decisions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID (optional)' },
        phone: { type: 'string', description: 'The phone number involved' },
        event_type: {
          type: 'string',
          description: 'Event category (e.g. popia_consent, document_confirmed, quote_accepted)',
        },
        description: { type: 'string', description: 'Human-readable description of the event' },
        metadata: {
          type: 'object',
          description: 'Any additional data to record',
          additionalProperties: true,
        },
      },
      required: ['event_type', 'description'],
    },
  },
  {
    name: 'get_conversation_history',
    description:
      'Retrieve the last N messages from the conversation history for a phone number.',
    input_schema: {
      type: 'object' as const,
      properties: {
        phone: { type: 'string', description: 'The phone number' },
        limit: {
          type: 'number',
          description: 'Number of messages to retrieve (default 20)',
        },
      },
      required: ['phone'],
    },
  },

  // ── Seller onboarding ──────────────────────────────────────────────────────
  {
    name: 'store_seller_details',
    description:
      'Store seller contact details and vehicle information, and trigger seller onboarding via WhatsApp.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
        seller_name: { type: 'string', description: 'Full name of the seller' },
        seller_phone: { type: 'string', description: 'Seller\'s WhatsApp phone number with country code' },
        vehicle_make: { type: 'string', description: 'Vehicle make (e.g. Toyota)' },
        vehicle_model: { type: 'string', description: 'Vehicle model (e.g. Hilux)' },
        vehicle_year: { type: 'number', description: 'Vehicle year (e.g. 2020)' },
        vehicle_price: { type: 'number', description: 'Agreed sale price in ZAR' },
      },
      required: ['deal_id', 'seller_name', 'seller_phone'],
    },
  },

  // ── Quote & contract ───────────────────────────────────────────────────────
  {
    name: 'present_quote',
    description:
      'Format and send a finance quote to the buyer. Fetches the latest quote from the database and presents it clearly.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
        buyer_phone: { type: 'string', description: 'The buyer\'s phone number' },
      },
      required: ['deal_id', 'buyer_phone'],
    },
  },
  {
    name: 'record_quote_response',
    description:
      'Record the buyer\'s accept or decline response to a finance quote.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
        response: {
          type: 'string',
          enum: ['accepted', 'declined'],
          description: 'The buyer\'s decision',
        },
      },
      required: ['deal_id', 'response'],
    },
  },
  {
    name: 'send_contract_link',
    description:
      'Send the e-signature contract link to a buyer or seller via WhatsApp.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
        phone: { type: 'string', description: 'The recipient phone number' },
        party_type: {
          type: 'string',
          enum: ['buyer', 'seller'],
          description: 'Whether sending to buyer or seller',
        },
      },
      required: ['deal_id', 'phone', 'party_type'],
    },
  },
];
