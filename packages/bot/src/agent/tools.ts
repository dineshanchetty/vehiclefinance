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
          enum: [
            'SA_ID_SMART_CARD',
            'SA_ID_GREEN_BOOK',
            'PROOF_OF_ADDRESS',
            'BANK_STATEMENT',
            'PAYSLIP',
            'VEHICLE_NATIS',
            'VEHICLE_REGISTRATION',
            'SETTLEMENT_LETTER',
            'VEHICLE_PHOTO',
            'OTHER',
          ],
          description:
            'Canonical document type. Must be one of the listed enum values (the database enforces this enum). Examples: a smart-card ID = SA_ID_SMART_CARD, a green book = SA_ID_GREEN_BOOK, a utility bill or municipal letter = PROOF_OF_ADDRESS, a bank statement (any of the 3) = BANK_STATEMENT, NATIS = VEHICLE_NATIS, vehicle registration papers = VEHICLE_REGISTRATION.',
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
    name: 'bulk_populate_from_otp',
    description:
      'Single-call helper for the OTP-first flow. After get_extraction_results returns OTP fields, pass them ALL into this tool — it splits them into buyer/seller/vehicle/deal records in one transaction so you don\'t have to call update_buyer_record / update_seller_record / update_vehicle_record separately. Use this ONLY for OTP documents. Returns the deal_id and what was populated.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
        otp_fields: {
          type: 'object',
          description: 'Extracted OTP fields exactly as returned by get_extraction_results — keys like buyer_full_name, buyer_id_number, seller_full_name, seller_phone, vehicle_make, vehicle_year, vehicle_vin, agreed_price, etc.',
          additionalProperties: true,
        },
      },
      required: ['deal_id', 'otp_fields'],
    },
  },
  {
    name: 'verify_document_against_buyer',
    description:
      'Cross-check that an extracted document genuinely belongs to the buyer on this deal. Call this RIGHT AFTER get_extraction_results returns fields, BEFORE update_buyer_record. Compares against the buyer record (which was bootstrapped from the Offer To Purchase). Returns { matches, mismatches: [...], severity: ok|warning|reject, action }. If severity is "reject" you MUST NOT save the data — show the user a 3-button message: Re-upload / Update OTP / Talk to consultant. If "warning" (small typo / fuzzy name match) — proceed but mention the discrepancy in the confirmation message.\n\nChecks per doc type:\n  - SA_ID_SMART_CARD / SA_ID_GREEN_BOOK: id_number must match the buyer.id_number from the OTP (strict). full_name should fuzzy-match (token overlap).\n  - PROOF_OF_ADDRESS: account_holder_name should fuzzy-match buyer.full_name. Document date must be within 90 days.\n  - BANK_STATEMENT: account_holder should fuzzy-match buyer.full_name. account_type must be "personal" (business is rejected by the edge fn already; this is a second check).',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id:   { type: 'string', description: 'The deal UUID' },
        doc_type:  {
          type: 'string',
          enum: ['SA_ID_SMART_CARD','SA_ID_GREEN_BOOK','PROOF_OF_ADDRESS','BANK_STATEMENT'],
        },
        extracted: {
          type: 'object',
          description: 'The extracted fields object as returned by get_extraction_results.',
          additionalProperties: true,
        },
      },
      required: ['deal_id', 'doc_type', 'extracted'],
    },
  },
  {
    name: 'update_vehicle_record',
    description:
      'Write or update vehicle details on the deal record. Vehicles table has: make, model, year, registration_number, vin, engine_number, colour, asking_price (Rands), odometer_reading. Use after extraction OR for manual capture. Pass only fields you have.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
        fields: {
          type: 'object',
          properties: {
            make:                  { type: 'string' },
            model:                 { type: 'string' },
            year:                  { type: 'integer' },
            registration_number:   { type: 'string' },
            vin:                   { type: 'string', description: '17-char VIN' },
            engine_number:         { type: 'string' },
            colour:                { type: 'string' },
            asking_price:          { type: 'number', description: 'Agreed price in Rands' },
            odometer_reading:      { type: 'string', description: 'kilometres as a string' },
          },
          additionalProperties: false,
        },
        source: { type: 'string', enum: ['extraction', 'manual_entry', 'mixed'] },
      },
      required: ['deal_id', 'fields'],
    },
  },
  {
    name: 'update_buyer_record',
    description:
      'Write or update buyer details on the deal record. Use this both (a) after the buyer confirms extracted ID / address / bank-statement data, and (b) as a MANUAL FALLBACK when extraction fails or the buyer prefers to type the details themselves. Pass only the fields you have right now — partial updates are fine, you can call this multiple times. Always use this rather than skipping a step or escalating when the buyer is willing to type the data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
        fields: {
          type: 'object',
          description: 'Buyer columns to set. Allowed keys: full_name, id_number, date_of_birth (YYYY-MM-DD), gender, nationality, email, physical_address, suburb, city, postal_code, employer_name, employment_duration, monthly_income.',
          properties: {
            full_name:           { type: 'string' },
            id_number:           { type: 'string', description: '13-digit SA ID, or passport number' },
            date_of_birth:       { type: 'string', description: 'ISO date YYYY-MM-DD' },
            gender:              { type: 'string', enum: ['male','female','other'] },
            nationality:         { type: 'string', description: 'ISO-3 country code or full name (e.g. ZAF or "South African")' },
            email:               { type: 'string' },
            physical_address:    { type: 'string' },
            suburb:              { type: 'string' },
            city:                { type: 'string' },
            postal_code:         { type: 'string' },
            employer_name:       { type: 'string' },
            employment_duration: { type: 'string', description: 'e.g. "3 years" or months as number' },
            monthly_income:      { type: 'number', description: 'Net monthly income in Rands' },
          },
          additionalProperties: false,
        },
        source: {
          type: 'string',
          enum: ['extraction', 'manual_entry', 'mixed'],
          description: 'How the data was obtained — used for the audit trail.',
        },
      },
      required: ['deal_id', 'fields'],
    },
  },
  {
    name: 'update_seller_record',
    description:
      'Same as update_buyer_record but for the seller. Use after extraction OR as manual fallback when the seller types details directly.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
        fields: {
          type: 'object',
          description: 'Seller columns to set. Allowed keys: full_name, id_number, date_of_birth, email, physical_address, suburb, city, postal_code.',
          additionalProperties: true,
        },
        source: {
          type: 'string',
          enum: ['extraction', 'manual_entry', 'mixed'],
        },
      },
      required: ['deal_id', 'fields'],
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
      'Record a vehicle photo, downloading from Dialog360 and storing in Supabase Storage. Pass angle="auto" (or omit) and the bot will classify the image with Claude Vision into one of the 9 mandatory angles. Returns the classified angle plus remaining missing angles so you can update the seller in one reply.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
        angle: {
          type: 'string',
          enum: [
            'auto',
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
          description: 'Pass "auto" (default) to let Claude Vision classify. Only override when the seller explicitly told you which angle they\'re sending.',
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
      required: ['deal_id', 'media_id'],
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

  // ── Phase / state machine ─────────────────────────────────────────────────
  {
    name: 'get_deal_phase',
    description:
      'Read the structured phase state for a deal. ALWAYS call this at the start of every conversation turn so you know exactly where the user is in the flow. Returns { phase, state, completed_milestones }. If no deal exists for this user, this returns { phase: "POPIA_CONSENT", state: {}, completed_milestones: [], deal_id: null } — that means treat the user as a new buyer at step 1.',
    input_schema: {
      type: 'object' as const,
      properties: {
        phone: { type: 'string', description: 'The user\'s phone number (E.164 without +). Use the runtime conversation phone you were given in the system prompt.' },
      },
      required: ['phone'],
    },
  },
  {
    name: 'advance_deal_phase',
    description:
      'Advance a deal to the next phase ONLY after the current phase\'s acceptance criteria are met. Records the milestone, optionally captures phase data into phase_state, and updates current_phase. Acceptance criteria are listed in your system prompt — never skip a phase or advance without them.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id:   { type: 'string', description: 'The deal UUID' },
        to_phase:  {
          type: 'string',
          description: 'The new phase to move to.',
          enum: [
            'POPIA_CONSENT', 'PRICE_GATE', 'ID_DOC', 'PROOF_OF_ADDRESS',
            'BANK_STATEMENTS', 'AFFORDABILITY', 'CREDIT_DECISION',
            'SELLER_DETAILS', 'INSPECTION_REVIEW', 'QUOTE', 'CONTRACT',
            'HANDOVER', 'PAYOUT', 'DONE',
          ],
        },
        milestone: { type: 'string', description: 'Milestone key being completed by this advance, e.g. "popia_consent", "price_captured", "id_verified".' },
        capture:   { type: 'object', additionalProperties: true, description: 'Optional small values to merge into phase_state, e.g. {"agreed_price": 250000}.' },
      },
      required: ['deal_id', 'to_phase', 'milestone'],
    },
  },

  // ── Messaging ──────────────────────────────────────────────────────────────
  {
    name: 'send_whatsapp_message',
    description:
      'Send a WhatsApp text message to a phone number via Dialog360. Use this when you need to send a message to a different number than the current conversation (e.g. to notify the seller from the buyer conversation). For yes/no choices prefer send_buttons; for menus of 4–10 options prefer send_list.',
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
    name: 'send_buttons',
    description:
      'Send a WhatsApp interactive message with up to 3 reply buttons. PREFER this over plain text whenever the next step is a small set of choices (yes/no, accept/decline, agree/disagree, retry/skip). The user taps a button and you receive their choice as the next message. Reduces typos and speeds up the flow dramatically.',
    input_schema: {
      type: 'object' as const,
      properties: {
        phone:   { type: 'string', description: 'Recipient phone number (E.164 without leading +)' },
        body:    { type: 'string', description: 'Main message text shown above the buttons (≤1024 chars)' },
        buttons: {
          type: 'array',
          maxItems: 3,
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              id:    { type: 'string', description: 'Stable id you receive back when tapped (e.g. "agree", "yes", "retake")' },
              title: { type: 'string', description: 'Visible button label (≤20 chars)' },
            },
            required: ['id', 'title'],
          },
        },
        header: { type: 'string', description: 'Optional short header text (≤60 chars)' },
        footer: { type: 'string', description: 'Optional footer text (≤60 chars)' },
      },
      required: ['phone', 'body', 'buttons'],
    },
  },
  {
    name: 'send_list',
    description:
      'Send a WhatsApp interactive list (tap-to-open menu) with up to 10 rows across optional sections. USE THIS for: document type pickers, photo angle pickers, deal-status menus, "what would you like to do" hubs, FAQ topic pickers. Prefer over free text when there are 4+ structured choices.',
    input_schema: {
      type: 'object' as const,
      properties: {
        phone:       { type: 'string', description: 'Recipient phone number' },
        body:        { type: 'string', description: 'Body text shown above the menu trigger (≤1024 chars)' },
        button_text: { type: 'string', description: 'Label of the button that opens the list (≤20 chars), e.g. "Choose"' },
        sections: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Optional section header (≤24 chars)' },
              rows:  {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    id:          { type: 'string', description: 'Stable id returned when row is tapped' },
                    title:       { type: 'string', description: 'Row title (≤24 chars)' },
                    description: { type: 'string', description: 'Optional row subtitle (≤72 chars)' },
                  },
                  required: ['id', 'title'],
                },
              },
            },
            required: ['rows'],
          },
        },
        header: { type: 'string', description: 'Optional header text' },
        footer: { type: 'string', description: 'Optional footer text' },
      },
      required: ['phone', 'body', 'button_text', 'sections'],
    },
  },
  {
    name: 'notify_seller',
    description:
      'Trigger seller engagement on the deal: sends a WhatsApp introduction to the seller from the bot explaining their role and asking them to confirm. Call this AFTER the buyer has been credit-approved AND has provided seller contact details. The bot will then run the seller flow on that number — buyer should not have to coordinate this.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'string', description: 'The deal UUID' },
      },
      required: ['deal_id'],
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
