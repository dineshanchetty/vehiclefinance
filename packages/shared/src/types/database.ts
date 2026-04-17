// Auto-generated from the live Supabase project (sahvfsoclzgsuewbiiah) on 2026-04-17.
// Do not edit by hand — regenerate with `pnpm gen:types`.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          actor: string | null
          actor_type: string | null
          created_at: string
          deal_id: string | null
          details: Json | null
          event_type: string
          id: string
          ip_address: string | null
        }
        Insert: {
          actor?: string | null
          actor_type?: string | null
          created_at?: string
          deal_id?: string | null
          details?: Json | null
          event_type: string
          id?: string
          ip_address?: string | null
        }
        Update: {
          actor?: string | null
          actor_type?: string | null
          created_at?: string
          deal_id?: string | null
          details?: Json | null
          event_type?: string
          id?: string
          ip_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          created_at: string
          deal_id: string | null
          description: string | null
          event_type: string
          id: string
          metadata: Json | null
          phone: string | null
        }
        Insert: {
          created_at?: string
          deal_id?: string | null
          description?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          phone?: string | null
        }
        Update: {
          created_at?: string
          deal_id?: string | null
          description?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      buyers: {
        Row: {
          city: string | null
          consent_status: boolean
          consent_timestamp: string | null
          created_at: string
          date_of_birth: string | null
          deal_id: string
          email: string | null
          employer_name: string | null
          employment_duration: string | null
          full_name: string | null
          gender: string | null
          id: string
          id_number: string | null
          monthly_income: number | null
          nationality: string | null
          phone: string
          physical_address: string | null
          postal_code: string | null
          suburb: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          consent_status?: boolean
          consent_timestamp?: string | null
          created_at?: string
          date_of_birth?: string | null
          deal_id: string
          email?: string | null
          employer_name?: string | null
          employment_duration?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          id_number?: string | null
          monthly_income?: number | null
          nationality?: string | null
          phone: string
          physical_address?: string | null
          postal_code?: string | null
          suburb?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          consent_status?: boolean
          consent_timestamp?: string | null
          created_at?: string
          date_of_birth?: string | null
          deal_id?: string
          email?: string | null
          employer_name?: string | null
          employment_duration?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          id_number?: string | null
          monthly_income?: number | null
          nationality?: string | null
          phone?: string
          physical_address?: string | null
          postal_code?: string | null
          suburb?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyers_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at: string
          deal_id: string
          file_url: string | null
          generated_at: string | null
          id: string
          sent_at: string | null
          signatory_id_number: string | null
          signatory_name: string | null
          signature_status: Database["public"]["Enums"]["signature_status"]
          signed_at: string | null
          signing_link: string | null
          signing_provider_ref: string | null
          updated_at: string
        }
        Insert: {
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          deal_id: string
          file_url?: string | null
          generated_at?: string | null
          id?: string
          sent_at?: string | null
          signatory_id_number?: string | null
          signatory_name?: string | null
          signature_status?: Database["public"]["Enums"]["signature_status"]
          signed_at?: string | null
          signing_link?: string | null
          signing_provider_ref?: string | null
          updated_at?: string
        }
        Update: {
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          deal_id?: string
          file_url?: string | null
          generated_at?: string | null
          id?: string
          sent_at?: string | null
          signatory_id_number?: string | null
          signatory_name?: string | null
          signature_status?: Database["public"]["Enums"]["signature_status"]
          signed_at?: string | null
          signing_link?: string | null
          signing_provider_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          content: string | null
          created_at: string | null
          deal_id: string | null
          id: string
          party_type: string | null
          phone: string
          role: string
          tool_result: Json | null
          tool_use: Json | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          deal_id?: string | null
          id?: string
          party_type?: string | null
          phone: string
          role: string
          tool_result?: Json | null
          tool_use?: Json | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          deal_id?: string | null
          id?: string
          party_type?: string | null
          phone?: string
          role?: string
          tool_result?: Json | null
          tool_use?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      damage_assessments: {
        Row: {
          confidence: number | null
          created_at: string
          damage_type: string | null
          deal_id: string
          description: string | null
          id: string
          location: string | null
          photo_reference: string | null
          severity: Database["public"]["Enums"]["damage_severity"] | null
          source: Database["public"]["Enums"]["damage_source"]
          source_reference_id: string | null
          vehicle_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          damage_type?: string | null
          deal_id: string
          description?: string | null
          id?: string
          location?: string | null
          photo_reference?: string | null
          severity?: Database["public"]["Enums"]["damage_severity"] | null
          source: Database["public"]["Enums"]["damage_source"]
          source_reference_id?: string | null
          vehicle_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          damage_type?: string | null
          deal_id?: string
          description?: string | null
          id?: string
          location?: string | null
          photo_reference?: string | null
          severity?: Database["public"]["Enums"]["damage_severity"] | null
          source?: Database["public"]["Enums"]["damage_source"]
          source_reference_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "damage_assessments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_assessments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          assigned_fni_analyst: string | null
          assigned_seller_agent: string | null
          created_at: string
          deal_number: string | null
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["deal_status"]
          updated_at: string
        }
        Insert: {
          assigned_fni_analyst?: string | null
          assigned_seller_agent?: string | null
          created_at?: string
          deal_number?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          updated_at?: string
        }
        Update: {
          assigned_fni_analyst?: string | null
          assigned_seller_agent?: string | null
          created_at?: string
          deal_number?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          classification_confidence: number | null
          created_at: string
          deal_id: string
          doc_type: Database["public"]["Enums"]["document_type"] | null
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          mime_type: string | null
          party: Database["public"]["Enums"]["party_type"] | null
          status: string
          upload_timestamp: string
        }
        Insert: {
          classification_confidence?: number | null
          created_at?: string
          deal_id: string
          doc_type?: Database["public"]["Enums"]["document_type"] | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          mime_type?: string | null
          party?: Database["public"]["Enums"]["party_type"] | null
          status?: string
          upload_timestamp?: string
        }
        Update: {
          classification_confidence?: number | null
          created_at?: string
          deal_id?: string
          doc_type?: Database["public"]["Enums"]["document_type"] | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          mime_type?: string | null
          party?: Database["public"]["Enums"]["party_type"] | null
          status?: string
          upload_timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_results: {
        Row: {
          confidence: number | null
          confidence_level:
            | Database["public"]["Enums"]["confidence_level"]
            | null
          confirmed_at: string | null
          created_at: string
          customer_confirmed_value: string | null
          document_id: string
          extracted_value: string | null
          field_name: string
          id: string
          source_location: Json | null
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          confidence?: number | null
          confidence_level?:
            | Database["public"]["Enums"]["confidence_level"]
            | null
          confirmed_at?: string | null
          created_at?: string
          customer_confirmed_value?: string | null
          document_id: string
          extracted_value?: string | null
          field_name: string
          id?: string
          source_location?: Json | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          confidence?: number | null
          confidence_level?:
            | Database["public"]["Enums"]["confidence_level"]
            | null
          confirmed_at?: string | null
          created_at?: string
          customer_confirmed_value?: string | null
          document_id?: string
          extracted_value?: string | null
          field_name?: string
          id?: string
          source_location?: Json | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "extraction_results_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          document_id: string
          error: string | null
          id: string
          result: Json | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          document_id: string
          error?: string | null
          id?: string
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          document_id?: string
          error?: string | null
          id?: string
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extraction_tasks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          completed_date: string | null
          created_at: string
          damage_summary: string | null
          deal_id: string
          id: string
          inspector_name: string | null
          notes: string | null
          overall_condition:
            | Database["public"]["Enums"]["condition_band"]
            | null
          report_url: string | null
          scheduled_date: string | null
          status: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          completed_date?: string | null
          created_at?: string
          damage_summary?: string | null
          deal_id: string
          id?: string
          inspector_name?: string | null
          notes?: string | null
          overall_condition?:
            | Database["public"]["Enums"]["condition_band"]
            | null
          report_url?: string | null
          scheduled_date?: string | null
          status?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          completed_date?: string | null
          created_at?: string
          damage_summary?: string | null
          deal_id?: string
          id?: string
          inspector_name?: string | null
          notes?: string | null
          overall_condition?:
            | Database["public"]["Enums"]["condition_band"]
            | null
          report_url?: string | null
          scheduled_date?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      natis_fulfilments: {
        Row: {
          collection_date: string | null
          collection_status: string
          collector_name: string | null
          created_at: string
          deal_id: string
          docs_sent_to_customer_date: string | null
          id: string
          tracking_notes: string | null
          transfer_date: string | null
          transfer_status: string
          updated_at: string
        }
        Insert: {
          collection_date?: string | null
          collection_status?: string
          collector_name?: string | null
          created_at?: string
          deal_id: string
          docs_sent_to_customer_date?: string | null
          id?: string
          tracking_notes?: string | null
          transfer_date?: string | null
          transfer_status?: string
          updated_at?: string
        }
        Update: {
          collection_date?: string | null
          collection_status?: string
          collector_name?: string | null
          created_at?: string
          deal_id?: string
          docs_sent_to_customer_date?: string | null
          id?: string
          tracking_notes?: string | null
          transfer_date?: string | null
          transfer_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "natis_fulfilments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          deal_id: string | null
          delivered_at: string | null
          error_message: string | null
          id: string
          message_body: string | null
          provider: string | null
          provider_ref: string | null
          read_at: string | null
          recipient_email: string | null
          recipient_phone: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          template: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          deal_id?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_body?: string | null
          provider?: string | null
          provider_ref?: string | null
          read_at?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          deal_id?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_body?: string | null
          provider?: string | null
          provider_ref?: string | null
          read_at?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          deal_id: string | null
          description: string | null
          id: string
          metadata: Json | null
          priority: string
          status: string
          task_type: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          deal_id?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          priority?: string
          status?: string
          task_type: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          deal_id?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          priority?: string
          status?: string
          task_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          balloon_amount: number
          created_at: string
          deal_id: string
          decline_reason: string | null
          declined_at: string | null
          finance_amount: number | null
          id: string
          interest_rate: number | null
          monthly_instalment: number | null
          prepared_by: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          term_months: number | null
          total_credit_cost: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          accepted_at?: string | null
          balloon_amount?: number
          created_at?: string
          deal_id: string
          decline_reason?: string | null
          declined_at?: string | null
          finance_amount?: number | null
          id?: string
          interest_rate?: number | null
          monthly_instalment?: number | null
          prepared_by?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          term_months?: number | null
          total_credit_cost?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          accepted_at?: string | null
          balloon_amount?: number
          created_at?: string
          deal_id?: string
          decline_reason?: string | null
          declined_at?: string | null
          finance_amount?: number | null
          id?: string
          interest_rate?: number | null
          monthly_instalment?: number | null
          prepared_by?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          term_months?: number | null
          total_credit_cost?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          consent_status: boolean
          consent_timestamp: string | null
          created_at: string
          deal_id: string
          email: string | null
          full_name: string | null
          id: string
          id_number: string | null
          phone: string
          updated_at: string
        }
        Insert: {
          consent_status?: boolean
          consent_timestamp?: string | null
          created_at?: string
          deal_id: string
          email?: string | null
          full_name?: string | null
          id?: string
          id_number?: string | null
          phone: string
          updated_at?: string
        }
        Update: {
          consent_status?: boolean
          consent_timestamp?: string | null
          created_at?: string
          deal_id?: string
          email?: string | null
          full_name?: string | null
          id?: string
          id_number?: string | null
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sellers_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_events: {
        Row: {
          contract_id: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          signatory: string | null
          timestamp: string
        }
        Insert: {
          contract_id: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          signatory?: string | null
          timestamp?: string
        }
        Update: {
          contract_id?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          signatory?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          deal_id: string
          due_at: string | null
          id: string
          notes: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          queue: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_type: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          deal_id: string
          due_at?: string | null
          id?: string
          notes?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          queue?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          deal_id?: string
          due_at?: string | null
          id?: string
          notes?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          queue?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      valuations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          deal_id: string
          forced_sale_value: number | null
          id: string
          notes: string | null
          retail_value: number | null
          trade_value: number | null
          valuation_source: string | null
          vehicle_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          deal_id: string
          forced_sale_value?: number | null
          id?: string
          notes?: string | null
          retail_value?: number | null
          trade_value?: number | null
          valuation_source?: string | null
          vehicle_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          deal_id?: string
          forced_sale_value?: number | null
          id?: string
          notes?: string | null
          retail_value?: number | null
          trade_value?: number | null
          valuation_source?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "valuations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_photo_sets: {
        Row: {
          coverage_score: number | null
          created_at: string
          deal_id: string
          id: string
          mandatory_received: number
          mandatory_required: number
          optional_received: number
          status: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          coverage_score?: number | null
          created_at?: string
          deal_id: string
          id?: string
          mandatory_received?: number
          mandatory_required?: number
          optional_received?: number
          status?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          coverage_score?: number | null
          created_at?: string
          deal_id?: string
          id?: string
          mandatory_received?: number
          mandatory_required?: number
          optional_received?: number
          status?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_photo_sets_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_photo_sets_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_photos: {
        Row: {
          angle_type: Database["public"]["Enums"]["photo_angle"] | null
          created_at: string
          file_name: string | null
          file_url: string | null
          id: string
          photo_set_id: string
          quality_score: number | null
          quality_status:
            | Database["public"]["Enums"]["photo_quality_status"]
            | null
          rejection_reason: string | null
          retry_count: number
          upload_timestamp: string
        }
        Insert: {
          angle_type?: Database["public"]["Enums"]["photo_angle"] | null
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          photo_set_id: string
          quality_score?: number | null
          quality_status?:
            | Database["public"]["Enums"]["photo_quality_status"]
            | null
          rejection_reason?: string | null
          retry_count?: number
          upload_timestamp?: string
        }
        Update: {
          angle_type?: Database["public"]["Enums"]["photo_angle"] | null
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          photo_set_id?: string
          quality_score?: number | null
          quality_status?:
            | Database["public"]["Enums"]["photo_quality_status"]
            | null
          rejection_reason?: string | null
          retry_count?: number
          upload_timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_photos_photo_set_id_fkey"
            columns: ["photo_set_id"]
            isOneToOne: false
            referencedRelation: "vehicle_photo_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_quick_evaluations: {
        Row: {
          condition_band: Database["public"]["Enums"]["condition_band"] | null
          created_at: string
          cross_image_consistency: string | null
          damage_items: Json | null
          deal_id: string
          disclaimer: string
          evaluation_type: string
          exterior_summary: string | null
          id: string
          interior_summary: string | null
          manual_review_reasons: Json
          mechanical_indicators: Json | null
          overall_confidence: number | null
          photo_set_id: string | null
          recommendation: string | null
          requires_manual_review: boolean
          review_notes: string | null
          review_outcome: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_flags: Json
          vehicle_id: string
        }
        Insert: {
          condition_band?: Database["public"]["Enums"]["condition_band"] | null
          created_at?: string
          cross_image_consistency?: string | null
          damage_items?: Json | null
          deal_id: string
          disclaimer?: string
          evaluation_type?: string
          exterior_summary?: string | null
          id?: string
          interior_summary?: string | null
          manual_review_reasons?: Json
          mechanical_indicators?: Json | null
          overall_confidence?: number | null
          photo_set_id?: string | null
          recommendation?: string | null
          requires_manual_review?: boolean
          review_notes?: string | null
          review_outcome?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_flags?: Json
          vehicle_id: string
        }
        Update: {
          condition_band?: Database["public"]["Enums"]["condition_band"] | null
          created_at?: string
          cross_image_consistency?: string | null
          damage_items?: Json | null
          deal_id?: string
          disclaimer?: string
          evaluation_type?: string
          exterior_summary?: string | null
          id?: string
          interior_summary?: string | null
          manual_review_reasons?: Json
          mechanical_indicators?: Json | null
          overall_confidence?: number | null
          photo_set_id?: string | null
          recommendation?: string | null
          requires_manual_review?: boolean
          review_notes?: string | null
          review_outcome?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_flags?: Json
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_quick_evaluations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_quick_evaluations_photo_set_id_fkey"
            columns: ["photo_set_id"]
            isOneToOne: false
            referencedRelation: "vehicle_photo_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_quick_evaluations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          asking_price: number | null
          colour: string | null
          created_at: string
          deal_id: string
          engine_number: string | null
          id: string
          make: string | null
          model: string | null
          odometer_reading: string | null
          registration_number: string | null
          updated_at: string
          vin: string | null
          year: number | null
          year_of_first_registration: number | null
        }
        Insert: {
          asking_price?: number | null
          colour?: string | null
          created_at?: string
          deal_id: string
          engine_number?: string | null
          id?: string
          make?: string | null
          model?: string | null
          odometer_reading?: string | null
          registration_number?: string | null
          updated_at?: string
          vin?: string | null
          year?: number | null
          year_of_first_registration?: number | null
        }
        Update: {
          asking_price?: number | null
          colour?: string | null
          created_at?: string
          deal_id?: string
          engine_number?: string | null
          id?: string
          make?: string | null
          model?: string | null
          odometer_reading?: string | null
          registration_number?: string | null
          updated_at?: string
          vin?: string | null
          year?: number | null
          year_of_first_registration?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_checks: {
        Row: {
          check_type: string
          created_at: string
          deal_id: string
          doc_a_id: string | null
          doc_b_id: string | null
          field_compared: string | null
          id: string
          notes: string | null
          resolution_status: string
          resolved_at: string | null
          resolved_by: string | null
          result: string | null
          severity: string | null
        }
        Insert: {
          check_type: string
          created_at?: string
          deal_id: string
          doc_a_id?: string | null
          doc_b_id?: string | null
          field_compared?: string | null
          id?: string
          notes?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          result?: string | null
          severity?: string | null
        }
        Update: {
          check_type?: string
          created_at?: string
          deal_id?: string
          doc_a_id?: string | null
          doc_b_id?: string | null
          field_compared?: string | null
          id?: string
          notes?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          result?: string | null
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_checks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_checks_doc_a_id_fkey"
            columns: ["doc_a_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_checks_doc_b_id_fkey"
            columns: ["doc_b_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      condition_band: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "SEVERE"
      confidence_level: "HIGH" | "MEDIUM" | "LOW" | "FAILED"
      contract_type: "SELLER_AGREEMENT" | "BUYER_FINANCE_AGREEMENT"
      damage_severity: "NONE" | "MINOR" | "MODERATE" | "MAJOR" | "SEVERE"
      damage_source: "AI_PHOTO" | "INSPECTION"
      deal_status:
        | "APPLICATION_INITIATED"
        | "CONSENT_PENDING"
        | "CONSENT_GRANTED"
        | "BUYER_DOCS_PENDING"
        | "EXTRACTION_IN_PROGRESS"
        | "BUYER_DOCS_EXTRACTED"
        | "BUYER_CONFIRMATION_PENDING"
        | "BUYER_CONFIRMED"
        | "SELLER_INVITED"
        | "SELLER_CONSENT_PENDING"
        | "SELLER_CONSENT_GRANTED"
        | "SELLER_DOCS_PENDING"
        | "SELLER_EXTRACTION_IN_PROGRESS"
        | "SELLER_DOCS_EXTRACTED"
        | "VEHICLE_PHOTOS_PENDING"
        | "VEHICLE_PHOTOS_PARTIAL"
        | "VEHICLE_PHOTOS_COMPLETE"
        | "QUICK_EVAL_IN_PROGRESS"
        | "QUICK_EVAL_COMPLETE"
        | "FNI_REVIEW_PENDING"
        | "QUOTE_PREPARATION"
        | "QUOTE_SENT"
        | "QUOTE_ACCEPTED"
        | "QUOTE_DECLINED"
        | "QUOTE_EXPIRED"
        | "INSPECTION_SCHEDULED"
        | "INSPECTION_COMPLETE"
        | "SELLER_CONTRACT_PENDING"
        | "SELLER_CONTRACT_SENT"
        | "SELLER_CONTRACT_SIGNED"
        | "BUYER_CONTRACT_PENDING"
        | "BUYER_CONTRACT_SENT"
        | "BUYER_CONTRACT_SIGNED"
        | "DEAL_PENDING_APPROVAL"
        | "DEAL_APPROVED"
        | "DEAL_DECLINED"
        | "NATIS_COLLECTION_PENDING"
        | "NATIS_COLLECTED"
        | "NATIS_TRANSFER_IN_PROGRESS"
        | "NATIS_COMPLETE"
        | "DEAL_FULFILLED"
        | "DEAL_CANCELLED"
        | "DEAL_ON_HOLD"
        | "SELLER_CONFIRMATION_PENDING"
        | "SELLER_CONFIRMED"
      document_type:
        | "SA_ID_SMART_CARD"
        | "SA_ID_GREEN_BOOK"
        | "PROOF_OF_ADDRESS"
        | "BANK_STATEMENT"
        | "PAYSLIP"
        | "VEHICLE_NATIS"
        | "VEHICLE_REGISTRATION"
        | "SETTLEMENT_LETTER"
        | "VEHICLE_PHOTO"
        | "OTHER"
      natis_status:
        | "COLLECTION_PENDING"
        | "COLLECTED"
        | "TRANSFER_IN_PROGRESS"
        | "TRANSFER_COMPLETE"
        | "DOCS_SENT"
      notification_channel: "WHATSAPP" | "SMS" | "EMAIL"
      notification_status: "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED"
      party_type: "BUYER" | "SELLER"
      photo_angle:
        | "FRONT_VIEW"
        | "REAR_VIEW"
        | "LEFT_SIDE"
        | "RIGHT_SIDE"
        | "FRONT_LEFT_ANGLE"
        | "FRONT_RIGHT_ANGLE"
        | "ODOMETER"
        | "INTERIOR_DASHBOARD"
        | "VIN_CHASSIS"
        | "REAR_LEFT_ANGLE"
        | "REAR_RIGHT_ANGLE"
        | "TYRE_FL"
        | "TYRE_FR"
        | "TYRE_RL"
        | "TYRE_RR"
        | "BOOT_INTERIOR"
        | "DAMAGE_CLOSEUP"
        | "ENGINE_BAY"
      photo_quality_status: "ACCEPTED" | "ACCEPTED_WITH_WARNING" | "REJECTED"
      quote_status:
        | "DRAFT"
        | "SENT"
        | "ACCEPTED"
        | "DECLINED"
        | "EXPIRED"
        | "REVISED"
      signature_status:
        | "PENDING"
        | "SENT"
        | "OPENED"
        | "SIGNED"
        | "DECLINED"
        | "EXPIRED"
      task_priority: "LOW" | "NORMAL" | "HIGH" | "URGENT"
      task_status:
        | "PENDING"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "CANCELLED"
        | "ESCALATED"
      verification_status: "PENDING" | "VERIFIED" | "MISMATCH" | "OVERRIDDEN"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      condition_band: ["EXCELLENT", "GOOD", "FAIR", "POOR", "SEVERE"],
      confidence_level: ["HIGH", "MEDIUM", "LOW", "FAILED"],
      contract_type: ["SELLER_AGREEMENT", "BUYER_FINANCE_AGREEMENT"],
      damage_severity: ["NONE", "MINOR", "MODERATE", "MAJOR", "SEVERE"],
      damage_source: ["AI_PHOTO", "INSPECTION"],
      deal_status: [
        "APPLICATION_INITIATED",
        "CONSENT_PENDING",
        "CONSENT_GRANTED",
        "BUYER_DOCS_PENDING",
        "EXTRACTION_IN_PROGRESS",
        "BUYER_DOCS_EXTRACTED",
        "BUYER_CONFIRMATION_PENDING",
        "BUYER_CONFIRMED",
        "SELLER_INVITED",
        "SELLER_CONSENT_PENDING",
        "SELLER_CONSENT_GRANTED",
        "SELLER_DOCS_PENDING",
        "SELLER_EXTRACTION_IN_PROGRESS",
        "SELLER_DOCS_EXTRACTED",
        "VEHICLE_PHOTOS_PENDING",
        "VEHICLE_PHOTOS_PARTIAL",
        "VEHICLE_PHOTOS_COMPLETE",
        "QUICK_EVAL_IN_PROGRESS",
        "QUICK_EVAL_COMPLETE",
        "FNI_REVIEW_PENDING",
        "QUOTE_PREPARATION",
        "QUOTE_SENT",
        "QUOTE_ACCEPTED",
        "QUOTE_DECLINED",
        "QUOTE_EXPIRED",
        "INSPECTION_SCHEDULED",
        "INSPECTION_COMPLETE",
        "SELLER_CONTRACT_PENDING",
        "SELLER_CONTRACT_SENT",
        "SELLER_CONTRACT_SIGNED",
        "BUYER_CONTRACT_PENDING",
        "BUYER_CONTRACT_SENT",
        "BUYER_CONTRACT_SIGNED",
        "DEAL_PENDING_APPROVAL",
        "DEAL_APPROVED",
        "DEAL_DECLINED",
        "NATIS_COLLECTION_PENDING",
        "NATIS_COLLECTED",
        "NATIS_TRANSFER_IN_PROGRESS",
        "NATIS_COMPLETE",
        "DEAL_FULFILLED",
        "DEAL_CANCELLED",
        "DEAL_ON_HOLD",
        "SELLER_CONFIRMATION_PENDING",
        "SELLER_CONFIRMED",
      ],
      document_type: [
        "SA_ID_SMART_CARD",
        "SA_ID_GREEN_BOOK",
        "PROOF_OF_ADDRESS",
        "BANK_STATEMENT",
        "PAYSLIP",
        "VEHICLE_NATIS",
        "VEHICLE_REGISTRATION",
        "SETTLEMENT_LETTER",
        "VEHICLE_PHOTO",
        "OTHER",
      ],
      natis_status: [
        "COLLECTION_PENDING",
        "COLLECTED",
        "TRANSFER_IN_PROGRESS",
        "TRANSFER_COMPLETE",
        "DOCS_SENT",
      ],
      notification_channel: ["WHATSAPP", "SMS", "EMAIL"],
      notification_status: ["QUEUED", "SENT", "DELIVERED", "READ", "FAILED"],
      party_type: ["BUYER", "SELLER"],
      photo_angle: [
        "FRONT_VIEW",
        "REAR_VIEW",
        "LEFT_SIDE",
        "RIGHT_SIDE",
        "FRONT_LEFT_ANGLE",
        "FRONT_RIGHT_ANGLE",
        "ODOMETER",
        "INTERIOR_DASHBOARD",
        "VIN_CHASSIS",
        "REAR_LEFT_ANGLE",
        "REAR_RIGHT_ANGLE",
        "TYRE_FL",
        "TYRE_FR",
        "TYRE_RL",
        "TYRE_RR",
        "BOOT_INTERIOR",
        "DAMAGE_CLOSEUP",
        "ENGINE_BAY",
      ],
      photo_quality_status: ["ACCEPTED", "ACCEPTED_WITH_WARNING", "REJECTED"],
      quote_status: [
        "DRAFT",
        "SENT",
        "ACCEPTED",
        "DECLINED",
        "EXPIRED",
        "REVISED",
      ],
      signature_status: [
        "PENDING",
        "SENT",
        "OPENED",
        "SIGNED",
        "DECLINED",
        "EXPIRED",
      ],
      task_priority: ["LOW", "NORMAL", "HIGH", "URGENT"],
      task_status: [
        "PENDING",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
        "ESCALATED",
      ],
      verification_status: ["PENDING", "VERIFIED", "MISMATCH", "OVERRIDDEN"],
    },
  },
} as const
