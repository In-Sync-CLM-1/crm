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
      activity_participants: {
        Row: {
          activity_id: string
          contact_id: string | null
          created_at: string | null
          email: string
          id: string
          name: string
          org_id: string
          response_status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          activity_id: string
          contact_id?: string | null
          created_at?: string | null
          email: string
          id?: string
          name: string
          org_id: string
          response_status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          activity_id?: string
          contact_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          name?: string
          org_id?: string
          response_status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_participants_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "contact_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_participants_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_participants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_call_sessions: {
        Row: {
          agent_id: string
          contact_id: string | null
          ended_at: string | null
          exotel_call_sid: string | null
          id: string
          org_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          agent_id: string
          contact_id?: string | null
          ended_at?: string | null
          exotel_call_sid?: string | null
          id?: string
          org_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          agent_id?: string
          contact_id?: string | null
          ended_at?: string | null
          exotel_call_sid?: string | null
          id?: string
          org_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_call_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_call_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_rules: {
        Row: {
          approval_type_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          required_roles: string[]
          threshold_amount: number | null
          updated_at: string
        }
        Insert: {
          approval_type_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          required_roles?: string[]
          threshold_amount?: number | null
          updated_at?: string
        }
        Update: {
          approval_type_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          required_roles?: string[]
          threshold_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_rules_approval_type_id_fkey"
            columns: ["approval_type_id"]
            isOneToOne: false
            referencedRelation: "approval_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_ab_tests: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          org_id: string
          rule_id: string
          start_date: string
          status: string
          test_name: string
          updated_at: string
          variants: Json
          winner_variant: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          org_id: string
          rule_id: string
          start_date?: string
          status?: string
          test_name: string
          updated_at?: string
          variants: Json
          winner_variant?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          org_id?: string
          rule_id?: string
          start_date?: string
          status?: string
          test_name?: string
          updated_at?: string
          variants?: Json
          winner_variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_ab_tests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_ab_tests_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "email_automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_approvals: {
        Row: {
          approval_notes: string | null
          execution_id: string
          expires_at: string | null
          id: string
          org_id: string
          rejection_reason: string | null
          requested_at: string
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rule_id: string
          status: string
        }
        Insert: {
          approval_notes?: string | null
          execution_id: string
          expires_at?: string | null
          id?: string
          org_id: string
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id: string
          status?: string
        }
        Update: {
          approval_notes?: string | null
          execution_id?: string
          expires_at?: string | null
          id?: string
          org_id?: string
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_approvals_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: true
            referencedRelation: "email_automation_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_approvals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_approvals_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "email_automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_performance_daily: {
        Row: {
          avg_time_to_click_minutes: number | null
          avg_time_to_convert_minutes: number | null
          avg_time_to_open_minutes: number | null
          created_at: string
          id: string
          org_id: string
          report_date: string
          rule_id: string | null
          total_clicked: number | null
          total_conversion_value: number | null
          total_converted: number | null
          total_failed: number | null
          total_opened: number | null
          total_sent: number | null
          total_triggered: number | null
          unique_clicks: number | null
          unique_opens: number | null
        }
        Insert: {
          avg_time_to_click_minutes?: number | null
          avg_time_to_convert_minutes?: number | null
          avg_time_to_open_minutes?: number | null
          created_at?: string
          id?: string
          org_id: string
          report_date: string
          rule_id?: string | null
          total_clicked?: number | null
          total_conversion_value?: number | null
          total_converted?: number | null
          total_failed?: number | null
          total_opened?: number | null
          total_sent?: number | null
          total_triggered?: number | null
          unique_clicks?: number | null
          unique_opens?: number | null
        }
        Update: {
          avg_time_to_click_minutes?: number | null
          avg_time_to_convert_minutes?: number | null
          avg_time_to_open_minutes?: number | null
          created_at?: string
          id?: string
          org_id?: string
          report_date?: string
          rule_id?: string | null
          total_clicked?: number | null
          total_conversion_value?: number | null
          total_converted?: number | null
          total_failed?: number | null
          total_opened?: number | null
          total_sent?: number | null
          total_triggered?: number | null
          unique_clicks?: number | null
          unique_opens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_performance_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_performance_daily_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "email_automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statements: {
        Row: {
          account_number: string | null
          bank_name: string
          filename: string | null
          from_date: string | null
          id: string
          org_id: string
          row_count: number
          statement_type: string
          to_date: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          account_number?: string | null
          bank_name?: string
          filename?: string | null
          from_date?: string | null
          id?: string
          org_id: string
          row_count?: number
          statement_type?: string
          to_date?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          account_number?: string | null
          bank_name?: string
          filename?: string | null
          from_date?: string | null
          id?: string
          org_id?: string
          row_count?: number
          statement_type?: string
          to_date?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statements_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          auto_rule: string | null
          balance: number | null
          created_at: string | null
          credit: number
          debit: number
          id: string
          journal_entry_id: string | null
          narration: string
          org_id: string
          reference: string | null
          statement_id: string
          status: string
          suggested_billing_payment_id: string | null
          suggested_invoice_id: string | null
          transaction_date: string
          value_date: string | null
        }
        Insert: {
          auto_rule?: string | null
          balance?: number | null
          created_at?: string | null
          credit?: number
          debit?: number
          id?: string
          journal_entry_id?: string | null
          narration?: string
          org_id: string
          reference?: string | null
          statement_id: string
          status?: string
          suggested_billing_payment_id?: string | null
          suggested_invoice_id?: string | null
          transaction_date: string
          value_date?: string | null
        }
        Update: {
          auto_rule?: string | null
          balance?: number | null
          created_at?: string | null
          credit?: number
          debit?: number
          id?: string
          journal_entry_id?: string | null
          narration?: string
          org_id?: string
          reference?: string | null
          statement_id?: string
          status?: string
          suggested_billing_payment_id?: string | null
          suggested_invoice_id?: string | null
          transaction_date?: string
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "bank_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_suggested_billing_payment_id_fkey"
            columns: ["suggested_billing_payment_id"]
            isOneToOne: false
            referencedRelation: "billing_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_suggested_invoice_id_fkey"
            columns: ["suggested_invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bt_journal_entry"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      bd_contacts: {
        Row: {
          created_at: string
          email: string | null
          firm_id: string
          first_name: string | null
          id: string
          is_primary: boolean
          last_name: string | null
          linkedin_url: string | null
          opted_out: boolean
          org_id: string
          source: string
          title: string | null
          updated_at: string
          why_chosen: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          firm_id: string
          first_name?: string | null
          id?: string
          is_primary?: boolean
          last_name?: string | null
          linkedin_url?: string | null
          opted_out?: boolean
          org_id: string
          source?: string
          title?: string | null
          updated_at?: string
          why_chosen?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          firm_id?: string
          first_name?: string | null
          id?: string
          is_primary?: boolean
          last_name?: string | null
          linkedin_url?: string | null
          opted_out?: boolean
          org_id?: string
          source?: string
          title?: string | null
          updated_at?: string
          why_chosen?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bd_contacts_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "bd_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      bd_drafts: {
        Row: {
          angle_version: number | null
          body: string | null
          contact_id: string | null
          created_at: string
          firm_id: string
          first_line: string | null
          id: string
          org_id: string
          proof_key: string | null
          reasoning: Json | null
          reviewed_at: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          angle_version?: number | null
          body?: string | null
          contact_id?: string | null
          created_at?: string
          firm_id: string
          first_line?: string | null
          id?: string
          org_id: string
          proof_key?: string | null
          reasoning?: Json | null
          reviewed_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          angle_version?: number | null
          body?: string | null
          contact_id?: string | null
          created_at?: string
          firm_id?: string
          first_line?: string | null
          id?: string
          org_id?: string
          proof_key?: string | null
          reasoning?: Json | null
          reviewed_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bd_drafts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "bd_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bd_drafts_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "bd_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      bd_events: {
        Row: {
          angle_version: number | null
          created_at: string
          detail: Json | null
          event_type: string
          firm_id: string
          id: string
          occurred_at: string
          org_id: string
          proof_key: string | null
          sequence_id: string | null
          step: string | null
        }
        Insert: {
          angle_version?: number | null
          created_at?: string
          detail?: Json | null
          event_type: string
          firm_id: string
          id?: string
          occurred_at?: string
          org_id: string
          proof_key?: string | null
          sequence_id?: string | null
          step?: string | null
        }
        Update: {
          angle_version?: number | null
          created_at?: string
          detail?: Json | null
          event_type?: string
          firm_id?: string
          id?: string
          occurred_at?: string
          org_id?: string
          proof_key?: string | null
          sequence_id?: string | null
          step?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bd_events_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "bd_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bd_events_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "bd_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      bd_exclusions: {
        Row: {
          created_at: string
          excluded_on: string
          firm_name: string
          id: string
          is_permanent: boolean
          name_key: string
          org_id: string
          reason: string
          revisit_when: string | null
        }
        Insert: {
          created_at?: string
          excluded_on?: string
          firm_name: string
          id?: string
          is_permanent?: boolean
          name_key: string
          org_id: string
          reason: string
          revisit_when?: string | null
        }
        Update: {
          created_at?: string
          excluded_on?: string
          firm_name?: string
          id?: string
          is_permanent?: boolean
          name_key?: string
          org_id?: string
          reason?: string
          revisit_when?: string | null
        }
        Relationships: []
      }
      bd_firms: {
        Row: {
          ai_services_pct: number | null
          bill_rate_band: string | null
          city: string | null
          created_at: string
          disqualifier_flags: Json | null
          firm_name: string
          fit_score: number | null
          grade: string | null
          has_crm_erp_line: boolean
          has_domain_anchor: boolean
          has_staff_aug: boolean
          headcount_band: string | null
          id: string
          min_project: string | null
          name_key: string
          notes: string | null
          org_id: string
          other_services: string | null
          research_facts: Json | null
          researched_at: string | null
          source: string
          state: string | null
          state_flag: string | null
          state_reason: string | null
          time_zone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          ai_services_pct?: number | null
          bill_rate_band?: string | null
          city?: string | null
          created_at?: string
          disqualifier_flags?: Json | null
          firm_name: string
          fit_score?: number | null
          grade?: string | null
          has_crm_erp_line?: boolean
          has_domain_anchor?: boolean
          has_staff_aug?: boolean
          headcount_band?: string | null
          id?: string
          min_project?: string | null
          name_key: string
          notes?: string | null
          org_id: string
          other_services?: string | null
          research_facts?: Json | null
          researched_at?: string | null
          source?: string
          state?: string | null
          state_flag?: string | null
          state_reason?: string | null
          time_zone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          ai_services_pct?: number | null
          bill_rate_band?: string | null
          city?: string | null
          created_at?: string
          disqualifier_flags?: Json | null
          firm_name?: string
          fit_score?: number | null
          grade?: string | null
          has_crm_erp_line?: boolean
          has_domain_anchor?: boolean
          has_staff_aug?: boolean
          headcount_band?: string | null
          id?: string
          min_project?: string | null
          name_key?: string
          notes?: string | null
          org_id?: string
          other_services?: string | null
          research_facts?: Json | null
          researched_at?: string | null
          source?: string
          state?: string | null
          state_flag?: string | null
          state_reason?: string | null
          time_zone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      bd_sequences: {
        Row: {
          batch_no: number | null
          contact_id: string | null
          created_at: string
          draft_id: string | null
          firm_id: string
          id: string
          mailbox: string | null
          next_due_at: string | null
          org_id: string
          step: string
          stop_reason: string | null
          stopped_at: string | null
          thread_message_id: string | null
          updated_at: string
        }
        Insert: {
          batch_no?: number | null
          contact_id?: string | null
          created_at?: string
          draft_id?: string | null
          firm_id: string
          id?: string
          mailbox?: string | null
          next_due_at?: string | null
          org_id: string
          step?: string
          stop_reason?: string | null
          stopped_at?: string | null
          thread_message_id?: string | null
          updated_at?: string
        }
        Update: {
          batch_no?: number | null
          contact_id?: string | null
          created_at?: string
          draft_id?: string | null
          firm_id?: string
          id?: string
          mailbox?: string | null
          next_due_at?: string | null
          org_id?: string
          step?: string
          stop_reason?: string | null
          stopped_at?: string | null
          thread_message_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bd_sequences_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "bd_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bd_sequences_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "bd_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bd_sequences_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "bd_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_document_items: {
        Row: {
          cgst: number | null
          created_at: string | null
          description: string
          discount: number | null
          document_id: string
          hsn_sac: string | null
          id: string
          igst: number | null
          qty: number
          rate: number
          sgst: number | null
          sort_order: number | null
          tax_rate: number | null
          taxable: number | null
          total: number | null
          unit: string | null
        }
        Insert: {
          cgst?: number | null
          created_at?: string | null
          description: string
          discount?: number | null
          document_id: string
          hsn_sac?: string | null
          id?: string
          igst?: number | null
          qty?: number
          rate?: number
          sgst?: number | null
          sort_order?: number | null
          tax_rate?: number | null
          taxable?: number | null
          total?: number | null
          unit?: string | null
        }
        Update: {
          cgst?: number | null
          created_at?: string | null
          description?: string
          discount?: number | null
          document_id?: string
          hsn_sac?: string | null
          id?: string
          igst?: number | null
          qty?: number
          rate?: number
          sgst?: number | null
          sort_order?: number | null
          tax_rate?: number | null
          taxable?: number | null
          total?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_document_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "billing_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_documents: {
        Row: {
          amount_paid: number | null
          balance_due: number
          client_billing_snapshot: Json | null
          client_id: string | null
          client_name: string
          converted_from_id: string | null
          created_at: string | null
          doc_date: string
          doc_number: string
          doc_type: string
          due_date: string | null
          financial_year: string | null
          id: string
          notes: string | null
          org_id: string
          original_invoice_id: string | null
          original_invoice_number: string | null
          seller_snapshot: Json | null
          status: string | null
          subtotal: number
          supply_type: string | null
          terms_and_conditions: string | null
          total_amount: number
          total_tax: number
          updated_at: string | null
        }
        Insert: {
          amount_paid?: number | null
          balance_due?: number
          client_billing_snapshot?: Json | null
          client_id?: string | null
          client_name: string
          converted_from_id?: string | null
          created_at?: string | null
          doc_date: string
          doc_number: string
          doc_type: string
          due_date?: string | null
          financial_year?: string | null
          id?: string
          notes?: string | null
          org_id: string
          original_invoice_id?: string | null
          original_invoice_number?: string | null
          seller_snapshot?: Json | null
          status?: string | null
          subtotal?: number
          supply_type?: string | null
          terms_and_conditions?: string | null
          total_amount?: number
          total_tax?: number
          updated_at?: string | null
        }
        Update: {
          amount_paid?: number | null
          balance_due?: number
          client_billing_snapshot?: Json | null
          client_id?: string | null
          client_name?: string
          converted_from_id?: string | null
          created_at?: string | null
          doc_date?: string
          doc_number?: string
          doc_type?: string
          due_date?: string | null
          financial_year?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          original_invoice_id?: string | null
          original_invoice_number?: string | null
          seller_snapshot?: Json | null
          status?: string | null
          subtotal?: number
          supply_type?: string | null
          terms_and_conditions?: string | null
          total_amount?: number
          total_tax?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_documents_converted_from_id_fkey"
            columns: ["converted_from_id"]
            isOneToOne: false
            referencedRelation: "billing_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_documents_original_invoice_id_fkey"
            columns: ["original_invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_payments: {
        Row: {
          amount: number
          cleared_journal_entry_id: string | null
          created_at: string | null
          created_by: string | null
          document_id: string
          id: string
          journal_entry_id: string | null
          notes: string | null
          org_id: string
          payment_date: string
          payment_mode: string | null
          reference_number: string | null
          tds_amount: number | null
        }
        Insert: {
          amount: number
          cleared_journal_entry_id?: string | null
          created_at?: string | null
          created_by?: string | null
          document_id: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          org_id: string
          payment_date: string
          payment_mode?: string | null
          reference_number?: string | null
          tds_amount?: number | null
        }
        Update: {
          amount?: number
          cleared_journal_entry_id?: string | null
          created_at?: string | null
          created_by?: string | null
          document_id?: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          org_id?: string
          payment_date?: string
          payment_mode?: string | null
          reference_number?: string | null
          tds_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_payments_cleared_journal_entry_id_fkey"
            columns: ["cleared_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_payments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "billing_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_settings: {
        Row: {
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          bank_upi_id: string | null
          company_address: string | null
          company_email: string | null
          company_gstin: string | null
          company_name: string | null
          company_pan: string | null
          company_phone: string | null
          company_state: string | null
          company_state_code: string | null
          created_at: string | null
          credit_note_prefix: string | null
          default_credit_note_notes: string | null
          default_credit_note_terms: string | null
          default_due_days: number | null
          default_hsn: string | null
          default_notes: string | null
          default_proforma_notes: string | null
          default_proforma_terms: string | null
          default_quotation_terms: string | null
          default_tax_rate: number | null
          default_terms: string | null
          id: string
          invoice_prefix: string | null
          logo_url: string | null
          next_credit_note_number: number | null
          next_invoice_number: number | null
          next_proforma_number: number | null
          next_quotation_number: number | null
          org_id: string
          proforma_prefix: string | null
          quotation_prefix: string | null
          signature_url: string | null
          updated_at: string | null
        }
        Insert: {
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          bank_upi_id?: string | null
          company_address?: string | null
          company_email?: string | null
          company_gstin?: string | null
          company_name?: string | null
          company_pan?: string | null
          company_phone?: string | null
          company_state?: string | null
          company_state_code?: string | null
          created_at?: string | null
          credit_note_prefix?: string | null
          default_credit_note_notes?: string | null
          default_credit_note_terms?: string | null
          default_due_days?: number | null
          default_hsn?: string | null
          default_notes?: string | null
          default_proforma_notes?: string | null
          default_proforma_terms?: string | null
          default_quotation_terms?: string | null
          default_tax_rate?: number | null
          default_terms?: string | null
          id?: string
          invoice_prefix?: string | null
          logo_url?: string | null
          next_credit_note_number?: number | null
          next_invoice_number?: number | null
          next_proforma_number?: number | null
          next_quotation_number?: number | null
          org_id: string
          proforma_prefix?: string | null
          quotation_prefix?: string | null
          signature_url?: string | null
          updated_at?: string | null
        }
        Update: {
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          bank_upi_id?: string | null
          company_address?: string | null
          company_email?: string | null
          company_gstin?: string | null
          company_name?: string | null
          company_pan?: string | null
          company_phone?: string | null
          company_state?: string | null
          company_state_code?: string | null
          created_at?: string | null
          credit_note_prefix?: string | null
          default_credit_note_notes?: string | null
          default_credit_note_terms?: string | null
          default_due_days?: number | null
          default_hsn?: string | null
          default_notes?: string | null
          default_proforma_notes?: string | null
          default_proforma_terms?: string | null
          default_quotation_terms?: string | null
          default_tax_rate?: number | null
          default_terms?: string | null
          id?: string
          invoice_prefix?: string | null
          logo_url?: string | null
          next_credit_note_number?: number | null
          next_invoice_number?: number | null
          next_proforma_number?: number | null
          next_quotation_number?: number | null
          org_id?: string
          proforma_prefix?: string | null
          quotation_prefix?: string | null
          signature_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          blog_excerpt: string | null
          blog_title: string
          blog_url: string
          campaign_id: string | null
          carousel_slide_texts: Json | null
          carousel_slide_urls: Json | null
          channel: string
          content_angle: string | null
          content_icp_snapshot: Json | null
          content_strategy_note: string | null
          content_theme: string | null
          created_at: string
          day_seq: number | null
          email_campaign_sent: boolean
          email_recipients_count: number | null
          error_message: string | null
          facebook_url: string | null
          fb_clicks: number | null
          fb_comments: number | null
          fb_engagement_fetched_at: string | null
          fb_likes: number | null
          fb_post_id: string | null
          fb_posted_at: string | null
          fb_shares: number | null
          featured_image_url: string | null
          id: string
          ig_comments: number | null
          ig_engagement_fetched_at: string | null
          ig_likes: number | null
          ig_post_id: string | null
          ig_posted_at: string | null
          ig_reach: number | null
          ig_reel_id: string | null
          ig_saves: number | null
          ig_shares: number | null
          image_style: string | null
          image_url: string | null
          linkedin_comments: number | null
          linkedin_cycle: number | null
          linkedin_draft_text: string | null
          linkedin_engagement_fetched_at: string | null
          linkedin_engagement_score: number | null
          linkedin_impressions: number | null
          linkedin_likes: number | null
          linkedin_post_urn: string | null
          linkedin_reposts: number | null
          linkedin_short_caption: string | null
          linkedin_slot_index: number | null
          linkedin_url: string | null
          member_engaged_at: string | null
          member_engagement_type: string | null
          org_id: string
          poll_duration: string | null
          poll_options: Json | null
          poll_question: string | null
          post_format: string | null
          posted_timestamp: string
          product_key: string | null
          publish_date: string
          social_posted: boolean
          status: string
          twitter_url: string | null
          updated_at: string
          video_url: string | null
          x_engagement_fetched_at: string | null
          x_impressions: number | null
          x_likes: number | null
          x_post_id: string | null
          x_posted_at: string | null
          x_replies: number | null
          x_reposts: number | null
          yt_comments: number | null
          yt_engagement_fetched_at: string | null
          yt_likes: number | null
          yt_posted_at: string | null
          yt_video_id: string | null
          yt_views: number | null
        }
        Insert: {
          blog_excerpt?: string | null
          blog_title: string
          blog_url: string
          campaign_id?: string | null
          carousel_slide_texts?: Json | null
          carousel_slide_urls?: Json | null
          channel?: string
          content_angle?: string | null
          content_icp_snapshot?: Json | null
          content_strategy_note?: string | null
          content_theme?: string | null
          created_at?: string
          day_seq?: number | null
          email_campaign_sent?: boolean
          email_recipients_count?: number | null
          error_message?: string | null
          facebook_url?: string | null
          fb_clicks?: number | null
          fb_comments?: number | null
          fb_engagement_fetched_at?: string | null
          fb_likes?: number | null
          fb_post_id?: string | null
          fb_posted_at?: string | null
          fb_shares?: number | null
          featured_image_url?: string | null
          id?: string
          ig_comments?: number | null
          ig_engagement_fetched_at?: string | null
          ig_likes?: number | null
          ig_post_id?: string | null
          ig_posted_at?: string | null
          ig_reach?: number | null
          ig_reel_id?: string | null
          ig_saves?: number | null
          ig_shares?: number | null
          image_style?: string | null
          image_url?: string | null
          linkedin_comments?: number | null
          linkedin_cycle?: number | null
          linkedin_draft_text?: string | null
          linkedin_engagement_fetched_at?: string | null
          linkedin_engagement_score?: number | null
          linkedin_impressions?: number | null
          linkedin_likes?: number | null
          linkedin_post_urn?: string | null
          linkedin_reposts?: number | null
          linkedin_short_caption?: string | null
          linkedin_slot_index?: number | null
          linkedin_url?: string | null
          member_engaged_at?: string | null
          member_engagement_type?: string | null
          org_id: string
          poll_duration?: string | null
          poll_options?: Json | null
          poll_question?: string | null
          post_format?: string | null
          posted_timestamp?: string
          product_key?: string | null
          publish_date: string
          social_posted?: boolean
          status?: string
          twitter_url?: string | null
          updated_at?: string
          video_url?: string | null
          x_engagement_fetched_at?: string | null
          x_impressions?: number | null
          x_likes?: number | null
          x_post_id?: string | null
          x_posted_at?: string | null
          x_replies?: number | null
          x_reposts?: number | null
          yt_comments?: number | null
          yt_engagement_fetched_at?: string | null
          yt_likes?: number | null
          yt_posted_at?: string | null
          yt_video_id?: string | null
          yt_views?: number | null
        }
        Update: {
          blog_excerpt?: string | null
          blog_title?: string
          blog_url?: string
          campaign_id?: string | null
          carousel_slide_texts?: Json | null
          carousel_slide_urls?: Json | null
          channel?: string
          content_angle?: string | null
          content_icp_snapshot?: Json | null
          content_strategy_note?: string | null
          content_theme?: string | null
          created_at?: string
          day_seq?: number | null
          email_campaign_sent?: boolean
          email_recipients_count?: number | null
          error_message?: string | null
          facebook_url?: string | null
          fb_clicks?: number | null
          fb_comments?: number | null
          fb_engagement_fetched_at?: string | null
          fb_likes?: number | null
          fb_post_id?: string | null
          fb_posted_at?: string | null
          fb_shares?: number | null
          featured_image_url?: string | null
          id?: string
          ig_comments?: number | null
          ig_engagement_fetched_at?: string | null
          ig_likes?: number | null
          ig_post_id?: string | null
          ig_posted_at?: string | null
          ig_reach?: number | null
          ig_reel_id?: string | null
          ig_saves?: number | null
          ig_shares?: number | null
          image_style?: string | null
          image_url?: string | null
          linkedin_comments?: number | null
          linkedin_cycle?: number | null
          linkedin_draft_text?: string | null
          linkedin_engagement_fetched_at?: string | null
          linkedin_engagement_score?: number | null
          linkedin_impressions?: number | null
          linkedin_likes?: number | null
          linkedin_post_urn?: string | null
          linkedin_reposts?: number | null
          linkedin_short_caption?: string | null
          linkedin_slot_index?: number | null
          linkedin_url?: string | null
          member_engaged_at?: string | null
          member_engagement_type?: string | null
          org_id?: string
          poll_duration?: string | null
          poll_options?: Json | null
          poll_question?: string | null
          post_format?: string | null
          posted_timestamp?: string
          product_key?: string | null
          publish_date?: string
          social_posted?: boolean
          status?: string
          twitter_url?: string | null
          updated_at?: string
          video_url?: string | null
          x_engagement_fetched_at?: string | null
          x_impressions?: number | null
          x_likes?: number | null
          x_post_id?: string | null
          x_posted_at?: string | null
          x_replies?: number | null
          x_reposts?: number | null
          yt_comments?: number | null
          yt_engagement_fetched_at?: string | null
          yt_likes?: number | null
          yt_posted_at?: string | null
          yt_video_id?: string | null
          yt_views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_shares: {
        Row: {
          created_at: string | null
          id: string
          org_id: string
          owner_id: string
          permission: string
          shared_with_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          org_id: string
          owner_id: string
          permission?: string
          shared_with_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          org_id?: string
          owner_id?: string
          permission?: string
          shared_with_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_shares_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_dispositions: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          org_id: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          org_id: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_dispositions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          activity_id: string | null
          agent_id: string | null
          ai_analysis: Json | null
          ai_summary: string | null
          analysis_error: string | null
          analysis_provider: string | null
          analyzed_at: string | null
          answered_at: string | null
          call_duration: number | null
          call_type: string
          contact_id: string | null
          conversation_duration: number | null
          created_at: string | null
          direction: string
          disposition_id: string | null
          ended_at: string | null
          exotel_call_sid: string
          exotel_conversation_uuid: string | null
          exotel_raw_data: Json | null
          from_number: string
          id: string
          notes: string | null
          org_id: string
          quality_score: number | null
          recording_duration: number | null
          recording_url: string | null
          ring_duration: number | null
          sentiment: string | null
          started_at: string | null
          status: string
          sub_disposition_id: string | null
          to_number: string
          transcribed_at: string | null
          transcript: string | null
          transcript_provider: string | null
        }
        Insert: {
          activity_id?: string | null
          agent_id?: string | null
          ai_analysis?: Json | null
          ai_summary?: string | null
          analysis_error?: string | null
          analysis_provider?: string | null
          analyzed_at?: string | null
          answered_at?: string | null
          call_duration?: number | null
          call_type: string
          contact_id?: string | null
          conversation_duration?: number | null
          created_at?: string | null
          direction: string
          disposition_id?: string | null
          ended_at?: string | null
          exotel_call_sid: string
          exotel_conversation_uuid?: string | null
          exotel_raw_data?: Json | null
          from_number: string
          id?: string
          notes?: string | null
          org_id: string
          quality_score?: number | null
          recording_duration?: number | null
          recording_url?: string | null
          ring_duration?: number | null
          sentiment?: string | null
          started_at?: string | null
          status: string
          sub_disposition_id?: string | null
          to_number: string
          transcribed_at?: string | null
          transcript?: string | null
          transcript_provider?: string | null
        }
        Update: {
          activity_id?: string | null
          agent_id?: string | null
          ai_analysis?: Json | null
          ai_summary?: string | null
          analysis_error?: string | null
          analysis_provider?: string | null
          analyzed_at?: string | null
          answered_at?: string | null
          call_duration?: number | null
          call_type?: string
          contact_id?: string | null
          conversation_duration?: number | null
          created_at?: string | null
          direction?: string
          disposition_id?: string | null
          ended_at?: string | null
          exotel_call_sid?: string
          exotel_conversation_uuid?: string | null
          exotel_raw_data?: Json | null
          from_number?: string
          id?: string
          notes?: string | null
          org_id?: string
          quality_score?: number | null
          recording_duration?: number | null
          recording_url?: string | null
          ring_duration?: number | null
          sentiment?: string | null
          started_at?: string | null
          status?: string
          sub_disposition_id?: string | null
          to_number?: string
          transcribed_at?: string | null
          transcript?: string | null
          transcript_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "contact_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_disposition_id_fkey"
            columns: ["disposition_id"]
            isOneToOne: false
            referencedRelation: "call_dispositions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_sub_disposition_id_fkey"
            columns: ["sub_disposition_id"]
            isOneToOne: false
            referencedRelation: "call_sub_dispositions"
            referencedColumns: ["id"]
          },
        ]
      }
      call_sub_dispositions: {
        Row: {
          created_at: string | null
          description: string | null
          disposition_id: string
          id: string
          is_active: boolean | null
          name: string
          org_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          disposition_id: string
          id?: string
          is_active?: boolean | null
          name: string
          org_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          disposition_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_sub_dispositions_disposition_id_fkey"
            columns: ["disposition_id"]
            isOneToOne: false
            referencedRelation: "call_dispositions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_sub_dispositions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_analytics: {
        Row: {
          bounce_count: number | null
          campaign_id: string
          campaign_type: string
          click_count: number | null
          conversions: number | null
          cpa: number | null
          created_at: string | null
          date: string
          id: string
          open_count: number | null
          org_id: string
          revenue: number | null
          roas: number | null
          spend: number | null
        }
        Insert: {
          bounce_count?: number | null
          campaign_id: string
          campaign_type: string
          click_count?: number | null
          conversions?: number | null
          cpa?: number | null
          created_at?: string | null
          date: string
          id?: string
          open_count?: number | null
          org_id: string
          revenue?: number | null
          roas?: number | null
          spend?: number | null
        }
        Update: {
          bounce_count?: number | null
          campaign_id?: string
          campaign_type?: string
          click_count?: number | null
          conversions?: number | null
          cpa?: number | null
          created_at?: string | null
          date?: string
          id?: string
          open_count?: number | null
          org_id?: string
          revenue?: number | null
          roas?: number | null
          spend?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_analytics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_insights: {
        Row: {
          analysis: string | null
          campaign_id: string | null
          created_at: string | null
          description: string | null
          expires_at: string | null
          id: string
          impact: string | null
          insight_type: string
          org_id: string
          priority: string
          status: string | null
          suggested_action: string | null
          supporting_data: Json | null
          title: string
          updated_at: string | null
        }
        Insert: {
          analysis?: string | null
          campaign_id?: string | null
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          impact?: string | null
          insight_type: string
          org_id: string
          priority: string
          status?: string | null
          suggested_action?: string | null
          supporting_data?: Json | null
          title: string
          updated_at?: string | null
        }
        Update: {
          analysis?: string | null
          campaign_id?: string | null
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          impact?: string | null
          insight_type?: string
          org_id?: string
          priority?: string
          status?: string | null
          suggested_action?: string | null
          supporting_data?: Json | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_insights_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_active: boolean
          is_bank_account: boolean
          is_system: boolean
          name: string
          normal_balance: string
          org_id: string | null
          parent_code: string | null
          sub_type: string
          type: string
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_bank_account?: boolean
          is_system?: boolean
          name: string
          normal_balance: string
          org_id?: string | null
          parent_code?: string | null
          sub_type: string
          type: string
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_bank_account?: boolean
          is_system?: boolean
          name?: string
          normal_balance?: string
          org_id?: string | null
          parent_code?: string | null
          sub_type?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          conversation_type: string
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string | null
          name: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          conversation_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          name?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          conversation_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          name?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          is_edited: boolean | null
          message_type: string
          sender_id: string
          task_id: string | null
          updated_at: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_edited?: boolean | null
          message_type?: string
          sender_id: string
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_edited?: boolean | null
          message_type?: string
          sender_id?: string
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_participants: {
        Row: {
          conversation_id: string
          id: string
          is_admin: boolean | null
          joined_at: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          is_admin?: boolean | null
          joined_at?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          is_admin?: boolean | null
          joined_at?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_alternate_contacts: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          designation: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          org_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          org_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_alternate_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_alternate_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_documents: {
        Row: {
          client_id: string | null
          contact_id: string | null
          created_at: string
          description: string | null
          document_name: string
          document_type: string
          external_entity_id: string | null
          external_link: string | null
          file_url: string | null
          id: string
          org_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          description?: string | null
          document_name: string
          document_type?: string
          external_entity_id?: string | null
          external_link?: string | null
          file_url?: string | null
          id?: string
          org_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          description?: string | null
          document_name?: string
          document_type?: string
          external_entity_id?: string | null
          external_link?: string | null
          file_url?: string | null
          id?: string
          org_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_external_entity_id_fkey"
            columns: ["external_entity_id"]
            isOneToOne: false
            referencedRelation: "external_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invoices: {
        Row: {
          actual_payment_received: number | null
          amount: number
          client_id: string | null
          contact_id: string | null
          converted_from_quotation_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          document_type: string | null
          due_date: string | null
          external_entity_id: string | null
          file_url: string | null
          gst_rate: number | null
          id: string
          invoice_date: string
          invoice_number: string
          net_received_amount: number | null
          notes: string | null
          org_id: string
          payment_received_date: string | null
          status: string
          tax_amount: number | null
          tds_amount: number | null
          updated_at: string
        }
        Insert: {
          actual_payment_received?: number | null
          amount?: number
          client_id?: string | null
          contact_id?: string | null
          converted_from_quotation_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          document_type?: string | null
          due_date?: string | null
          external_entity_id?: string | null
          file_url?: string | null
          gst_rate?: number | null
          id?: string
          invoice_date: string
          invoice_number: string
          net_received_amount?: number | null
          notes?: string | null
          org_id: string
          payment_received_date?: string | null
          status?: string
          tax_amount?: number | null
          tds_amount?: number | null
          updated_at?: string
        }
        Update: {
          actual_payment_received?: number | null
          amount?: number
          client_id?: string | null
          contact_id?: string | null
          converted_from_quotation_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          document_type?: string | null
          due_date?: string | null
          external_entity_id?: string | null
          file_url?: string | null
          gst_rate?: number | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          net_received_amount?: number | null
          notes?: string | null
          org_id?: string
          payment_received_date?: string | null
          status?: string
          tax_amount?: number | null
          tds_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invoices_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invoices_converted_from_quotation_id_fkey"
            columns: ["converted_from_quotation_id"]
            isOneToOne: false
            referencedRelation: "client_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invoices_external_entity_id_fkey"
            columns: ["external_entity_id"]
            isOneToOne: false
            referencedRelation: "external_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          billing_address: string | null
          billing_state_code: string | null
          city: string | null
          company: string | null
          contact_id: string | null
          converted_at: string
          converted_by: string | null
          country: string | null
          created_at: string
          email: string | null
          first_name: string
          gstin: string | null
          id: string
          invoice_company_name: string | null
          job_title: string | null
          last_discussion: string | null
          last_discussion_at: string | null
          last_name: string | null
          notes: string | null
          org_id: string
          pan: string | null
          phone: string | null
          postal_code: string | null
          state: string | null
          status: string | null
          status_updated_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          billing_address?: string | null
          billing_state_code?: string | null
          city?: string | null
          company?: string | null
          contact_id?: string | null
          converted_at?: string
          converted_by?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          gstin?: string | null
          id?: string
          invoice_company_name?: string | null
          job_title?: string | null
          last_discussion?: string | null
          last_discussion_at?: string | null
          last_name?: string | null
          notes?: string | null
          org_id: string
          pan?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          status?: string | null
          status_updated_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          billing_address?: string | null
          billing_state_code?: string | null
          city?: string | null
          company?: string | null
          contact_id?: string | null
          converted_at?: string
          converted_by?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          gstin?: string | null
          id?: string
          invoice_company_name?: string | null
          job_title?: string | null
          last_discussion?: string | null
          last_discussion_at?: string | null
          last_name?: string | null
          notes?: string | null
          org_id?: string
          pan?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          status?: string | null
          status_updated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_converted_by_fkey"
            columns: ["converted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_templates: {
        Row: {
          approved_at: string | null
          buttons: Json | null
          category: string | null
          content: string
          created_at: string | null
          footer_text: string | null
          header_content: string | null
          header_type: string | null
          id: string
          language: string | null
          last_synced_at: string | null
          org_id: string
          rejection_reason: string | null
          sample_values: Json | null
          status: string | null
          submission_status: string | null
          submitted_at: string | null
          template_id: string
          template_name: string
          template_type: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          approved_at?: string | null
          buttons?: Json | null
          category?: string | null
          content: string
          created_at?: string | null
          footer_text?: string | null
          header_content?: string | null
          header_type?: string | null
          id?: string
          language?: string | null
          last_synced_at?: string | null
          org_id: string
          rejection_reason?: string | null
          sample_values?: Json | null
          status?: string | null
          submission_status?: string | null
          submitted_at?: string | null
          template_id: string
          template_name: string
          template_type: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          approved_at?: string | null
          buttons?: Json | null
          category?: string | null
          content?: string
          created_at?: string | null
          footer_text?: string | null
          header_content?: string | null
          header_type?: string | null
          id?: string
          language?: string | null
          last_synced_at?: string | null
          org_id?: string
          rejection_reason?: string | null
          sample_values?: Json | null
          status?: string | null
          submission_status?: string | null
          submitted_at?: string | null
          template_id?: string
          template_name?: string
          template_type?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_activities: {
        Row: {
          activity_type: string
          call_disposition_id: string | null
          call_duration: number | null
          call_sub_disposition_id: string | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          completed_at: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_minutes: number | null
          google_calendar_event_id: string | null
          id: string
          location_accuracy: number | null
          meeting_duration_minutes: number | null
          meeting_link: string | null
          meeting_platform: string | null
          morning_reminder_sent: boolean | null
          next_action_date: string | null
          next_action_notes: string | null
          org_id: string
          pre_action_reminder_sent: boolean | null
          priority: string | null
          recurring_pattern_id: string | null
          reminder_sent: boolean | null
          scheduled_at: string | null
          subject: string | null
          updated_at: string | null
        }
        Insert: {
          activity_type: string
          call_disposition_id?: string | null
          call_duration?: number | null
          call_sub_disposition_id?: string | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          google_calendar_event_id?: string | null
          id?: string
          location_accuracy?: number | null
          meeting_duration_minutes?: number | null
          meeting_link?: string | null
          meeting_platform?: string | null
          morning_reminder_sent?: boolean | null
          next_action_date?: string | null
          next_action_notes?: string | null
          org_id: string
          pre_action_reminder_sent?: boolean | null
          priority?: string | null
          recurring_pattern_id?: string | null
          reminder_sent?: boolean | null
          scheduled_at?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Update: {
          activity_type?: string
          call_disposition_id?: string | null
          call_duration?: number | null
          call_sub_disposition_id?: string | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          google_calendar_event_id?: string | null
          id?: string
          location_accuracy?: number | null
          meeting_duration_minutes?: number | null
          meeting_link?: string | null
          meeting_platform?: string | null
          morning_reminder_sent?: boolean | null
          next_action_date?: string | null
          next_action_notes?: string | null
          org_id?: string
          pre_action_reminder_sent?: boolean | null
          priority?: string | null
          recurring_pattern_id?: string | null
          reminder_sent?: boolean | null
          scheduled_at?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_activities_call_disposition_id_fkey"
            columns: ["call_disposition_id"]
            isOneToOne: false
            referencedRelation: "call_dispositions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_activities_call_sub_disposition_id_fkey"
            columns: ["call_sub_disposition_id"]
            isOneToOne: false
            referencedRelation: "call_sub_dispositions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_activities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_activities_recurring_pattern_id_fkey"
            columns: ["recurring_pattern_id"]
            isOneToOne: false
            referencedRelation: "recurring_activity_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_custom_fields: {
        Row: {
          contact_id: string
          created_at: string
          custom_field_id: string
          field_value: string | null
          id: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          custom_field_id: string
          field_value?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          custom_field_id?: string
          field_value?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_custom_fields_custom_field_id_fkey"
            columns: ["custom_field_id"]
            isOneToOne: false
            referencedRelation: "custom_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_emails: {
        Row: {
          contact_id: string
          created_at: string
          email: string
          email_type: string
          id: string
          is_primary: boolean
          org_id: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          email: string
          email_type?: string
          id?: string
          is_primary?: boolean
          org_id: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          email?: string
          email_type?: string
          id?: string
          is_primary?: boolean
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_lead_scores: {
        Row: {
          contact_id: string
          id: string
          last_calculated: string
          org_id: string
          score: number
          score_breakdown: Json | null
          score_category: string | null
        }
        Insert: {
          contact_id: string
          id?: string
          last_calculated?: string
          org_id: string
          score?: number
          score_breakdown?: Json | null
          score_category?: string | null
        }
        Update: {
          contact_id?: string
          id?: string
          last_calculated?: string
          org_id?: string
          score?: number
          score_breakdown?: Json | null
          score_category?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_lead_scores_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_lead_scores_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_phones: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          is_primary: boolean
          org_id: string
          phone: string
          phone_type: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          org_id: string
          phone: string
          phone_type?: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          org_id?: string
          phone?: string
          phone_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_phones_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tag_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          contact_id: string
          id: string
          org_id: string
          tag_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          contact_id: string
          id?: string
          org_id: string
          tag_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          contact_id?: string
          id?: string
          org_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tag_assignments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tag_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "contact_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          apollo_person_id: string | null
          assigned_team_id: string | null
          assigned_to: string | null
          city: string | null
          company: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          departments: string[] | null
          education: Json | null
          email: string | null
          email_bounce_type: string | null
          email_bounced_at: string | null
          email_soft_bounce_count: number
          employment_history: Json | null
          enrichment_status: string | null
          facebook_url: string | null
          first_name: string
          github_url: string | null
          headline: string | null
          id: string
          industry_type: string | null
          job_title: string | null
          last_enriched_at: string | null
          last_name: string | null
          last_verified_location_at: string | null
          latitude: number | null
          linkedin_url: string | null
          longitude: number | null
          mkt_native_contact_id: string | null
          mkt_product_key: string | null
          mkt_source: string | null
          mkt_sourced_at: string | null
          nature_of_business: string | null
          notes: string | null
          org_id: string
          organization_founded_year: number | null
          organization_industry: string | null
          organization_keywords: string[] | null
          organization_name: string | null
          person_locations: Json | null
          phone: string | null
          phone_numbers: Json | null
          photo_url: string | null
          pipeline_stage_id: string | null
          postal_code: string | null
          referred_by: string | null
          seniority: string | null
          source: string | null
          state: string | null
          status: string | null
          twitter_url: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          apollo_person_id?: string | null
          assigned_team_id?: string | null
          assigned_to?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          departments?: string[] | null
          education?: Json | null
          email?: string | null
          email_bounce_type?: string | null
          email_bounced_at?: string | null
          email_soft_bounce_count?: number
          employment_history?: Json | null
          enrichment_status?: string | null
          facebook_url?: string | null
          first_name: string
          github_url?: string | null
          headline?: string | null
          id?: string
          industry_type?: string | null
          job_title?: string | null
          last_enriched_at?: string | null
          last_name?: string | null
          last_verified_location_at?: string | null
          latitude?: number | null
          linkedin_url?: string | null
          longitude?: number | null
          mkt_native_contact_id?: string | null
          mkt_product_key?: string | null
          mkt_source?: string | null
          mkt_sourced_at?: string | null
          nature_of_business?: string | null
          notes?: string | null
          org_id: string
          organization_founded_year?: number | null
          organization_industry?: string | null
          organization_keywords?: string[] | null
          organization_name?: string | null
          person_locations?: Json | null
          phone?: string | null
          phone_numbers?: Json | null
          photo_url?: string | null
          pipeline_stage_id?: string | null
          postal_code?: string | null
          referred_by?: string | null
          seniority?: string | null
          source?: string | null
          state?: string | null
          status?: string | null
          twitter_url?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          apollo_person_id?: string | null
          assigned_team_id?: string | null
          assigned_to?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          departments?: string[] | null
          education?: Json | null
          email?: string | null
          email_bounce_type?: string | null
          email_bounced_at?: string | null
          email_soft_bounce_count?: number
          employment_history?: Json | null
          enrichment_status?: string | null
          facebook_url?: string | null
          first_name?: string
          github_url?: string | null
          headline?: string | null
          id?: string
          industry_type?: string | null
          job_title?: string | null
          last_enriched_at?: string | null
          last_name?: string | null
          last_verified_location_at?: string | null
          latitude?: number | null
          linkedin_url?: string | null
          longitude?: number | null
          mkt_native_contact_id?: string | null
          mkt_product_key?: string | null
          mkt_source?: string | null
          mkt_sourced_at?: string | null
          nature_of_business?: string | null
          notes?: string | null
          org_id?: string
          organization_founded_year?: number | null
          organization_industry?: string | null
          organization_keywords?: string[] | null
          organization_name?: string | null
          person_locations?: Json | null
          phone?: string | null
          phone_numbers?: Json | null
          photo_url?: string | null
          pipeline_stage_id?: string | null
          postal_code?: string | null
          referred_by?: string | null
          seniority?: string | null
          source?: string | null
          state?: string | null
          status?: string | null
          twitter_url?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_assigned_team_id_fkey"
            columns: ["assigned_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_pipeline_stage_id_fkey"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          applies_to_table: string
          created_at: string
          field_label: string
          field_name: string
          field_options: Json | null
          field_order: number
          field_type: string
          id: string
          is_active: boolean | null
          is_required: boolean | null
          org_id: string
          updated_at: string
        }
        Insert: {
          applies_to_table: string
          created_at?: string
          field_label: string
          field_name: string
          field_options?: Json | null
          field_order?: number
          field_type: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          org_id: string
          updated_at?: string
        }
        Update: {
          applies_to_table?: string
          created_at?: string
          field_label?: string
          field_name?: string
          field_options?: Json | null
          field_order?: number
          field_type?: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          org_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      designation_feature_access: {
        Row: {
          can_create: boolean | null
          can_delete: boolean | null
          can_edit: boolean | null
          can_view: boolean | null
          created_at: string | null
          custom_permissions: Json | null
          designation_id: string
          feature_key: string
          id: string
          org_id: string
          updated_at: string | null
        }
        Insert: {
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          custom_permissions?: Json | null
          designation_id: string
          feature_key: string
          id?: string
          org_id: string
          updated_at?: string | null
        }
        Update: {
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          custom_permissions?: Json | null
          designation_id?: string
          feature_key?: string
          id?: string
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "designation_feature_access_designation_id_fkey"
            columns: ["designation_id"]
            isOneToOne: false
            referencedRelation: "designations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designation_feature_access_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      designations: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
        }
        Relationships: []
      }
      email_automation_cooldowns: {
        Row: {
          contact_id: string
          id: string
          last_sent_at: string
          org_id: string
          rule_id: string
          send_count: number | null
        }
        Insert: {
          contact_id: string
          id?: string
          last_sent_at: string
          org_id: string
          rule_id: string
          send_count?: number | null
        }
        Update: {
          contact_id?: string
          id?: string
          last_sent_at?: string
          org_id?: string
          rule_id?: string
          send_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_automation_cooldowns_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_cooldowns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_cooldowns_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "email_automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      email_automation_daily_limits: {
        Row: {
          contact_id: string
          email_count: number
          id: string
          last_sent_at: string
          org_id: string
          send_date: string
        }
        Insert: {
          contact_id: string
          email_count?: number
          id?: string
          last_sent_at?: string
          org_id: string
          send_date?: string
        }
        Update: {
          contact_id?: string
          email_count?: number
          id?: string
          last_sent_at?: string
          org_id?: string
          send_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_automation_daily_limits_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_daily_limits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_automation_executions: {
        Row: {
          ab_test_id: string | null
          ab_variant_name: string | null
          contact_id: string
          conversion_type: string | null
          conversion_value: number | null
          converted_at: string | null
          created_at: string | null
          email_conversation_id: string | null
          email_subject: string | null
          email_template_id: string | null
          error_message: string | null
          id: string
          max_retries: number | null
          next_retry_at: string | null
          org_id: string
          retry_count: number | null
          rule_id: string
          scheduled_for: string | null
          sent_at: string | null
          status: string
          trigger_data: Json | null
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          ab_test_id?: string | null
          ab_variant_name?: string | null
          contact_id: string
          conversion_type?: string | null
          conversion_value?: number | null
          converted_at?: string | null
          created_at?: string | null
          email_conversation_id?: string | null
          email_subject?: string | null
          email_template_id?: string | null
          error_message?: string | null
          id?: string
          max_retries?: number | null
          next_retry_at?: string | null
          org_id: string
          retry_count?: number | null
          rule_id: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          trigger_data?: Json | null
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          ab_test_id?: string | null
          ab_variant_name?: string | null
          contact_id?: string
          conversion_type?: string | null
          conversion_value?: number | null
          converted_at?: string | null
          created_at?: string | null
          email_conversation_id?: string | null
          email_subject?: string | null
          email_template_id?: string | null
          error_message?: string | null
          id?: string
          max_retries?: number | null
          next_retry_at?: string | null
          org_id?: string
          retry_count?: number | null
          rule_id?: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          trigger_data?: Json | null
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_automation_executions_ab_test_id_fkey"
            columns: ["ab_test_id"]
            isOneToOne: false
            referencedRelation: "automation_ab_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_executions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_executions_email_conversation_id_fkey"
            columns: ["email_conversation_id"]
            isOneToOne: false
            referencedRelation: "email_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_executions_email_template_id_fkey"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_executions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_executions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "email_automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      email_automation_rule_dependencies: {
        Row: {
          created_at: string
          delay_minutes: number | null
          dependency_type: string
          depends_on_rule_id: string
          id: string
          org_id: string
          rule_id: string
        }
        Insert: {
          created_at?: string
          delay_minutes?: number | null
          dependency_type: string
          depends_on_rule_id: string
          id?: string
          org_id: string
          rule_id: string
        }
        Update: {
          created_at?: string
          delay_minutes?: number | null
          dependency_type?: string
          depends_on_rule_id?: string
          id?: string
          org_id?: string
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_automation_rule_dependencies_depends_on_rule_id_fkey"
            columns: ["depends_on_rule_id"]
            isOneToOne: false
            referencedRelation: "email_automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_rule_dependencies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_rule_dependencies_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "email_automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      email_automation_rule_templates: {
        Row: {
          category: string
          condition_logic: string | null
          conditions: Json | null
          cooldown_period_days: number | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_popular: boolean | null
          name: string
          priority: number | null
          send_delay_minutes: number | null
          trigger_config: Json
          trigger_type: string
          updated_at: string
          use_count: number | null
        }
        Insert: {
          category: string
          condition_logic?: string | null
          conditions?: Json | null
          cooldown_period_days?: number | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_popular?: boolean | null
          name: string
          priority?: number | null
          send_delay_minutes?: number | null
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
          use_count?: number | null
        }
        Update: {
          category?: string
          condition_logic?: string | null
          conditions?: Json | null
          cooldown_period_days?: number | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_popular?: boolean | null
          name?: string
          priority?: number | null
          send_delay_minutes?: number | null
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          use_count?: number | null
        }
        Relationships: []
      }
      email_automation_rules: {
        Row: {
          ab_test_enabled: boolean
          approval_timeout_hours: number | null
          condition_logic: string | null
          conditions: Json | null
          cooldown_period_days: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          email_template_id: string | null
          enforce_business_hours: boolean
          id: string
          is_active: boolean | null
          max_sends_per_contact: number | null
          name: string
          org_id: string
          priority: number | null
          requires_approval: boolean | null
          send_at_specific_time: string | null
          send_delay_minutes: number | null
          send_on_business_days_only: boolean | null
          total_failed: number | null
          total_sent: number | null
          total_triggered: number | null
          trigger_config: Json
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          ab_test_enabled?: boolean
          approval_timeout_hours?: number | null
          condition_logic?: string | null
          conditions?: Json | null
          cooldown_period_days?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          email_template_id?: string | null
          enforce_business_hours?: boolean
          id?: string
          is_active?: boolean | null
          max_sends_per_contact?: number | null
          name: string
          org_id: string
          priority?: number | null
          requires_approval?: boolean | null
          send_at_specific_time?: string | null
          send_delay_minutes?: number | null
          send_on_business_days_only?: boolean | null
          total_failed?: number | null
          total_sent?: number | null
          total_triggered?: number | null
          trigger_config?: Json
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          ab_test_enabled?: boolean
          approval_timeout_hours?: number | null
          condition_logic?: string | null
          conditions?: Json | null
          cooldown_period_days?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          email_template_id?: string | null
          enforce_business_hours?: boolean
          id?: string
          is_active?: boolean | null
          max_sends_per_contact?: number | null
          name?: string
          org_id?: string
          priority?: number | null
          requires_approval?: boolean | null
          send_at_specific_time?: string | null
          send_delay_minutes?: number | null
          send_on_business_days_only?: boolean | null
          total_failed?: number | null
          total_sent?: number | null
          total_triggered?: number | null
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_automation_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_rules_email_template_id_fkey"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_bulk_campaigns: {
        Row: {
          attachments: Json | null
          body_content: string | null
          buttons: Json | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          failed_count: number
          html_content: string
          id: string
          name: string
          org_id: string
          pending_count: number
          scheduled_at: string | null
          sent_count: number
          started_at: string | null
          status: string
          subject: string
          template_id: string | null
          total_recipients: number
          updated_at: string
          variable_mappings: Json | null
        }
        Insert: {
          attachments?: Json | null
          body_content?: string | null
          buttons?: Json | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failed_count?: number
          html_content: string
          id?: string
          name: string
          org_id: string
          pending_count?: number
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          subject: string
          template_id?: string | null
          total_recipients?: number
          updated_at?: string
          variable_mappings?: Json | null
        }
        Update: {
          attachments?: Json | null
          body_content?: string | null
          buttons?: Json | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failed_count?: number
          html_content?: string
          id?: string
          name?: string
          org_id?: string
          pending_count?: number
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          total_recipients?: number
          updated_at?: string
          variable_mappings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_bulk_campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_bulk_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaign_recipients: {
        Row: {
          bounce_reason: string | null
          bounced_at: string | null
          button_clicks: Json | null
          campaign_id: string
          click_count: number | null
          complained_at: string | null
          contact_id: string | null
          created_at: string
          custom_data: Json | null
          delivered_at: string | null
          email: string
          error_message: string | null
          first_clicked_at: string | null
          id: string
          open_count: number | null
          opened_at: string | null
          resend_email_id: string | null
          sent_at: string | null
          status: string
          tracking_pixel_id: string | null
          updated_at: string
        }
        Insert: {
          bounce_reason?: string | null
          bounced_at?: string | null
          button_clicks?: Json | null
          campaign_id: string
          click_count?: number | null
          complained_at?: string | null
          contact_id?: string | null
          created_at?: string
          custom_data?: Json | null
          delivered_at?: string | null
          email: string
          error_message?: string | null
          first_clicked_at?: string | null
          id?: string
          open_count?: number | null
          opened_at?: string | null
          resend_email_id?: string | null
          sent_at?: string | null
          status?: string
          tracking_pixel_id?: string | null
          updated_at?: string
        }
        Update: {
          bounce_reason?: string | null
          bounced_at?: string | null
          button_clicks?: Json | null
          campaign_id?: string
          click_count?: number | null
          complained_at?: string | null
          contact_id?: string | null
          created_at?: string
          custom_data?: Json | null
          delivered_at?: string | null
          email?: string
          error_message?: string | null
          first_clicked_at?: string | null
          id?: string
          open_count?: number | null
          opened_at?: string | null
          resend_email_id?: string | null
          sent_at?: string | null
          status?: string
          tracking_pixel_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_bulk_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_conversations: {
        Row: {
          attachments: Json | null
          bcc_emails: string[] | null
          button_clicks: Json | null
          cc_emails: string[] | null
          click_count: number
          contact_id: string | null
          conversation_id: string
          created_at: string | null
          direction: string
          email_content: string
          first_clicked_at: string | null
          from_email: string
          from_name: string | null
          has_attachments: boolean | null
          html_content: string | null
          id: string
          is_read: boolean | null
          open_count: number
          opened_at: string | null
          org_id: string
          provider_message_id: string | null
          read_at: string | null
          received_at: string | null
          replied_to_message_id: string | null
          reply_to_email: string | null
          scheduled_at: string | null
          sent_at: string | null
          sent_by: string | null
          status: string | null
          subject: string
          thread_id: string | null
          to_email: string
          tracking_pixel_id: string | null
          unsubscribe_token: string | null
          updated_at: string | null
        }
        Insert: {
          attachments?: Json | null
          bcc_emails?: string[] | null
          button_clicks?: Json | null
          cc_emails?: string[] | null
          click_count?: number
          contact_id?: string | null
          conversation_id: string
          created_at?: string | null
          direction: string
          email_content: string
          first_clicked_at?: string | null
          from_email: string
          from_name?: string | null
          has_attachments?: boolean | null
          html_content?: string | null
          id?: string
          is_read?: boolean | null
          open_count?: number
          opened_at?: string | null
          org_id: string
          provider_message_id?: string | null
          read_at?: string | null
          received_at?: string | null
          replied_to_message_id?: string | null
          reply_to_email?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          subject: string
          thread_id?: string | null
          to_email: string
          tracking_pixel_id?: string | null
          unsubscribe_token?: string | null
          updated_at?: string | null
        }
        Update: {
          attachments?: Json | null
          bcc_emails?: string[] | null
          button_clicks?: Json | null
          cc_emails?: string[] | null
          click_count?: number
          contact_id?: string | null
          conversation_id?: string
          created_at?: string | null
          direction?: string
          email_content?: string
          first_clicked_at?: string | null
          from_email?: string
          from_name?: string | null
          has_attachments?: boolean | null
          html_content?: string | null
          id?: string
          is_read?: boolean | null
          open_count?: number
          opened_at?: string | null
          org_id?: string
          provider_message_id?: string | null
          read_at?: string | null
          received_at?: string | null
          replied_to_message_id?: string | null
          reply_to_email?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          subject?: string
          thread_id?: string | null
          to_email?: string
          tracking_pixel_id?: string | null
          unsubscribe_token?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_conversations_replied_to_message_id_fkey"
            columns: ["replied_to_message_id"]
            isOneToOne: false
            referencedRelation: "email_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_engagement_patterns: {
        Row: {
          click_count: number | null
          contact_id: string | null
          day_of_week: number
          engagement_score: number | null
          hour_of_day: number
          id: string
          last_updated: string
          open_count: number | null
          org_id: string
        }
        Insert: {
          click_count?: number | null
          contact_id?: string | null
          day_of_week: number
          engagement_score?: number | null
          hour_of_day: number
          id?: string
          last_updated?: string
          open_count?: number | null
          org_id: string
        }
        Update: {
          click_count?: number | null
          contact_id?: string | null
          day_of_week?: number
          engagement_score?: number | null
          hour_of_day?: number
          id?: string
          last_updated?: string
          open_count?: number | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_engagement_patterns_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_engagement_patterns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_settings: {
        Row: {
          created_at: string | null
          dns_records: Json | null
          id: string
          inbound_route_id: string | null
          inbound_routing_enabled: boolean | null
          inbound_webhook_url: string | null
          is_active: boolean | null
          org_id: string
          resend_domain_id: string | null
          sending_domain: string
          updated_at: string | null
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          dns_records?: Json | null
          id?: string
          inbound_route_id?: string | null
          inbound_routing_enabled?: boolean | null
          inbound_webhook_url?: string | null
          is_active?: boolean | null
          org_id: string
          resend_domain_id?: string | null
          sending_domain: string
          updated_at?: string | null
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          dns_records?: Json | null
          id?: string
          inbound_route_id?: string | null
          inbound_routing_enabled?: boolean | null
          inbound_webhook_url?: string | null
          is_active?: boolean | null
          org_id?: string
          resend_domain_id?: string | null
          sending_domain?: string
          updated_at?: string | null
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppression_list: {
        Row: {
          created_at: string
          email: string
          id: string
          notes: string | null
          org_id: string
          reason: string
          suppressed_at: string
          suppressed_by: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          notes?: string | null
          org_id: string
          reason: string
          suppressed_at?: string
          suppressed_by?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          notes?: string | null
          org_id?: string
          reason?: string
          suppressed_at?: string
          suppressed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_suppression_list_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          attachments: Json | null
          body_content: string | null
          buttons: Json | null
          created_at: string
          created_by: string | null
          design_json: Json | null
          html_content: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          attachments?: Json | null
          body_content?: string | null
          buttons?: Json | null
          created_at?: string
          created_by?: string | null
          design_json?: Json | null
          html_content?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          subject: string
          updated_at?: string
        }
        Update: {
          attachments?: Json | null
          body_content?: string | null
          buttons?: Json | null
          created_at?: string
          created_by?: string | null
          design_json?: Json | null
          html_content?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_unsubscribes: {
        Row: {
          contact_id: string | null
          email: string
          id: string
          ip_address: unknown
          org_id: string
          source: string
          unsubscribe_token: string
          unsubscribed_at: string
          user_agent: string | null
        }
        Insert: {
          contact_id?: string | null
          email: string
          id?: string
          ip_address?: unknown
          org_id: string
          source: string
          unsubscribe_token: string
          unsubscribed_at?: string
          user_agent?: string | null
        }
        Update: {
          contact_id?: string | null
          email?: string
          id?: string
          ip_address?: unknown
          org_id?: string
          source?: string
          unsubscribe_token?: string
          unsubscribed_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_unsubscribes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_unsubscribes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          created_at: string
          error_details: Json | null
          error_message: string
          error_type: string
          id: string
          org_id: string
          page_url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_details?: Json | null
          error_message: string
          error_type: string
          id?: string
          org_id: string
          page_url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_details?: Json | null
          error_message?: string
          error_type?: string
          id?: string
          org_id?: string
          page_url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exotel_settings: {
        Row: {
          account_sid: string
          api_key: string
          api_token: string
          call_recording_enabled: boolean | null
          caller_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          org_id: string
          sms_enabled: boolean | null
          sms_sender_id: string | null
          subdomain: string
          updated_at: string | null
          waba_id: string | null
          whatsapp_enabled: boolean | null
          whatsapp_source_number: string | null
        }
        Insert: {
          account_sid: string
          api_key: string
          api_token: string
          call_recording_enabled?: boolean | null
          caller_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          org_id: string
          sms_enabled?: boolean | null
          sms_sender_id?: string | null
          subdomain?: string
          updated_at?: string | null
          waba_id?: string | null
          whatsapp_enabled?: boolean | null
          whatsapp_source_number?: string | null
        }
        Update: {
          account_sid?: string
          api_key?: string
          api_token?: string
          call_recording_enabled?: boolean | null
          caller_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          org_id?: string
          sms_enabled?: boolean | null
          sms_sender_id?: string | null
          subdomain?: string
          updated_at?: string | null
          waba_id?: string | null
          whatsapp_enabled?: boolean | null
          whatsapp_source_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exotel_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      external_entities: {
        Row: {
          address: string | null
          city: string | null
          company: string | null
          country: string | null
          created_at: string
          created_by: string | null
          email: string | null
          entity_type: string
          id: string
          name: string
          notes: string | null
          org_id: string
          phone: string | null
          postal_code: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          entity_type?: string
          id?: string
          name: string
          notes?: string | null
          org_id: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          entity_type?: string
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_entities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_permissions: {
        Row: {
          category: string
          created_at: string | null
          feature_description: string | null
          feature_key: string
          feature_name: string
          id: string
          is_premium: boolean | null
        }
        Insert: {
          category: string
          created_at?: string | null
          feature_description?: string | null
          feature_key: string
          feature_name: string
          id?: string
          is_premium?: boolean | null
        }
        Update: {
          category?: string
          created_at?: string | null
          feature_description?: string | null
          feature_key?: string
          feature_name?: string
          id?: string
          is_premium?: boolean | null
        }
        Relationships: []
      }
      gst_payment_tracking: {
        Row: {
          amount_paid: number | null
          created_at: string
          created_by: string | null
          gst_collected: number
          id: string
          month: number
          notes: string | null
          org_id: string
          payment_date: string | null
          payment_reference: string | null
          payment_status: string
          updated_at: string
          year: number
        }
        Insert: {
          amount_paid?: number | null
          created_at?: string
          created_by?: string | null
          gst_collected?: number
          id?: string
          month: number
          notes?: string | null
          org_id: string
          payment_date?: string | null
          payment_reference?: string | null
          payment_status?: string
          updated_at?: string
          year: number
        }
        Update: {
          amount_paid?: number | null
          created_at?: string
          created_by?: string | null
          gst_collected?: number
          id?: string
          month?: number
          notes?: string | null
          org_id?: string
          payment_date?: string | null
          payment_reference?: string | null
          payment_status?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "gst_payment_tracking_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          amount: number | null
          available_qty: number
          created_at: string
          created_by: string | null
          id: string
          import_job_id: string | null
          item_id_sku: string
          item_name: string | null
          org_id: string
          pending_po: number | null
          pending_so: number | null
          selling_price: number | null
          uom: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          available_qty?: number
          created_at?: string
          created_by?: string | null
          id?: string
          import_job_id?: string | null
          item_id_sku: string
          item_name?: string | null
          org_id: string
          pending_po?: number | null
          pending_so?: number | null
          selling_price?: number | null
          uom?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          available_qty?: number
          created_at?: string
          created_by?: string | null
          id?: string
          import_job_id?: string | null
          item_id_sku?: string
          item_name?: string | null
          org_id?: string
          pending_po?: number | null
          pending_so?: number | null
          selling_price?: number | null
          uom?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invoice_import_items: {
        Row: {
          action: string | null
          amount: number | null
          client_address: string | null
          client_company: string | null
          client_email: string | null
          client_name: string | null
          client_phone: string | null
          created_at: string
          created_client_id: string | null
          created_contact_id: string | null
          currency: string | null
          due_date: string | null
          duplicate_status: string
          error_message: string | null
          extracted_data: Json | null
          file_name: string
          file_url: string | null
          id: string
          import_id: string
          invoice_date: string | null
          invoice_number: string | null
          matched_client_id: string | null
          matched_contact_id: string | null
          org_id: string
          potential_matches: Json | null
          status: string
          tax_amount: number | null
          updated_at: string
        }
        Insert: {
          action?: string | null
          amount?: number | null
          client_address?: string | null
          client_company?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          created_at?: string
          created_client_id?: string | null
          created_contact_id?: string | null
          currency?: string | null
          due_date?: string | null
          duplicate_status?: string
          error_message?: string | null
          extracted_data?: Json | null
          file_name: string
          file_url?: string | null
          id?: string
          import_id: string
          invoice_date?: string | null
          invoice_number?: string | null
          matched_client_id?: string | null
          matched_contact_id?: string | null
          org_id: string
          potential_matches?: Json | null
          status?: string
          tax_amount?: number | null
          updated_at?: string
        }
        Update: {
          action?: string | null
          amount?: number | null
          client_address?: string | null
          client_company?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          created_at?: string
          created_client_id?: string | null
          created_contact_id?: string | null
          currency?: string | null
          due_date?: string | null
          duplicate_status?: string
          error_message?: string | null
          extracted_data?: Json | null
          file_name?: string
          file_url?: string | null
          id?: string
          import_id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          matched_client_id?: string | null
          matched_contact_id?: string | null
          org_id?: string
          potential_matches?: Json | null
          status?: string
          tax_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_import_items_created_client_id_fkey"
            columns: ["created_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_import_items_created_contact_id_fkey"
            columns: ["created_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_import_items_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "invoice_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_import_items_matched_client_id_fkey"
            columns: ["matched_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_import_items_matched_contact_id_fkey"
            columns: ["matched_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_import_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_imports: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          processed_files: number
          status: string
          total_files: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          processed_files?: number
          status?: string
          total_files?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          processed_files?: number
          status?: string
          total_files?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_imports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_imports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          bank_transaction_id: string | null
          billing_document_id: string | null
          created_at: string | null
          created_by: string | null
          entry_date: string
          id: string
          invoice_amount: number | null
          invoice_currency: string | null
          invoice_date: string | null
          invoice_description: string | null
          invoice_number: string | null
          invoice_party: string | null
          invoice_url: string | null
          narration: string
          org_id: string
          reference: string | null
          source: string
        }
        Insert: {
          bank_transaction_id?: string | null
          billing_document_id?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date: string
          id?: string
          invoice_amount?: number | null
          invoice_currency?: string | null
          invoice_date?: string | null
          invoice_description?: string | null
          invoice_number?: string | null
          invoice_party?: string | null
          invoice_url?: string | null
          narration?: string
          org_id: string
          reference?: string | null
          source?: string
        }
        Update: {
          bank_transaction_id?: string | null
          billing_document_id?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date?: string
          id?: string
          invoice_amount?: number | null
          invoice_currency?: string | null
          invoice_date?: string | null
          invoice_description?: string | null
          invoice_number?: string | null
          invoice_party?: string | null
          invoice_url?: string | null
          narration?: string
          org_id?: string
          reference?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_billing_document_id_fkey"
            columns: ["billing_document_id"]
            isOneToOne: false
            referencedRelation: "billing_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          created_at: string | null
          credit: number
          debit: number
          entry_id: string
          id: string
          narration: string | null
          sort_order: number
        }
        Insert: {
          account_id: string
          created_at?: string | null
          credit?: number
          debit?: number
          entry_id: string
          id?: string
          narration?: string | null
          sort_order?: number
        }
        Update: {
          account_id?: string
          created_at?: string | null
          credit?: number
          debit?: number
          entry_id?: string
          id?: string
          narration?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_alert_calls: {
        Row: {
          attempt_number: number
          bolna_execution_id: string | null
          created_at: string
          id: string
          lead: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempt_number?: number
          bolna_execution_id?: string | null
          created_at?: string
          id?: string
          lead: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_number?: number
          bolna_execution_id?: string | null
          created_at?: string
          id?: string
          lead?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      mkt_ab_test_results: {
        Row: {
          ab_test_id: string
          click_rate: number | null
          clicks: number | null
          conversion_rate: number | null
          conversions: number | null
          created_at: string | null
          id: string
          open_rate: number | null
          opens: number | null
          org_id: string
          replies: number | null
          reply_rate: number | null
          sends: number | null
          updated_at: string | null
          variant: string
        }
        Insert: {
          ab_test_id: string
          click_rate?: number | null
          clicks?: number | null
          conversion_rate?: number | null
          conversions?: number | null
          created_at?: string | null
          id?: string
          open_rate?: number | null
          opens?: number | null
          org_id: string
          replies?: number | null
          reply_rate?: number | null
          sends?: number | null
          updated_at?: string | null
          variant: string
        }
        Update: {
          ab_test_id?: string
          click_rate?: number | null
          clicks?: number | null
          conversion_rate?: number | null
          conversions?: number | null
          created_at?: string | null
          id?: string
          open_rate?: number | null
          opens?: number | null
          org_id?: string
          replies?: number | null
          reply_rate?: number | null
          sends?: number | null
          updated_at?: string | null
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_ab_test_results_ab_test_id_fkey"
            columns: ["ab_test_id"]
            isOneToOne: false
            referencedRelation: "mkt_ab_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ab_test_results_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_ab_tests: {
        Row: {
          analysis: string | null
          campaign_id: string
          completed_at: string | null
          confidence: number | null
          created_at: string | null
          id: string
          metric: string
          min_samples: number | null
          name: string
          org_id: string
          started_at: string | null
          status: string
          step_id: string | null
          updated_at: string | null
          variants: Json
          winner: string | null
        }
        Insert: {
          analysis?: string | null
          campaign_id: string
          completed_at?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          metric?: string
          min_samples?: number | null
          name: string
          org_id: string
          started_at?: string | null
          status?: string
          step_id?: string | null
          updated_at?: string | null
          variants?: Json
          winner?: string | null
        }
        Update: {
          analysis?: string | null
          campaign_id?: string
          completed_at?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          metric?: string
          min_samples?: number | null
          name?: string
          org_id?: string
          started_at?: string | null
          status?: string
          step_id?: string | null
          updated_at?: string | null
          variants?: Json
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_ab_tests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ab_tests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ab_tests_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaign_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_activation_events: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          lead_id: string | null
          occurred_at: string | null
          org_id: string
          product_key: string
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          lead_id?: string | null
          occurred_at?: string | null
          org_id: string
          product_key: string
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          lead_id?: string | null
          occurred_at?: string | null
          org_id?: string
          product_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_activation_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_ad_campaigns: {
        Row: {
          channel: string
          content_strategy_note: string | null
          created_at: string
          currency: string
          daily_budget: number
          descriptions: Json | null
          duration_days: number
          end_date: string
          error_message: string | null
          google_ad_group_id: string | null
          google_budget_id: string | null
          google_campaign_id: string | null
          google_customer_id: string | null
          headlines: Json | null
          id: string
          image_source: string | null
          image_url: string | null
          keywords: Json | null
          launch_date: string
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          meta_headline: string | null
          name: string
          org_id: string
          primary_text: string | null
          product_key: string | null
          status: string
          updated_at: string
          video_source: string | null
          video_url: string | null
        }
        Insert: {
          channel: string
          content_strategy_note?: string | null
          created_at?: string
          currency?: string
          daily_budget: number
          descriptions?: Json | null
          duration_days: number
          end_date: string
          error_message?: string | null
          google_ad_group_id?: string | null
          google_budget_id?: string | null
          google_campaign_id?: string | null
          google_customer_id?: string | null
          headlines?: Json | null
          id?: string
          image_source?: string | null
          image_url?: string | null
          keywords?: Json | null
          launch_date: string
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_headline?: string | null
          name: string
          org_id: string
          primary_text?: string | null
          product_key?: string | null
          status?: string
          updated_at?: string
          video_source?: string | null
          video_url?: string | null
        }
        Update: {
          channel?: string
          content_strategy_note?: string | null
          created_at?: string
          currency?: string
          daily_budget?: number
          descriptions?: Json | null
          duration_days?: number
          end_date?: string
          error_message?: string | null
          google_ad_group_id?: string | null
          google_budget_id?: string | null
          google_campaign_id?: string | null
          google_customer_id?: string | null
          headlines?: Json | null
          id?: string
          image_source?: string | null
          image_url?: string | null
          keywords?: Json | null
          launch_date?: string
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_headline?: string | null
          name?: string
          org_id?: string
          primary_text?: string | null
          product_key?: string | null
          status?: string
          updated_at?: string
          video_source?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      mkt_apollo_searches: {
        Row: {
          api_credits_used: number | null
          campaign_id: string | null
          created_at: string | null
          duplicates_count: number | null
          error: string | null
          id: string
          new_leads_count: number | null
          org_id: string
          results_count: number | null
          search_params: Json
          status: string | null
        }
        Insert: {
          api_credits_used?: number | null
          campaign_id?: string | null
          created_at?: string | null
          duplicates_count?: number | null
          error?: string | null
          id?: string
          new_leads_count?: number | null
          org_id: string
          results_count?: number | null
          search_params: Json
          status?: string | null
        }
        Update: {
          api_credits_used?: number | null
          campaign_id?: string | null
          created_at?: string | null
          duplicates_count?: number | null
          error?: string | null
          id?: string
          new_leads_count?: number | null
          org_id?: string
          results_count?: number | null
          search_params?: Json
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_apollo_searches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_apollo_searches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_arohan_conversations: {
        Row: {
          actions_triggered: Json
          context_snapshot: Json | null
          created_at: string
          id: string
          is_suggestion: boolean
          message: string
          org_id: string
          role: string
          suggestion_applied: boolean
          suggestion_applied_at: string | null
          suggestion_payload: Json | null
          thread_id: string
        }
        Insert: {
          actions_triggered?: Json
          context_snapshot?: Json | null
          created_at?: string
          id?: string
          is_suggestion?: boolean
          message: string
          org_id: string
          role: string
          suggestion_applied?: boolean
          suggestion_applied_at?: string | null
          suggestion_payload?: Json | null
          thread_id: string
        }
        Update: {
          actions_triggered?: Json
          context_snapshot?: Json | null
          created_at?: string
          id?: string
          is_suggestion?: boolean
          message?: string
          org_id?: string
          role?: string
          suggestion_applied?: boolean
          suggestion_applied_at?: string | null
          suggestion_payload?: Json | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_arohan_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_boost_history: {
        Row: {
          ad_id: string | null
          adset_id: string | null
          campaign_id: string | null
          channel: string
          created_at: string
          daily_budget_paise: number
          days: number
          end_date: string
          error: string | null
          fb_post_id: string | null
          id: string
          org_id: string
          source_post_id: string | null
          start_date: string
          status: string
          total_budget_paise: number
          updated_at: string
          week_start: string
        }
        Insert: {
          ad_id?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          channel: string
          created_at?: string
          daily_budget_paise: number
          days: number
          end_date: string
          error?: string | null
          fb_post_id?: string | null
          id?: string
          org_id: string
          source_post_id?: string | null
          start_date: string
          status?: string
          total_budget_paise: number
          updated_at?: string
          week_start: string
        }
        Update: {
          ad_id?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          channel?: string
          created_at?: string
          daily_budget_paise?: number
          days?: number
          end_date?: string
          error?: string | null
          fb_post_id?: string | null
          id?: string
          org_id?: string
          source_post_id?: string | null
          start_date?: string
          status?: string
          total_budget_paise?: number
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_boost_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_boost_history_source_post_id_fkey"
            columns: ["source_post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_budget_allocation: {
        Row: {
          allocated_paise: number | null
          allocation_rule: string | null
          channel_key: string
          created_at: string | null
          id: string
          org_id: string
          period_end: string
          period_start: string
          roas: number | null
          spent_paise: number | null
          total_budget_paise: number | null
          updated_at: string | null
        }
        Insert: {
          allocated_paise?: number | null
          allocation_rule?: string | null
          channel_key: string
          created_at?: string | null
          id?: string
          org_id: string
          period_end: string
          period_start: string
          roas?: number | null
          spent_paise?: number | null
          total_budget_paise?: number | null
          updated_at?: string | null
        }
        Update: {
          allocated_paise?: number | null
          allocation_rule?: string | null
          channel_key?: string
          created_at?: string | null
          id?: string
          org_id?: string
          period_end?: string
          period_start?: string
          roas?: number | null
          spent_paise?: number | null
          total_budget_paise?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_budget_allocation_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_call_scripts: {
        Row: {
          bolna_agent_id: string | null
          call_type: string | null
          closing: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          key_points: Json | null
          language: string | null
          max_duration_seconds: number | null
          name: string
          objection_handling: Json | null
          objective: string
          opening: string
          org_id: string
          product_key: string | null
          updated_at: string | null
          voice_id: string | null
        }
        Insert: {
          bolna_agent_id?: string | null
          call_type?: string | null
          closing?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          key_points?: Json | null
          language?: string | null
          max_duration_seconds?: number | null
          name: string
          objection_handling?: Json | null
          objective: string
          opening: string
          org_id: string
          product_key?: string | null
          updated_at?: string | null
          voice_id?: string | null
        }
        Update: {
          bolna_agent_id?: string | null
          call_type?: string | null
          closing?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          key_points?: Json | null
          language?: string | null
          max_duration_seconds?: number | null
          name?: string
          objection_handling?: Json | null
          objective?: string
          opening?: string
          org_id?: string
          product_key?: string | null
          updated_at?: string | null
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_call_scripts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_campaign_steps: {
        Row: {
          ab_test_id: string | null
          campaign_id: string
          channel: string
          conditions: Json | null
          created_at: string | null
          delay_hours: number
          id: string
          is_active: boolean | null
          org_id: string
          step_number: number
          template_id: string | null
          template_ids: string[] | null
          template_type: string | null
          updated_at: string | null
        }
        Insert: {
          ab_test_id?: string | null
          campaign_id: string
          channel: string
          conditions?: Json | null
          created_at?: string | null
          delay_hours?: number
          id?: string
          is_active?: boolean | null
          org_id: string
          step_number: number
          template_id?: string | null
          template_ids?: string[] | null
          template_type?: string | null
          updated_at?: string | null
        }
        Update: {
          ab_test_id?: string | null
          campaign_id?: string
          channel?: string
          conditions?: Json | null
          created_at?: string | null
          delay_hours?: number
          id?: string
          is_active?: boolean | null
          org_id?: string
          step_number?: number
          template_id?: string | null
          template_ids?: string[] | null
          template_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_campaign_steps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_campaign_steps_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_campaigns: {
        Row: {
          budget: number | null
          budget_spent: number | null
          campaign_type: string
          created_at: string | null
          created_by: string | null
          currency: string | null
          end_date: string | null
          id: string
          max_enrollments: number | null
          metadata: Json | null
          name: string
          org_id: string
          paused_at: string | null
          paused_reason: string | null
          probe_sent_at: string | null
          product_key: string | null
          sequence_priority: number | null
          start_date: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          budget?: number | null
          budget_spent?: number | null
          campaign_type?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          end_date?: string | null
          id?: string
          max_enrollments?: number | null
          metadata?: Json | null
          name: string
          org_id: string
          paused_at?: string | null
          paused_reason?: string | null
          probe_sent_at?: string | null
          product_key?: string | null
          sequence_priority?: number | null
          start_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          budget?: number | null
          budget_spent?: number | null
          campaign_type?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          end_date?: string | null
          id?: string
          max_enrollments?: number | null
          metadata?: Json | null
          name?: string
          org_id?: string
          paused_at?: string | null
          paused_reason?: string | null
          probe_sent_at?: string | null
          product_key?: string | null
          sequence_priority?: number | null
          start_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_channel_metrics: {
        Row: {
          bounces: number | null
          campaign_id: string | null
          channel: string
          clicks: number | null
          conversions: number | null
          cost: number | null
          created_at: string | null
          deliveries: number | null
          id: string
          metric_date: string
          opens: number | null
          org_id: string
          replies: number | null
          sends: number | null
          unsubscribes: number | null
          updated_at: string | null
        }
        Insert: {
          bounces?: number | null
          campaign_id?: string | null
          channel: string
          clicks?: number | null
          conversions?: number | null
          cost?: number | null
          created_at?: string | null
          deliveries?: number | null
          id?: string
          metric_date: string
          opens?: number | null
          org_id: string
          replies?: number | null
          sends?: number | null
          unsubscribes?: number | null
          updated_at?: string | null
        }
        Update: {
          bounces?: number | null
          campaign_id?: string | null
          channel?: string
          clicks?: number | null
          conversions?: number | null
          cost?: number | null
          created_at?: string | null
          deliveries?: number | null
          id?: string
          metric_date?: string
          opens?: number | null
          org_id?: string
          replies?: number | null
          sends?: number | null
          unsubscribes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_channel_metrics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_channel_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_channel_plan: {
        Row: {
          actual_start_date: string | null
          channel: string
          created_at: string | null
          id: string
          notes: string | null
          org_id: string
          planned_start_date: string | null
          product_key: string
          status: string
          updated_at: string | null
        }
        Insert: {
          actual_start_date?: string | null
          channel: string
          created_at?: string | null
          id?: string
          notes?: string | null
          org_id: string
          planned_start_date?: string | null
          product_key: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          actual_start_date?: string | null
          channel?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          planned_start_date?: string | null
          product_key?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_channel_plan_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_channel_stats_daily: {
        Row: {
          channel: string
          created_at: string
          extra: Json
          followers: number | null
          id: string
          org_id: string
          stat_date: string
        }
        Insert: {
          channel: string
          created_at?: string
          extra?: Json
          followers?: number | null
          id?: string
          org_id: string
          stat_date: string
        }
        Update: {
          channel?: string
          created_at?: string
          extra?: Json
          followers?: number | null
          id?: string
          org_id?: string
          stat_date?: string
        }
        Relationships: []
      }
      mkt_channels: {
        Row: {
          active: boolean | null
          channel_key: string
          cost_paise: number | null
          created_at: string | null
          daily_cap: number | null
          id: string
          is_paid: boolean | null
          org_id: string
          requires_approval: boolean | null
          unlock_milestone: string | null
        }
        Insert: {
          active?: boolean | null
          channel_key: string
          cost_paise?: number | null
          created_at?: string | null
          daily_cap?: number | null
          id?: string
          is_paid?: boolean | null
          org_id: string
          requires_approval?: boolean | null
          unlock_milestone?: string | null
        }
        Update: {
          active?: boolean | null
          channel_key?: string
          cost_paise?: number | null
          created_at?: string | null
          daily_cap?: number | null
          id?: string
          is_paid?: boolean | null
          org_id?: string
          requires_approval?: boolean | null
          unlock_milestone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_channels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_click_events: {
        Row: {
          action_id: string | null
          bot_reason: string | null
          channel: string
          clicked_at: string
          contact_id: string | null
          id: string
          ip_hash: string | null
          is_bot: boolean
          is_duplicate: boolean
          org_id: string
          url: string | null
          user_agent: string | null
        }
        Insert: {
          action_id?: string | null
          bot_reason?: string | null
          channel?: string
          clicked_at?: string
          contact_id?: string | null
          id?: string
          ip_hash?: string | null
          is_bot?: boolean
          is_duplicate?: boolean
          org_id: string
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          action_id?: string | null
          bot_reason?: string | null
          channel?: string
          clicked_at?: string
          contact_id?: string | null
          id?: string
          ip_hash?: string | null
          is_bot?: boolean
          is_duplicate?: boolean
          org_id?: string
          url?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_click_events_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "mkt_sequence_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_click_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_click_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_client_outcomes: {
        Row: {
          calls_engaged: number | null
          calls_made: number | null
          contact_id: string | null
          created_at: string | null
          deals_won: number | null
          email_opened_at: string | null
          emailed_at: string | null
          emails_opened: number | null
          emails_sent: number | null
          id: string
          leads_qualified: number | null
          leads_sourced: number | null
          meetings_booked: number | null
          narrative: string | null
          org_id: string
          report_month: string
          revenue_generated: number | null
          roi_pct: number | null
          updated_at: string | null
          whatsapp_replied: number | null
          whatsapp_sent: number | null
        }
        Insert: {
          calls_engaged?: number | null
          calls_made?: number | null
          contact_id?: string | null
          created_at?: string | null
          deals_won?: number | null
          email_opened_at?: string | null
          emailed_at?: string | null
          emails_opened?: number | null
          emails_sent?: number | null
          id?: string
          leads_qualified?: number | null
          leads_sourced?: number | null
          meetings_booked?: number | null
          narrative?: string | null
          org_id: string
          report_month: string
          revenue_generated?: number | null
          roi_pct?: number | null
          updated_at?: string | null
          whatsapp_replied?: number | null
          whatsapp_sent?: number | null
        }
        Update: {
          calls_engaged?: number | null
          calls_made?: number | null
          contact_id?: string | null
          created_at?: string | null
          deals_won?: number | null
          email_opened_at?: string | null
          emailed_at?: string | null
          emails_opened?: number | null
          emails_sent?: number | null
          id?: string
          leads_qualified?: number | null
          leads_sourced?: number | null
          meetings_booked?: number | null
          narrative?: string | null
          org_id?: string
          report_month?: string
          revenue_generated?: number | null
          roi_pct?: number | null
          updated_at?: string | null
          whatsapp_replied?: number | null
          whatsapp_sent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_client_outcomes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_client_outcomes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_conversation_memory: {
        Row: {
          context: Json
          created_at: string | null
          id: string
          last_channel: string | null
          last_interaction_at: string | null
          lead_id: string
          org_id: string
          summary_count: number | null
          token_count: number | null
          updated_at: string | null
        }
        Insert: {
          context?: Json
          created_at?: string | null
          id?: string
          last_channel?: string | null
          last_interaction_at?: string | null
          lead_id: string
          org_id: string
          summary_count?: number | null
          token_count?: number | null
          updated_at?: string | null
        }
        Update: {
          context?: Json
          created_at?: string | null
          id?: string
          last_channel?: string | null
          last_interaction_at?: string | null
          lead_id?: string
          org_id?: string
          summary_count?: number | null
          token_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_conversation_memory_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_conversation_memory_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_crosssell_pairs: {
        Row: {
          conversion_rate: number | null
          created_at: string | null
          id: string
          last_evaluated_at: string | null
          org_id: string
          rank: number | null
          sample_size: number | null
          source_product_key: string
          target_product_key: string
        }
        Insert: {
          conversion_rate?: number | null
          created_at?: string | null
          id?: string
          last_evaluated_at?: string | null
          org_id: string
          rank?: number | null
          sample_size?: number | null
          source_product_key: string
          target_product_key: string
        }
        Update: {
          conversion_rate?: number | null
          created_at?: string | null
          id?: string
          last_evaluated_at?: string | null
          org_id?: string
          rank?: number | null
          sample_size?: number | null
          source_product_key?: string
          target_product_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_crosssell_pairs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_daily_digests: {
        Row: {
          created_at: string | null
          digest_date: string
          emailed_at: string | null
          emailed_to: string[] | null
          id: string
          metrics: Json
          narrative: string | null
          org_id: string
          recommendations: Json | null
        }
        Insert: {
          created_at?: string | null
          digest_date: string
          emailed_at?: string | null
          emailed_to?: string[] | null
          id?: string
          metrics?: Json
          narrative?: string | null
          org_id: string
          recommendations?: Json | null
        }
        Update: {
          created_at?: string | null
          digest_date?: string
          emailed_at?: string | null
          emailed_to?: string[] | null
          id?: string
          metrics?: Json
          narrative?: string | null
          org_id?: string
          recommendations?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_daily_digests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_dropoff_snapshots: {
        Row: {
          aha_moments_reached: number | null
          aha_reached: number | null
          aha_to_payment_pct: number | null
          clients_at_day30: number | null
          created_at: string | null
          feature_usage: Json | null
          id: string
          landing_page_visitors: number | null
          landing_to_trial_pct: number | null
          org_id: string
          payments_received: number | null
          product_key: string
          retention_30_pct: number | null
          satisfied_at_day30: number | null
          snapshot_date: string
          trial_signups: number | null
          trial_to_aha_pct: number | null
          trials_started: number | null
        }
        Insert: {
          aha_moments_reached?: number | null
          aha_reached?: number | null
          aha_to_payment_pct?: number | null
          clients_at_day30?: number | null
          created_at?: string | null
          feature_usage?: Json | null
          id?: string
          landing_page_visitors?: number | null
          landing_to_trial_pct?: number | null
          org_id: string
          payments_received?: number | null
          product_key: string
          retention_30_pct?: number | null
          satisfied_at_day30?: number | null
          snapshot_date: string
          trial_signups?: number | null
          trial_to_aha_pct?: number | null
          trials_started?: number | null
        }
        Update: {
          aha_moments_reached?: number | null
          aha_reached?: number | null
          aha_to_payment_pct?: number | null
          clients_at_day30?: number | null
          created_at?: string | null
          feature_usage?: Json | null
          id?: string
          landing_page_visitors?: number | null
          landing_to_trial_pct?: number | null
          org_id?: string
          payments_received?: number | null
          product_key?: string
          retention_30_pct?: number | null
          satisfied_at_day30?: number | null
          snapshot_date?: string
          trial_signups?: number | null
          trial_to_aha_pct?: number | null
          trials_started?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_dropoff_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_email_templates: {
        Row: {
          body_html: string
          body_text: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          from_name: string | null
          id: string
          is_active: boolean | null
          name: string
          org_id: string
          reply_to: string | null
          subject: string
          updated_at: string | null
          variables: Json | null
          variant_label: string | null
          variant_of: string | null
        }
        Insert: {
          body_html: string
          body_text?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          from_name?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          org_id: string
          reply_to?: string | null
          subject: string
          updated_at?: string | null
          variables?: Json | null
          variant_label?: string | null
          variant_of?: string | null
        }
        Update: {
          body_html?: string
          body_text?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          from_name?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          org_id?: string
          reply_to?: string | null
          subject?: string
          updated_at?: string | null
          variables?: Json | null
          variant_label?: string | null
          variant_of?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_email_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_email_templates_variant_of_fkey"
            columns: ["variant_of"]
            isOneToOne: false
            referencedRelation: "mkt_email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_engine_config: {
        Row: {
          config_key: string
          config_value: Json
          created_at: string | null
          description: string | null
          id: string
          org_id: string
          updated_at: string | null
        }
        Insert: {
          config_key: string
          config_value: Json
          created_at?: string | null
          description?: string | null
          id?: string
          org_id: string
          updated_at?: string | null
        }
        Update: {
          config_key?: string
          config_value?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_engine_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_engine_logs: {
        Row: {
          action: string
          alert_email_sent_at: string | null
          created_at: string | null
          details: Json | null
          duration_ms: number | null
          error: string | null
          function_name: string
          id: string
          level: string
          log_type: string | null
          org_id: string | null
          paused_component: string | null
          resolved_at: string | null
          resolved_by: string | null
          tokens_used: number | null
        }
        Insert: {
          action: string
          alert_email_sent_at?: string | null
          created_at?: string | null
          details?: Json | null
          duration_ms?: number | null
          error?: string | null
          function_name: string
          id?: string
          level?: string
          log_type?: string | null
          org_id?: string | null
          paused_component?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          tokens_used?: number | null
        }
        Update: {
          action?: string
          alert_email_sent_at?: string | null
          created_at?: string | null
          details?: Json | null
          duration_ms?: number | null
          error?: string | null
          function_name?: string
          id?: string
          level?: string
          log_type?: string | null
          org_id?: string | null
          paused_component?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_engine_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_engine_metrics: {
        Row: {
          ads_cpa: number | null
          ads_ctr: number | null
          aha_moments_reached: number | null
          aha_to_paid_rate: number | null
          breakpoint_details: Json | null
          breakpoints_triggered: number | null
          cac_blended: number | null
          cac_organic: number | null
          cac_paid: number | null
          call_answer_rate: number | null
          call_positive_rate: number | null
          clients_active: number | null
          clients_churned: number | null
          clients_india: number | null
          clients_international: number | null
          clients_new: number | null
          cost_ads: number | null
          cost_infrastructure: number | null
          cost_total: number | null
          cost_variable: number | null
          created_at: string | null
          cross_sell_rate: number | null
          email_bounce_rate: number | null
          email_click_rate: number | null
          email_open_rate: number | null
          gross_margin_pct: number | null
          id: string
          ltv_blended: number | null
          ltv_cac_ratio: number | null
          ltv_india_cross: number | null
          ltv_india_single: number | null
          ltv_intl_cross: number | null
          ltv_intl_single: number | null
          mrr_churned: number | null
          mrr_expansion: number | null
          mrr_net_movement: number | null
          mrr_new: number | null
          mrr_recovery: number | null
          mrr_referral: number | null
          mrr_total: number | null
          nps_satisfied_rate: number | null
          on_track: boolean | null
          org_id: string | null
          payback_organic_months: number | null
          payback_paid_months: number | null
          payments_received: number | null
          period_end: string
          period_start: string
          period_type: string
          recorded_at: string | null
          renewal_rate: number | null
          target_mrr: number | null
          target_variance_pct: number | null
          trial_to_paid_rate: number | null
          trials_started: number | null
          wa_optout_rate: number | null
          wa_read_rate: number | null
        }
        Insert: {
          ads_cpa?: number | null
          ads_ctr?: number | null
          aha_moments_reached?: number | null
          aha_to_paid_rate?: number | null
          breakpoint_details?: Json | null
          breakpoints_triggered?: number | null
          cac_blended?: number | null
          cac_organic?: number | null
          cac_paid?: number | null
          call_answer_rate?: number | null
          call_positive_rate?: number | null
          clients_active?: number | null
          clients_churned?: number | null
          clients_india?: number | null
          clients_international?: number | null
          clients_new?: number | null
          cost_ads?: number | null
          cost_infrastructure?: number | null
          cost_total?: number | null
          cost_variable?: number | null
          created_at?: string | null
          cross_sell_rate?: number | null
          email_bounce_rate?: number | null
          email_click_rate?: number | null
          email_open_rate?: number | null
          gross_margin_pct?: number | null
          id?: string
          ltv_blended?: number | null
          ltv_cac_ratio?: number | null
          ltv_india_cross?: number | null
          ltv_india_single?: number | null
          ltv_intl_cross?: number | null
          ltv_intl_single?: number | null
          mrr_churned?: number | null
          mrr_expansion?: number | null
          mrr_net_movement?: number | null
          mrr_new?: number | null
          mrr_recovery?: number | null
          mrr_referral?: number | null
          mrr_total?: number | null
          nps_satisfied_rate?: number | null
          on_track?: boolean | null
          org_id?: string | null
          payback_organic_months?: number | null
          payback_paid_months?: number | null
          payments_received?: number | null
          period_end: string
          period_start: string
          period_type: string
          recorded_at?: string | null
          renewal_rate?: number | null
          target_mrr?: number | null
          target_variance_pct?: number | null
          trial_to_paid_rate?: number | null
          trials_started?: number | null
          wa_optout_rate?: number | null
          wa_read_rate?: number | null
        }
        Update: {
          ads_cpa?: number | null
          ads_ctr?: number | null
          aha_moments_reached?: number | null
          aha_to_paid_rate?: number | null
          breakpoint_details?: Json | null
          breakpoints_triggered?: number | null
          cac_blended?: number | null
          cac_organic?: number | null
          cac_paid?: number | null
          call_answer_rate?: number | null
          call_positive_rate?: number | null
          clients_active?: number | null
          clients_churned?: number | null
          clients_india?: number | null
          clients_international?: number | null
          clients_new?: number | null
          cost_ads?: number | null
          cost_infrastructure?: number | null
          cost_total?: number | null
          cost_variable?: number | null
          created_at?: string | null
          cross_sell_rate?: number | null
          email_bounce_rate?: number | null
          email_click_rate?: number | null
          email_open_rate?: number | null
          gross_margin_pct?: number | null
          id?: string
          ltv_blended?: number | null
          ltv_cac_ratio?: number | null
          ltv_india_cross?: number | null
          ltv_india_single?: number | null
          ltv_intl_cross?: number | null
          ltv_intl_single?: number | null
          mrr_churned?: number | null
          mrr_expansion?: number | null
          mrr_net_movement?: number | null
          mrr_new?: number | null
          mrr_recovery?: number | null
          mrr_referral?: number | null
          mrr_total?: number | null
          nps_satisfied_rate?: number | null
          on_track?: boolean | null
          org_id?: string | null
          payback_organic_months?: number | null
          payback_paid_months?: number | null
          payments_received?: number | null
          period_end?: string
          period_start?: string
          period_type?: string
          recorded_at?: string | null
          renewal_rate?: number | null
          target_mrr?: number | null
          target_variance_pct?: number | null
          trial_to_paid_rate?: number | null
          trials_started?: number | null
          wa_optout_rate?: number | null
          wa_read_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_engine_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_exit_surveys: {
        Row: {
          channel: string | null
          contact_id: string | null
          created_at: string | null
          exit_reason: string | null
          id: string
          lead_id: string | null
          nps_score: number | null
          org_id: string
          responded_at: string | null
          response_text: string | null
          sent_at: string | null
          signals_extracted: boolean | null
          updated_at: string | null
          would_return: boolean | null
        }
        Insert: {
          channel?: string | null
          contact_id?: string | null
          created_at?: string | null
          exit_reason?: string | null
          id?: string
          lead_id?: string | null
          nps_score?: number | null
          org_id: string
          responded_at?: string | null
          response_text?: string | null
          sent_at?: string | null
          signals_extracted?: boolean | null
          updated_at?: string | null
          would_return?: boolean | null
        }
        Update: {
          channel?: string | null
          contact_id?: string | null
          created_at?: string | null
          exit_reason?: string | null
          id?: string
          lead_id?: string | null
          nps_score?: number | null
          org_id?: string
          responded_at?: string | null
          response_text?: string | null
          sent_at?: string | null
          signals_extracted?: boolean | null
          updated_at?: string | null
          would_return?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_exit_surveys_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_exit_surveys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_feature_signals: {
        Row: {
          created_at: string | null
          decision_at: string | null
          designation_group: string | null
          first_seen_at: string | null
          frequency_count: number | null
          id: string
          is_monetisable: boolean | null
          last_seen_at: string | null
          lead_id: string | null
          org_id: string
          product_key: string
          signal_category: string | null
          signal_text: string
          source_channel: string | null
          surfaced_in_report: boolean | null
          updated_at: string | null
          vertical: string | null
          your_decision: string | null
        }
        Insert: {
          created_at?: string | null
          decision_at?: string | null
          designation_group?: string | null
          first_seen_at?: string | null
          frequency_count?: number | null
          id?: string
          is_monetisable?: boolean | null
          last_seen_at?: string | null
          lead_id?: string | null
          org_id: string
          product_key: string
          signal_category?: string | null
          signal_text: string
          source_channel?: string | null
          surfaced_in_report?: boolean | null
          updated_at?: string | null
          vertical?: string | null
          your_decision?: string | null
        }
        Update: {
          created_at?: string | null
          decision_at?: string | null
          designation_group?: string | null
          first_seen_at?: string | null
          frequency_count?: number | null
          id?: string
          is_monetisable?: boolean | null
          last_seen_at?: string | null
          lead_id?: string | null
          org_id?: string
          product_key?: string
          signal_category?: string | null
          signal_text?: string
          source_channel?: string | null
          surfaced_in_report?: boolean | null
          updated_at?: string | null
          vertical?: string | null
          your_decision?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_feature_signals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_follow_campaign: {
        Row: {
          bounce_reason: string | null
          bounced_at: string | null
          campaign_key: string | null
          campaign_name: string | null
          city: string | null
          click_count: number
          clicked_at: string | null
          company_name: string | null
          company_size_note: string | null
          complained_at: string | null
          created_at: string
          delivered_at: string | null
          designation: string | null
          email: string
          fb_click_count: number
          fb_clicked_at: string | null
          first_name: string | null
          full_name: string | null
          id: string
          opened_at: string | null
          org_id: string
          post_click_count: number
          post_clicked_at: string | null
          reminder_message_id: string | null
          reminder_sent_at: string | null
          resend_message_id: string | null
          segment: string
          send_error: string | null
          sent_at: string | null
          source: string
          source_row_id: string | null
          state: string | null
          status: string
          token: string
          unsubscribed_at: string | null
          updated_at: string
          verified_at: string | null
          verify_ok: boolean | null
          verify_reason: string | null
        }
        Insert: {
          bounce_reason?: string | null
          bounced_at?: string | null
          campaign_key?: string | null
          campaign_name?: string | null
          city?: string | null
          click_count?: number
          clicked_at?: string | null
          company_name?: string | null
          company_size_note?: string | null
          complained_at?: string | null
          created_at?: string
          delivered_at?: string | null
          designation?: string | null
          email: string
          fb_click_count?: number
          fb_clicked_at?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          opened_at?: string | null
          org_id: string
          post_click_count?: number
          post_clicked_at?: string | null
          reminder_message_id?: string | null
          reminder_sent_at?: string | null
          resend_message_id?: string | null
          segment: string
          send_error?: string | null
          sent_at?: string | null
          source?: string
          source_row_id?: string | null
          state?: string | null
          status?: string
          token?: string
          unsubscribed_at?: string | null
          updated_at?: string
          verified_at?: string | null
          verify_ok?: boolean | null
          verify_reason?: string | null
        }
        Update: {
          bounce_reason?: string | null
          bounced_at?: string | null
          campaign_key?: string | null
          campaign_name?: string | null
          city?: string | null
          click_count?: number
          clicked_at?: string | null
          company_name?: string | null
          company_size_note?: string | null
          complained_at?: string | null
          created_at?: string
          delivered_at?: string | null
          designation?: string | null
          email?: string
          fb_click_count?: number
          fb_clicked_at?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          opened_at?: string | null
          org_id?: string
          post_click_count?: number
          post_clicked_at?: string | null
          reminder_message_id?: string | null
          reminder_sent_at?: string | null
          resend_message_id?: string | null
          segment?: string
          send_error?: string | null
          sent_at?: string | null
          source?: string
          source_row_id?: string | null
          state?: string | null
          status?: string
          token?: string
          unsubscribed_at?: string | null
          updated_at?: string
          verified_at?: string | null
          verify_ok?: boolean | null
          verify_reason?: string | null
        }
        Relationships: []
      }
      mkt_follow_excluded_companies: {
        Row: {
          company_name: string
          contact_count: number | null
          created_at: string
          reason: string
        }
        Insert: {
          company_name: string
          contact_count?: number | null
          created_at?: string
          reason?: string
        }
        Update: {
          company_name?: string
          contact_count?: number | null
          created_at?: string
          reason?: string
        }
        Relationships: []
      }
      mkt_global_persona_intelligence: {
        Row: {
          avg_click_rate: number | null
          avg_open_rate: number | null
          avg_payment_rate: number | null
          avg_trial_rate: number | null
          best_cta_pattern: string | null
          best_send_day: string | null
          best_send_hour_ist: number | null
          best_subject_pattern: string | null
          best_urgency_frame: string | null
          designation_group: string
          id: string
          language: string | null
          responsive_to_compliance: boolean | null
          responsive_to_roi: boolean | null
          responsive_to_social: boolean | null
          sample_size: number | null
          source_products: string[] | null
          updated_at: string | null
          vertical: string
        }
        Insert: {
          avg_click_rate?: number | null
          avg_open_rate?: number | null
          avg_payment_rate?: number | null
          avg_trial_rate?: number | null
          best_cta_pattern?: string | null
          best_send_day?: string | null
          best_send_hour_ist?: number | null
          best_subject_pattern?: string | null
          best_urgency_frame?: string | null
          designation_group: string
          id?: string
          language?: string | null
          responsive_to_compliance?: boolean | null
          responsive_to_roi?: boolean | null
          responsive_to_social?: boolean | null
          sample_size?: number | null
          source_products?: string[] | null
          updated_at?: string | null
          vertical: string
        }
        Update: {
          avg_click_rate?: number | null
          avg_open_rate?: number | null
          avg_payment_rate?: number | null
          avg_trial_rate?: number | null
          best_cta_pattern?: string | null
          best_send_day?: string | null
          best_send_hour_ist?: number | null
          best_subject_pattern?: string | null
          best_urgency_frame?: string | null
          designation_group?: string
          id?: string
          language?: string | null
          responsive_to_compliance?: boolean | null
          responsive_to_roi?: boolean | null
          responsive_to_social?: boolean | null
          sample_size?: number | null
          source_products?: string[] | null
          updated_at?: string | null
          vertical?: string
        }
        Relationships: []
      }
      mkt_google_ads_campaigns: {
        Row: {
          account_id: string
          avg_cpc: number | null
          budget_amount: number | null
          budget_currency: string | null
          campaign_type: string | null
          clicks: number | null
          conversion_value: number | null
          conversions: number | null
          cost: number | null
          created_at: string | null
          ctr: number | null
          google_campaign_id: string
          id: string
          impressions: number | null
          last_synced_at: string | null
          metrics_date: string | null
          name: string | null
          org_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          avg_cpc?: number | null
          budget_amount?: number | null
          budget_currency?: string | null
          campaign_type?: string | null
          clicks?: number | null
          conversion_value?: number | null
          conversions?: number | null
          cost?: number | null
          created_at?: string | null
          ctr?: number | null
          google_campaign_id: string
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          metrics_date?: string | null
          name?: string | null
          org_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          avg_cpc?: number | null
          budget_amount?: number | null
          budget_currency?: string | null
          campaign_type?: string | null
          clicks?: number | null
          conversion_value?: number | null
          conversions?: number | null
          cost?: number | null
          created_at?: string | null
          ctr?: number | null
          google_campaign_id?: string
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          metrics_date?: string | null
          name?: string | null
          org_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_google_ads_campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_google_ads_feedback: {
        Row: {
          conversion_at: string
          conversion_type: string
          conversion_value: number | null
          created_at: string | null
          ga_client_id: string | null
          gclid: string | null
          google_ads_push_error: string | null
          id: string
          lead_id: string | null
          org_id: string
          push_error: string | null
          pushed_at: string | null
          pushed_to_ga4: boolean | null
          pushed_to_google_ads: boolean
          pushed_to_google_ads_at: string | null
        }
        Insert: {
          conversion_at: string
          conversion_type: string
          conversion_value?: number | null
          created_at?: string | null
          ga_client_id?: string | null
          gclid?: string | null
          google_ads_push_error?: string | null
          id?: string
          lead_id?: string | null
          org_id: string
          push_error?: string | null
          pushed_at?: string | null
          pushed_to_ga4?: boolean | null
          pushed_to_google_ads?: boolean
          pushed_to_google_ads_at?: string | null
        }
        Update: {
          conversion_at?: string
          conversion_type?: string
          conversion_value?: number | null
          created_at?: string | null
          ga_client_id?: string | null
          gclid?: string | null
          google_ads_push_error?: string | null
          id?: string
          lead_id?: string | null
          org_id?: string
          push_error?: string | null
          pushed_at?: string | null
          pushed_to_ga4?: boolean | null
          pushed_to_google_ads?: boolean
          pushed_to_google_ads_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_google_ads_feedback_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_google_ads_keywords: {
        Row: {
          avg_position: number | null
          campaign_id: string | null
          clicks: number | null
          conversions: number | null
          cost: number | null
          created_at: string | null
          id: string
          impressions: number | null
          keyword: string
          last_synced_at: string | null
          match_type: string | null
          metrics_date: string | null
          org_id: string
          quality_score: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          avg_position?: number | null
          campaign_id?: string | null
          clicks?: number | null
          conversions?: number | null
          cost?: number | null
          created_at?: string | null
          id?: string
          impressions?: number | null
          keyword: string
          last_synced_at?: string | null
          match_type?: string | null
          metrics_date?: string | null
          org_id: string
          quality_score?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          avg_position?: number | null
          campaign_id?: string | null
          clicks?: number | null
          conversions?: number | null
          cost?: number | null
          created_at?: string | null
          id?: string
          impressions?: number | null
          keyword?: string
          last_synced_at?: string | null
          match_type?: string | null
          metrics_date?: string | null
          org_id?: string
          quality_score?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_google_ads_keywords_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_google_ads_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_google_ads_keywords_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_lead_score_history: {
        Row: {
          created_at: string | null
          engagement_delta: number | null
          fit_delta: number | null
          id: string
          intent_delta: number | null
          lead_id: string
          new_total: number | null
          org_id: string
          previous_total: number | null
          reason: string | null
          triggered_by: string | null
        }
        Insert: {
          created_at?: string | null
          engagement_delta?: number | null
          fit_delta?: number | null
          id?: string
          intent_delta?: number | null
          lead_id: string
          new_total?: number | null
          org_id: string
          previous_total?: number | null
          reason?: string | null
          triggered_by?: string | null
        }
        Update: {
          created_at?: string | null
          engagement_delta?: number | null
          fit_delta?: number | null
          id?: string
          intent_delta?: number | null
          lead_id?: string
          new_total?: number | null
          org_id?: string
          previous_total?: number | null
          reason?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_lead_score_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_lead_scores: {
        Row: {
          created_at: string | null
          engagement_score: number | null
          fit_score: number | null
          id: string
          intent_score: number | null
          lead_id: string
          org_id: string
          scored_at: string | null
          scoring_details: Json | null
          scoring_model: string | null
          total_score: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          engagement_score?: number | null
          fit_score?: number | null
          id?: string
          intent_score?: number | null
          lead_id: string
          org_id: string
          scored_at?: string | null
          scoring_details?: Json | null
          scoring_model?: string | null
          total_score?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          engagement_score?: number | null
          fit_score?: number | null
          id?: string
          intent_score?: number | null
          lead_id?: string
          org_id?: string
          scored_at?: string | null
          scoring_details?: Json | null
          scoring_model?: string | null
          total_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_lead_scores_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_leads: {
        Row: {
          at_risk: boolean | null
          campaign_id: string | null
          city: string | null
          company: string | null
          company_size: string | null
          contact_id: string | null
          converted_at: string | null
          country: string | null
          created_at: string | null
          disqualified_at: string | null
          disqualified_reason: string | null
          email: string | null
          engagement_score: number | null
          enrichment_data: Json | null
          enrolled_at: string | null
          first_name: string | null
          fit_score: number | null
          ga_client_id: string | null
          gclid: string | null
          id: string
          industry: string | null
          intent_score: number | null
          job_title: string | null
          last_name: string | null
          linkedin_url: string | null
          metadata: Json | null
          org_id: string
          phone: string | null
          referral_code: string | null
          referral_credit: number | null
          referral_credit_applied_at: string | null
          scored_at: string | null
          source: string
          state: string | null
          status: string
          total_score: number | null
          updated_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          website: string | null
        }
        Insert: {
          at_risk?: boolean | null
          campaign_id?: string | null
          city?: string | null
          company?: string | null
          company_size?: string | null
          contact_id?: string | null
          converted_at?: string | null
          country?: string | null
          created_at?: string | null
          disqualified_at?: string | null
          disqualified_reason?: string | null
          email?: string | null
          engagement_score?: number | null
          enrichment_data?: Json | null
          enrolled_at?: string | null
          first_name?: string | null
          fit_score?: number | null
          ga_client_id?: string | null
          gclid?: string | null
          id?: string
          industry?: string | null
          intent_score?: number | null
          job_title?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          metadata?: Json | null
          org_id: string
          phone?: string | null
          referral_code?: string | null
          referral_credit?: number | null
          referral_credit_applied_at?: string | null
          scored_at?: string | null
          source?: string
          state?: string | null
          status?: string
          total_score?: number | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          website?: string | null
        }
        Update: {
          at_risk?: boolean | null
          campaign_id?: string | null
          city?: string | null
          company?: string | null
          company_size?: string | null
          contact_id?: string | null
          converted_at?: string | null
          country?: string | null
          created_at?: string | null
          disqualified_at?: string | null
          disqualified_reason?: string | null
          email?: string | null
          engagement_score?: number | null
          enrichment_data?: Json | null
          enrolled_at?: string | null
          first_name?: string | null
          fit_score?: number | null
          ga_client_id?: string | null
          gclid?: string | null
          id?: string
          industry?: string | null
          intent_score?: number | null
          job_title?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          metadata?: Json | null
          org_id?: string
          phone?: string | null
          referral_code?: string | null
          referral_credit?: number | null
          referral_credit_applied_at?: string | null
          scored_at?: string | null
          source?: string
          state?: string | null
          status?: string
          total_score?: number | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_linkedin_config: {
        Row: {
          active: boolean
          created_at: string
          experiment_complete: boolean
          experiment_slots: Json
          id: string
          last_posted_date: string | null
          last_posted_product_key: string | null
          last_posted_slot_index: number
          linkedin_org_id: string
          member_access_token: string | null
          member_token_expires_at: string | null
          member_urn: string | null
          oauth_state: string | null
          org_access_token: string | null
          org_id: string
          org_refresh_expires_at: string | null
          org_refresh_token: string | null
          org_token_expires_at: string | null
          start_date: string
          updated_at: string
          winning_slot: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          experiment_complete?: boolean
          experiment_slots?: Json
          id?: string
          last_posted_date?: string | null
          last_posted_product_key?: string | null
          last_posted_slot_index?: number
          linkedin_org_id?: string
          member_access_token?: string | null
          member_token_expires_at?: string | null
          member_urn?: string | null
          oauth_state?: string | null
          org_access_token?: string | null
          org_id: string
          org_refresh_expires_at?: string | null
          org_refresh_token?: string | null
          org_token_expires_at?: string | null
          start_date?: string
          updated_at?: string
          winning_slot?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          experiment_complete?: boolean
          experiment_slots?: Json
          id?: string
          last_posted_date?: string | null
          last_posted_product_key?: string | null
          last_posted_slot_index?: number
          linkedin_org_id?: string
          member_access_token?: string | null
          member_token_expires_at?: string | null
          member_urn?: string | null
          oauth_state?: string | null
          org_access_token?: string | null
          org_id?: string
          org_refresh_expires_at?: string | null
          org_refresh_token?: string | null
          org_token_expires_at?: string | null
          start_date?: string
          updated_at?: string
          winning_slot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_linkedin_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_linkedin_follower_demographics: {
        Row: {
          by_country: Json | null
          by_function: Json | null
          by_industry: Json | null
          by_seniority: Json | null
          created_at: string
          id: string
          org_id: string
          snapshot_date: string
          total_followers: number | null
        }
        Insert: {
          by_country?: Json | null
          by_function?: Json | null
          by_industry?: Json | null
          by_seniority?: Json | null
          created_at?: string
          id?: string
          org_id: string
          snapshot_date: string
          total_followers?: number | null
        }
        Update: {
          by_country?: Json | null
          by_function?: Json | null
          by_industry?: Json | null
          by_seniority?: Json | null
          created_at?: string
          id?: string
          org_id?: string
          snapshot_date?: string
          total_followers?: number | null
        }
        Relationships: []
      }
      mkt_milestones: {
        Row: {
          created_at: string | null
          id: string
          metric_key: string | null
          milestone_key: string
          milestone_name: string
          notified_in_report: boolean | null
          reached: boolean | null
          reached_at: string | null
          threshold_value: number | null
          trigger_condition: string
          trigger_sql: string
          unlocks: string[] | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          metric_key?: string | null
          milestone_key: string
          milestone_name: string
          notified_in_report?: boolean | null
          reached?: boolean | null
          reached_at?: string | null
          threshold_value?: number | null
          trigger_condition: string
          trigger_sql: string
          unlocks?: string[] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          metric_key?: string | null
          milestone_key?: string
          milestone_name?: string
          notified_in_report?: boolean | null
          reached?: boolean | null
          reached_at?: string | null
          threshold_value?: number | null
          trigger_condition?: string
          trigger_sql?: string
          unlocks?: string[] | null
        }
        Relationships: []
      }
      mkt_mrr: {
        Row: {
          churn_reason: string | null
          contact_id: string | null
          created_at: string | null
          ended_at: string | null
          id: string
          is_active: boolean | null
          lead_id: string | null
          mrr_paise: number
          org_id: string
          product_key: string | null
          started_at: string | null
        }
        Insert: {
          churn_reason?: string | null
          contact_id?: string | null
          created_at?: string | null
          ended_at?: string | null
          id?: string
          is_active?: boolean | null
          lead_id?: string | null
          mrr_paise?: number
          org_id: string
          product_key?: string | null
          started_at?: string | null
        }
        Update: {
          churn_reason?: string | null
          contact_id?: string | null
          created_at?: string | null
          ended_at?: string | null
          id?: string
          is_active?: boolean | null
          lead_id?: string | null
          mrr_paise?: number
          org_id?: string
          product_key?: string | null
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_mrr_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_mrr_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_native_contacts: {
        Row: {
          address: string | null
          city: string | null
          company_linkedin_url: string | null
          company_name: string | null
          country: string | null
          created_at: string | null
          department: string | null
          designation: string | null
          email_generic: string | null
          email_official: string | null
          email_personal: string | null
          emp_size: string | null
          erp_name: string | null
          erp_vendor: string | null
          extra: string | null
          extra_1: string | null
          extra_2: string | null
          full_name: string | null
          id: string
          industry_type: string | null
          job_level: string | null
          latest_disposition: string | null
          latest_subdisposition: string | null
          linkedin_url: string | null
          location: string | null
          phone: string | null
          phone2: string | null
          pincode: string | null
          raw_updated_at: string | null
          salutation: string | null
          source: string | null
          source_1: string | null
          state: string | null
          sub_industry: string | null
          tier: string | null
          turnover: string | null
          website: string | null
          zone: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_linkedin_url?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string | null
          department?: string | null
          designation?: string | null
          email_generic?: string | null
          email_official?: string | null
          email_personal?: string | null
          emp_size?: string | null
          erp_name?: string | null
          erp_vendor?: string | null
          extra?: string | null
          extra_1?: string | null
          extra_2?: string | null
          full_name?: string | null
          id?: string
          industry_type?: string | null
          job_level?: string | null
          latest_disposition?: string | null
          latest_subdisposition?: string | null
          linkedin_url?: string | null
          location?: string | null
          phone?: string | null
          phone2?: string | null
          pincode?: string | null
          raw_updated_at?: string | null
          salutation?: string | null
          source?: string | null
          source_1?: string | null
          state?: string | null
          sub_industry?: string | null
          tier?: string | null
          turnover?: string | null
          website?: string | null
          zone?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company_linkedin_url?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string | null
          department?: string | null
          designation?: string | null
          email_generic?: string | null
          email_official?: string | null
          email_personal?: string | null
          emp_size?: string | null
          erp_name?: string | null
          erp_vendor?: string | null
          extra?: string | null
          extra_1?: string | null
          extra_2?: string | null
          full_name?: string | null
          id?: string
          industry_type?: string | null
          job_level?: string | null
          latest_disposition?: string | null
          latest_subdisposition?: string | null
          linkedin_url?: string | null
          location?: string | null
          phone?: string | null
          phone2?: string | null
          pincode?: string | null
          raw_updated_at?: string | null
          salutation?: string | null
          source?: string | null
          source_1?: string | null
          state?: string | null
          sub_industry?: string | null
          tier?: string | null
          turnover?: string | null
          website?: string | null
          zone?: string | null
        }
        Relationships: []
      }
      mkt_nps_responses: {
        Row: {
          category: string | null
          contact_id: string | null
          created_at: string | null
          id: string
          is_at_risk: boolean | null
          lead_id: string | null
          org_id: string
          product_key: string
          responded_at: string | null
          response_text: string | null
          score: number
          signals_extracted: boolean | null
          survey_type: string | null
        }
        Insert: {
          category?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string
          is_at_risk?: boolean | null
          lead_id?: string | null
          org_id: string
          product_key: string
          responded_at?: string | null
          response_text?: string | null
          score: number
          signals_extracted?: boolean | null
          survey_type?: string | null
        }
        Update: {
          category?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string
          is_at_risk?: boolean | null
          lead_id?: string | null
          org_id?: string
          product_key?: string
          responded_at?: string | null
          response_text?: string | null
          score?: number
          signals_extracted?: boolean | null
          survey_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_nps_responses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_nps_responses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_onboarding_steps: {
        Row: {
          attempts: number | null
          completed_at: string | null
          created_at: string | null
          details: Json | null
          error: string | null
          id: string
          org_id: string
          product_key: string
          scheduled_for: string | null
          started_at: string | null
          status: string
          step_name: string
          step_order: number
          updated_at: string | null
        }
        Insert: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          details?: Json | null
          error?: string | null
          id?: string
          org_id: string
          product_key: string
          scheduled_for?: string | null
          started_at?: string | null
          status?: string
          step_name: string
          step_order: number
          updated_at?: string | null
        }
        Update: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          details?: Json | null
          error?: string | null
          id?: string
          org_id?: string
          product_key?: string
          scheduled_for?: string | null
          started_at?: string | null
          status?: string
          step_name?: string
          step_order?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      mkt_persona_outreach_metrics: {
        Row: {
          connections_accepted_target_titles: number | null
          created_at: string
          dms_sent_to_viewers: number | null
          id: string
          notes: string | null
          org_id: string
          profile_views: number | null
          replies_received: number | null
          updated_at: string
          week_start: string
        }
        Insert: {
          connections_accepted_target_titles?: number | null
          created_at?: string
          dms_sent_to_viewers?: number | null
          id?: string
          notes?: string | null
          org_id: string
          profile_views?: number | null
          replies_received?: number | null
          updated_at?: string
          week_start: string
        }
        Update: {
          connections_accepted_target_titles?: number | null
          created_at?: string
          dms_sent_to_viewers?: number | null
          id?: string
          notes?: string | null
          org_id?: string
          profile_views?: number | null
          replies_received?: number | null
          updated_at?: string
          week_start?: string
        }
        Relationships: []
      }
      mkt_post_metrics_daily: {
        Row: {
          channel: string
          created_at: string
          id: string
          interactions: number | null
          org_id: string
          post_id: string
          reach: number | null
          stat_date: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          interactions?: number | null
          org_id: string
          post_id: string
          reach?: number | null
          stat_date: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          interactions?: number | null
          org_id?: string
          post_id?: string
          reach?: number | null
          stat_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_post_metrics_daily_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_product_decisions: {
        Row: {
          action_description: string | null
          actioned: boolean | null
          classified_by: string | null
          created_at: string | null
          decision_type: string | null
          engine_question: string
          feature_signal_ids: string[] | null
          id: string
          org_id: string
          product_key: string | null
          report_date: string | null
          updated_at: string | null
          your_response: string | null
        }
        Insert: {
          action_description?: string | null
          actioned?: boolean | null
          classified_by?: string | null
          created_at?: string | null
          decision_type?: string | null
          engine_question: string
          feature_signal_ids?: string[] | null
          id?: string
          org_id: string
          product_key?: string | null
          report_date?: string | null
          updated_at?: string | null
          your_response?: string | null
        }
        Update: {
          action_description?: string | null
          actioned?: boolean | null
          classified_by?: string | null
          created_at?: string | null
          decision_type?: string | null
          engine_question?: string
          feature_signal_ids?: string[] | null
          id?: string
          org_id?: string
          product_key?: string | null
          report_date?: string | null
          updated_at?: string | null
          your_response?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_product_decisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_product_icp: {
        Row: {
          aha_moment_days: number | null
          budget_range: Json
          company_sizes: string[]
          confidence_score: number
          created_at: string
          designations: string[]
          evolution_reason: string | null
          evolved_by: string
          geographies: string[]
          id: string
          industries: string[]
          languages: string[]
          last_evolved_at: string
          org_id: string
          pain_points: string[]
          product_key: string
          updated_at: string
          version: number
        }
        Insert: {
          aha_moment_days?: number | null
          budget_range?: Json
          company_sizes?: string[]
          confidence_score?: number
          created_at?: string
          designations?: string[]
          evolution_reason?: string | null
          evolved_by?: string
          geographies?: string[]
          id?: string
          industries?: string[]
          languages?: string[]
          last_evolved_at?: string
          org_id: string
          pain_points?: string[]
          product_key: string
          updated_at?: string
          version?: number
        }
        Update: {
          aha_moment_days?: number | null
          budget_range?: Json
          company_sizes?: string[]
          confidence_score?: number
          created_at?: string
          designations?: string[]
          evolution_reason?: string | null
          evolved_by?: string
          geographies?: string[]
          id?: string
          industries?: string[]
          languages?: string[]
          last_evolved_at?: string
          org_id?: string
          pain_points?: string[]
          product_key?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "mkt_product_icp_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_product_sync_log: {
        Row: {
          changes_detected: boolean | null
          data_after: Json | null
          data_before: Json | null
          id: string
          org_id: string
          product_key: string
          sync_type: string
          synced_at: string | null
        }
        Insert: {
          changes_detected?: boolean | null
          data_after?: Json | null
          data_before?: Json | null
          id?: string
          org_id: string
          product_key: string
          sync_type: string
          synced_at?: string | null
        }
        Update: {
          changes_detected?: boolean | null
          data_after?: Json | null
          data_before?: Json | null
          id?: string
          org_id?: string
          product_key?: string
          sync_type?: string
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_product_sync_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_products: {
        Row: {
          active: boolean | null
          aha_event: string | null
          created_at: string | null
          ga4_property_id: string | null
          git_repo_url: string | null
          icp_finalized: boolean
          icp_hints: Json
          id: string
          last_synced_at: string | null
          onboarded_at: string | null
          onboarding_log: string | null
          onboarding_status: string | null
          org_id: string
          pitch_deck_built_at: string | null
          pitch_deck_html: string | null
          price_growth_monthly_paise: number | null
          price_starter_monthly_paise: number | null
          product_key: string
          product_name: string
          product_notes: string | null
          product_url: string | null
          schema_map: Json | null
          supabase_secret_name: string | null
          supabase_url: string | null
          trial_days: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          aha_event?: string | null
          created_at?: string | null
          ga4_property_id?: string | null
          git_repo_url?: string | null
          icp_finalized?: boolean
          icp_hints?: Json
          id?: string
          last_synced_at?: string | null
          onboarded_at?: string | null
          onboarding_log?: string | null
          onboarding_status?: string | null
          org_id: string
          pitch_deck_built_at?: string | null
          pitch_deck_html?: string | null
          price_growth_monthly_paise?: number | null
          price_starter_monthly_paise?: number | null
          product_key: string
          product_name: string
          product_notes?: string | null
          product_url?: string | null
          schema_map?: Json | null
          supabase_secret_name?: string | null
          supabase_url?: string | null
          trial_days?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          aha_event?: string | null
          created_at?: string | null
          ga4_property_id?: string | null
          git_repo_url?: string | null
          icp_finalized?: boolean
          icp_hints?: Json
          id?: string
          last_synced_at?: string | null
          onboarded_at?: string | null
          onboarding_log?: string | null
          onboarding_status?: string | null
          org_id?: string
          pitch_deck_built_at?: string | null
          pitch_deck_html?: string | null
          price_growth_monthly_paise?: number | null
          price_starter_monthly_paise?: number | null
          product_key?: string
          product_name?: string
          product_notes?: string | null
          product_url?: string | null
          schema_map?: Json | null
          supabase_secret_name?: string | null
          supabase_url?: string | null
          trial_days?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_sequence_actions: {
        Row: {
          channel: string
          clicked_at: string | null
          complained_at: string | null
          created_at: string | null
          delivered_at: string | null
          enrollment_id: string
          external_id: string | null
          failed_at: string | null
          failure_reason: string | null
          id: string
          metadata: Json | null
          opened_at: string | null
          org_id: string
          replied_at: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          step_id: string | null
          step_number: number
          updated_at: string | null
          variant: string | null
        }
        Insert: {
          channel: string
          clicked_at?: string | null
          complained_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          enrollment_id: string
          external_id?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          org_id: string
          replied_at?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          step_id?: string | null
          step_number: number
          updated_at?: string | null
          variant?: string | null
        }
        Update: {
          channel?: string
          clicked_at?: string | null
          complained_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          enrollment_id?: string
          external_id?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          org_id?: string
          replied_at?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          step_id?: string | null
          step_number?: number
          updated_at?: string | null
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_sequence_actions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "mkt_sequence_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_sequence_actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_sequence_actions_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaign_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_sequence_enrollments: {
        Row: {
          campaign_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string | null
          current_step: number
          enrolled_at: string | null
          id: string
          lead_id: string
          next_action_at: string | null
          org_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          campaign_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number
          enrolled_at?: string | null
          id?: string
          lead_id: string
          next_action_at?: string | null
          org_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          campaign_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number
          enrolled_at?: string | null
          id?: string
          lead_id?: string
          next_action_at?: string | null
          org_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_sequence_enrollments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_sequence_enrollments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_sequence_enrollments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_social_config: {
        Row: {
          active: boolean
          created_at: string
          fb_ad_account_id: string | null
          fb_page_access_token: string | null
          fb_page_id: string | null
          fb_page_name: string | null
          id: string
          ig_user_id: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          fb_ad_account_id?: string | null
          fb_page_access_token?: string | null
          fb_page_id?: string | null
          fb_page_name?: string | null
          id?: string
          ig_user_id?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          fb_ad_account_id?: string | null
          fb_page_access_token?: string | null
          fb_page_id?: string | null
          fb_page_name?: string | null
          id?: string
          ig_user_id?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_social_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_tech_requests: {
        Row: {
          context: Json | null
          created_at: string
          description: string
          id: string
          implemented_at: string | null
          org_id: string | null
          priority: string
          requested_by: string
          status: string
          thread_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          description: string
          id?: string
          implemented_at?: string | null
          org_id?: string | null
          priority?: string
          requested_by?: string
          status?: string
          thread_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          description?: string
          id?: string
          implemented_at?: string | null
          org_id?: string | null
          priority?: string
          requested_by?: string
          status?: string
          thread_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      mkt_unsubscribes: {
        Row: {
          channel: string
          created_at: string | null
          email: string | null
          id: string
          lead_id: string | null
          org_id: string
          phone: string | null
          reason: string | null
          unsubscribed_at: string | null
          updated_at: string | null
        }
        Insert: {
          channel: string
          created_at?: string | null
          email?: string | null
          id?: string
          lead_id?: string | null
          org_id: string
          phone?: string | null
          reason?: string | null
          unsubscribed_at?: string | null
          updated_at?: string | null
        }
        Update: {
          channel?: string
          created_at?: string | null
          email?: string | null
          id?: string
          lead_id?: string | null
          org_id?: string
          phone?: string | null
          reason?: string | null
          unsubscribed_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_unsubscribes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_unsubscribes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_voice_calls: {
        Row: {
          ai_analysis: Json | null
          ai_summary: string | null
          analysis_error: string | null
          analysis_provider: string | null
          analyzed_at: string | null
          batch_id: string
          bolna_agent_id: string | null
          bolna_execution_id: string | null
          contact_id: string
          created_at: string
          duration_sec: number | null
          ended_at: string | null
          error_message: string | null
          from_phone_number: string | null
          hangup_reason: string | null
          id: string
          initiated_at: string | null
          metadata: Json | null
          org_id: string
          quality_score: number | null
          queue_position: number
          recording_url: string | null
          script_id: string
          sentiment: string | null
          status: string
          to_phone_number: string
          total_cost: number | null
          transcribed_at: string | null
          transcript: string | null
          transcript_provider: string | null
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          ai_analysis?: Json | null
          ai_summary?: string | null
          analysis_error?: string | null
          analysis_provider?: string | null
          analyzed_at?: string | null
          batch_id: string
          bolna_agent_id?: string | null
          bolna_execution_id?: string | null
          contact_id: string
          created_at?: string
          duration_sec?: number | null
          ended_at?: string | null
          error_message?: string | null
          from_phone_number?: string | null
          hangup_reason?: string | null
          id?: string
          initiated_at?: string | null
          metadata?: Json | null
          org_id: string
          quality_score?: number | null
          queue_position: number
          recording_url?: string | null
          script_id: string
          sentiment?: string | null
          status?: string
          to_phone_number: string
          total_cost?: number | null
          transcribed_at?: string | null
          transcript?: string | null
          transcript_provider?: string | null
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          ai_analysis?: Json | null
          ai_summary?: string | null
          analysis_error?: string | null
          analysis_provider?: string | null
          analyzed_at?: string | null
          batch_id?: string
          bolna_agent_id?: string | null
          bolna_execution_id?: string | null
          contact_id?: string
          created_at?: string
          duration_sec?: number | null
          ended_at?: string | null
          error_message?: string | null
          from_phone_number?: string | null
          hangup_reason?: string | null
          id?: string
          initiated_at?: string | null
          metadata?: Json | null
          org_id?: string
          quality_score?: number | null
          queue_position?: number
          recording_url?: string | null
          script_id?: string
          sentiment?: string | null
          status?: string
          to_phone_number?: string
          total_cost?: number | null
          transcribed_at?: string | null
          transcript?: string | null
          transcript_provider?: string | null
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_voice_calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_voice_calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_voice_calls_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "mkt_call_scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_whatsapp_templates: {
        Row: {
          approval_status: string | null
          body: string
          buttons: Json | null
          category: string | null
          created_at: string | null
          external_template_id: string | null
          footer: string | null
          header: string | null
          id: string
          is_active: boolean | null
          language: string | null
          name: string
          org_id: string
          submission_error: string | null
          submitted_at: string | null
          template_name: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          approval_status?: string | null
          body: string
          buttons?: Json | null
          category?: string | null
          created_at?: string | null
          external_template_id?: string | null
          footer?: string | null
          header?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          name: string
          org_id: string
          submission_error?: string | null
          submitted_at?: string | null
          template_name: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          approval_status?: string | null
          body?: string
          buttons?: Json | null
          category?: string | null
          created_at?: string | null
          external_template_id?: string | null
          footer?: string | null
          header?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          name?: string
          org_id?: string
          submission_error?: string | null
          submitted_at?: string | null
          template_name?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_whatsapp_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          expires_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          org_id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          org_id: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          org_id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      org_business_hours: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_enabled: boolean
          org_id: string
          start_time: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_enabled?: boolean
          org_id: string
          start_time: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_enabled?: boolean
          org_id?: string
          start_time?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_business_hours_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_feature_access: {
        Row: {
          created_at: string | null
          disabled_at: string | null
          enabled_at: string | null
          feature_key: string
          id: string
          is_enabled: boolean | null
          modified_by: string | null
          notes: string | null
          org_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          disabled_at?: string | null
          enabled_at?: string | null
          feature_key: string
          id?: string
          is_enabled?: boolean | null
          modified_by?: string | null
          notes?: string | null
          org_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          disabled_at?: string | null
          enabled_at?: string | null
          feature_key?: string
          id?: string
          is_enabled?: boolean | null
          modified_by?: string | null
          notes?: string | null
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_feature_access_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          created_at: string
          email: string | null
          expires_at: string
          id: string
          invite_code: string
          invited_by: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          expires_at: string
          id?: string
          invite_code: string
          invited_by: string
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invite_code?: string
          invited_by?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          apollo_config: Json | null
          created_at: string | null
          id: string
          logo_url: string | null
          max_automation_emails_per_day: number | null
          name: string
          primary_color: string | null
          services_enabled: boolean | null
          settings: Json | null
          slug: string
          subscription_active: boolean | null
          updated_at: string | null
          usage_limits: Json | null
        }
        Insert: {
          apollo_config?: Json | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          max_automation_emails_per_day?: number | null
          name: string
          primary_color?: string | null
          services_enabled?: boolean | null
          settings?: Json | null
          slug: string
          subscription_active?: boolean | null
          updated_at?: string | null
          usage_limits?: Json | null
        }
        Update: {
          apollo_config?: Json | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          max_automation_emails_per_day?: number | null
          name?: string
          primary_color?: string | null
          services_enabled?: boolean | null
          settings?: Json | null
          slug?: string
          subscription_active?: boolean | null
          updated_at?: string | null
          usage_limits?: Json | null
        }
        Relationships: []
      }
      pipeline_benchmarks: {
        Row: {
          avg_days_in_stage: number | null
          calculated_at: string
          conversion_rate: number | null
          created_at: string
          id: string
          org_id: string
          period_end: string
          period_start: string
          stage_id: string
          total_contacts_processed: number | null
        }
        Insert: {
          avg_days_in_stage?: number | null
          calculated_at?: string
          conversion_rate?: number | null
          created_at?: string
          id?: string
          org_id: string
          period_end: string
          period_start: string
          stage_id: string
          total_contacts_processed?: number | null
        }
        Update: {
          avg_days_in_stage?: number | null
          calculated_at?: string
          conversion_rate?: number | null
          created_at?: string
          id?: string
          org_id?: string
          period_end?: string
          period_start?: string
          stage_id?: string
          total_contacts_processed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_benchmarks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_benchmarks_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_movement_history: {
        Row: {
          contact_id: string
          created_at: string
          days_in_previous_stage: number | null
          from_stage_id: string | null
          id: string
          moved_at: string
          moved_by: string | null
          org_id: string
          to_stage_id: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          days_in_previous_stage?: number | null
          from_stage_id?: string | null
          id?: string
          moved_at?: string
          moved_by?: string | null
          org_id: string
          to_stage_id?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          days_in_previous_stage?: number | null
          from_stage_id?: string | null
          id?: string
          moved_at?: string
          moved_by?: string | null
          org_id?: string
          to_stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_movement_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_movement_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_movement_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_movement_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          org_id: string
          probability: number | null
          stage_order: number
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          org_id: string
          probability?: number | null
          stage_order: number
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          org_id?: string
          probability?: number | null
          stage_order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          target_org_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_org_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_org_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_admin_audit_log_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_email_sending_list: {
        Row: {
          bounce_count: number
          created_at: string
          email: string
          first_seen_at: string
          id: string
          is_unsubscribed: boolean
          last_bounce_at: string | null
          last_synced_at: string
          name: string | null
          source_type: string
          updated_at: string
        }
        Insert: {
          bounce_count?: number
          created_at?: string
          email: string
          first_seen_at?: string
          id?: string
          is_unsubscribed?: boolean
          last_bounce_at?: string | null
          last_synced_at?: string
          name?: string | null
          source_type: string
          updated_at?: string
        }
        Update: {
          bounce_count?: number
          created_at?: string
          email?: string
          first_seen_at?: string
          id?: string
          is_unsubscribed?: boolean
          last_bounce_at?: string | null
          last_synced_at?: string
          name?: string | null
          source_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          calling_enabled: boolean | null
          created_at: string | null
          designation_id: string | null
          email: string | null
          email_enabled: boolean | null
          first_name: string | null
          id: string
          is_active: boolean
          is_platform_admin: boolean | null
          last_name: string | null
          onboarding_completed: boolean | null
          org_id: string | null
          phone: string | null
          sms_enabled: boolean | null
          updated_at: string | null
          whatsapp_enabled: boolean | null
        }
        Insert: {
          avatar_url?: string | null
          calling_enabled?: boolean | null
          created_at?: string | null
          designation_id?: string | null
          email?: string | null
          email_enabled?: boolean | null
          first_name?: string | null
          id: string
          is_active?: boolean
          is_platform_admin?: boolean | null
          last_name?: string | null
          onboarding_completed?: boolean | null
          org_id?: string | null
          phone?: string | null
          sms_enabled?: boolean | null
          updated_at?: string | null
          whatsapp_enabled?: boolean | null
        }
        Update: {
          avatar_url?: string | null
          calling_enabled?: boolean | null
          created_at?: string | null
          designation_id?: string | null
          email?: string | null
          email_enabled?: boolean | null
          first_name?: string | null
          id?: string
          is_active?: boolean
          is_platform_admin?: boolean | null
          last_name?: string | null
          onboarding_completed?: boolean | null
          org_id?: string | null
          phone?: string | null
          sms_enabled?: boolean | null
          updated_at?: string | null
          whatsapp_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_designation_id_fkey"
            columns: ["designation_id"]
            isOneToOne: false
            referencedRelation: "designations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_log: {
        Row: {
          created_at: string
          id: string
          ip_address: unknown
          operation: string
          org_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: unknown
          operation: string
          org_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: unknown
          operation?: string
          org_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      recurring_activity_patterns: {
        Row: {
          activity_type: string
          assigned_to: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          days_of_week: number[]
          description: string | null
          duration_minutes: number | null
          end_date: string
          id: string
          is_task: boolean | null
          meeting_link: string | null
          org_id: string
          priority: string | null
          scheduled_time: string
          start_date: string
          subject: string | null
          updated_at: string | null
        }
        Insert: {
          activity_type: string
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          days_of_week: number[]
          description?: string | null
          duration_minutes?: number | null
          end_date: string
          id?: string
          is_task?: boolean | null
          meeting_link?: string | null
          org_id: string
          priority?: string | null
          scheduled_time: string
          start_date: string
          subject?: string | null
          updated_at?: string | null
        }
        Update: {
          activity_type?: string
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          days_of_week?: number[]
          description?: string | null
          duration_minutes?: number | null
          end_date?: string
          id?: string
          is_task?: boolean | null
          meeting_link?: string | null
          org_id?: string
          priority?: string | null
          scheduled_time?: string
          start_date?: string
          subject?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_activity_patterns_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_activity_patterns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      redefine_data_repository: {
        Row: {
          address: string | null
          city: string | null
          company_name: string | null
          created_at: string | null
          created_by: string | null
          department: string | null
          designation: string | null
          employee_size: string | null
          erp_name: string | null
          erp_vendor: string | null
          generic_email: string | null
          id: string
          industry_type: string | null
          job_level: string | null
          linkedin_url: string | null
          location: string | null
          mobile_2: string | null
          mobile_number: string | null
          name: string
          official_email: string | null
          org_id: string
          personal_email: string | null
          pincode: string | null
          state: string | null
          sub_industry: string | null
          tier: string | null
          turnover: string | null
          updated_at: string | null
          website: string | null
          zone: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          department?: string | null
          designation?: string | null
          employee_size?: string | null
          erp_name?: string | null
          erp_vendor?: string | null
          generic_email?: string | null
          id?: string
          industry_type?: string | null
          job_level?: string | null
          linkedin_url?: string | null
          location?: string | null
          mobile_2?: string | null
          mobile_number?: string | null
          name: string
          official_email?: string | null
          org_id: string
          personal_email?: string | null
          pincode?: string | null
          state?: string | null
          sub_industry?: string | null
          tier?: string | null
          turnover?: string | null
          updated_at?: string | null
          website?: string | null
          zone?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string | null
          created_by?: string | null
          department?: string | null
          designation?: string | null
          employee_size?: string | null
          erp_name?: string | null
          erp_vendor?: string | null
          generic_email?: string | null
          id?: string
          industry_type?: string | null
          job_level?: string | null
          linkedin_url?: string | null
          location?: string | null
          mobile_2?: string | null
          mobile_number?: string | null
          name?: string
          official_email?: string | null
          org_id?: string
          personal_email?: string | null
          pincode?: string | null
          state?: string | null
          sub_industry?: string | null
          tier?: string | null
          turnover?: string | null
          updated_at?: string | null
          website?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "redefine_data_repository_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      redefine_repository_audit: {
        Row: {
          action: string
          changed_at: string | null
          changed_by: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          repository_record_id: string | null
        }
        Insert: {
          action: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          repository_record_id?: string | null
        }
        Update: {
          action?: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          repository_record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "redefine_repository_audit_repository_record_id_fkey"
            columns: ["repository_record_id"]
            isOneToOne: false
            referencedRelation: "redefine_data_repository"
            referencedColumns: ["id"]
          },
        ]
      }
      reporting_hierarchy: {
        Row: {
          created_at: string | null
          designation_id: string
          id: string
          org_id: string
          reports_to_designation_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          designation_id: string
          id?: string
          org_id: string
          reports_to_designation_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          designation_id?: string
          id?: string
          org_id?: string
          reports_to_designation_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reporting_hierarchy_designation_id_fkey"
            columns: ["designation_id"]
            isOneToOne: true
            referencedRelation: "designations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reporting_hierarchy_reports_to_designation_id_fkey"
            columns: ["reports_to_designation_id"]
            isOneToOne: false
            referencedRelation: "designations"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_goals: {
        Row: {
          created_at: string | null
          created_by: string | null
          goal_amount: number
          id: string
          notes: string | null
          org_id: string
          period_end: string
          period_start: string
          period_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          goal_amount?: number
          id?: string
          notes?: string | null
          org_id: string
          period_end: string
          period_start: string
          period_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          goal_amount?: number
          id?: string
          notes?: string | null
          org_id?: string
          period_end?: string
          period_start?: string
          period_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_goals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sentinel_heartbeat: {
        Row: {
          detail: Json | null
          kind: string
          last_ok_at: string
          updated_at: string
        }
        Insert: {
          detail?: Json | null
          kind: string
          last_ok_at?: string
          updated_at?: string
        }
        Update: {
          detail?: Json | null
          kind?: string
          last_ok_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sentinel_incidents: {
        Row: {
          ack_token: string | null
          acknowledged_at: string | null
          acknowledged_via: string | null
          auto_fixed: boolean
          correctable: boolean
          created_at: string
          detail: string | null
          escalated_call_at: string | null
          escalated_email_at: string | null
          escalated_wa_at: string | null
          escalation_count: number
          first_failed_at: string
          fix_note: string | null
          id: string
          last_seen_at: string
          project: string
          resolved_at: string | null
          status: string
          system: string
          updated_at: string
        }
        Insert: {
          ack_token?: string | null
          acknowledged_at?: string | null
          acknowledged_via?: string | null
          auto_fixed?: boolean
          correctable?: boolean
          created_at?: string
          detail?: string | null
          escalated_call_at?: string | null
          escalated_email_at?: string | null
          escalated_wa_at?: string | null
          escalation_count?: number
          first_failed_at?: string
          fix_note?: string | null
          id?: string
          last_seen_at?: string
          project: string
          resolved_at?: string | null
          status?: string
          system: string
          updated_at?: string
        }
        Update: {
          ack_token?: string | null
          acknowledged_at?: string | null
          acknowledged_via?: string | null
          auto_fixed?: boolean
          correctable?: boolean
          created_at?: string
          detail?: string | null
          escalated_call_at?: string | null
          escalated_email_at?: string | null
          escalated_wa_at?: string | null
          escalation_count?: number
          first_failed_at?: string
          fix_note?: string | null
          id?: string
          last_seen_at?: string
          project?: string
          resolved_at?: string | null
          status?: string
          system?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_usage_logs: {
        Row: {
          cost: number
          created_at: string | null
          deduction_error: string | null
          id: string
          org_id: string
          quantity: number
          reference_id: string
          service_type: string
          user_id: string | null
          wallet_deducted: boolean | null
          wallet_transaction_id: string | null
        }
        Insert: {
          cost: number
          created_at?: string | null
          deduction_error?: string | null
          id?: string
          org_id: string
          quantity: number
          reference_id: string
          service_type: string
          user_id?: string | null
          wallet_deducted?: boolean | null
          wallet_transaction_id?: string | null
        }
        Update: {
          cost?: number
          created_at?: string | null
          deduction_error?: string | null
          id?: string
          org_id?: string
          quantity?: number
          reference_id?: string
          service_type?: string
          user_id?: string | null
          wallet_deducted?: boolean | null
          wallet_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_usage_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_bulk_campaigns: {
        Row: {
          campaign_name: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          failed_count: number | null
          id: string
          message_content: string
          org_id: string
          pending_count: number | null
          scheduled_at: string | null
          sent_count: number | null
          started_at: string | null
          status: string
          total_recipients: number | null
          updated_at: string
        }
        Insert: {
          campaign_name: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failed_count?: number | null
          id?: string
          message_content: string
          org_id: string
          pending_count?: number | null
          scheduled_at?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string
          total_recipients?: number | null
          updated_at?: string
        }
        Update: {
          campaign_name?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failed_count?: number | null
          id?: string
          message_content?: string
          org_id?: string
          pending_count?: number | null
          scheduled_at?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string
          total_recipients?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_bulk_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_bulk_campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_campaign_recipients: {
        Row: {
          campaign_id: string
          contact_id: string | null
          contact_name: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          org_id: string
          phone_number: string
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          org_id: string
          phone_number: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          org_id?: string
          phone_number?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sms_bulk_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_campaign_recipients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_messages: {
        Row: {
          contact_id: string | null
          created_at: string
          delivered_at: string | null
          direction: string
          error_message: string | null
          exotel_sms_id: string | null
          exotel_status_code: string | null
          id: string
          message_content: string
          org_id: string
          phone_number: string
          sent_at: string | null
          sent_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error_message?: string | null
          exotel_sms_id?: string | null
          exotel_status_code?: string | null
          id?: string
          message_content: string
          org_id: string
          phone_number: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error_message?: string | null
          exotel_sms_id?: string | null
          exotel_status_code?: string | null
          id?: string
          message_content?: string
          org_id?: string
          phone_number?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_comments: {
        Row: {
          comment: string
          created_at: string
          id: string
          is_internal: boolean
          org_id: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          is_internal?: boolean
          org_id: string
          ticket_id: string
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          org_id?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_escalations: {
        Row: {
          attachments: Json | null
          created_at: string
          escalated_by: string
          escalated_to: string
          id: string
          org_id: string
          remarks: string
          ticket_id: string
        }
        Insert: {
          attachments?: Json | null
          created_at?: string
          escalated_by: string
          escalated_to: string
          id?: string
          org_id: string
          remarks: string
          ticket_id: string
        }
        Update: {
          attachments?: Json | null
          created_at?: string
          escalated_by?: string
          escalated_to?: string
          id?: string
          org_id?: string
          remarks?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_escalations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_escalations_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_history: {
        Row: {
          action: string
          created_at: string | null
          id: string
          new_value: string | null
          old_value: string | null
          org_id: string
          ticket_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          org_id: string
          ticket_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          org_id?: string
          ticket_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_history_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_notifications: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          id: string
          message_preview: string | null
          org_id: string
          recipient: string
          sent_at: string
          status: string
          subject: string | null
          ticket_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_preview?: string | null
          org_id: string
          recipient: string
          sent_at?: string
          status?: string
          subject?: string | null
          ticket_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_preview?: string | null
          org_id?: string
          recipient?: string
          sent_at?: string
          status?: string
          subject?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          attachments: Json | null
          category: string
          client_notified: boolean
          client_notified_at: string | null
          company_name: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          id: string
          org_id: string
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          source: string
          status: string
          subject: string
          ticket_number: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          attachments?: Json | null
          category?: string
          client_notified?: boolean
          client_notified_at?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_at?: string | null
          id?: string
          org_id: string
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          source?: string
          status?: string
          subject: string
          ticket_number: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          attachments?: Json | null
          category?: string
          client_notified?: boolean
          client_notified_at?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          id?: string
          org_id?: string
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          source?: string
          status?: string
          subject?: string
          ticket_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_by: string
          assigned_to: string
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_date: string
          id: string
          morning_reminder_sent: boolean | null
          org_id: string
          pre_action_reminder_sent: boolean | null
          priority: string | null
          recurring_pattern_id: string | null
          remarks: string | null
          reminder_sent: boolean | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_by: string
          assigned_to: string
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date: string
          id?: string
          morning_reminder_sent?: boolean | null
          org_id: string
          pre_action_reminder_sent?: boolean | null
          priority?: string | null
          recurring_pattern_id?: string | null
          remarks?: string | null
          reminder_sent?: boolean | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_by?: string
          assigned_to?: string
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string
          id?: string
          morning_reminder_sent?: boolean | null
          org_id?: string
          pre_action_reminder_sent?: boolean | null
          priority?: string | null
          recurring_pattern_id?: string | null
          remarks?: string | null
          reminder_sent?: boolean | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_recurring_pattern_id_fkey"
            columns: ["recurring_pattern_id"]
            isOneToOne: false
            referencedRelation: "recurring_activity_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string | null
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          manager_id: string | null
          name: string
          org_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          manager_id?: string | null
          name: string
          org_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          manager_id?: string | null
          name?: string
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_module_usage: {
        Row: {
          created_at: string
          id: string
          last_visited_at: string
          module_icon: string
          module_key: string
          module_name: string
          module_path: string
          org_id: string
          user_id: string
          visit_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          last_visited_at?: string
          module_icon: string
          module_key: string
          module_name: string
          module_path: string
          org_id: string
          user_id: string
          visit_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          last_visited_at?: string
          module_icon?: string
          module_key?: string
          module_name?: string
          module_path?: string
          org_id?: string
          user_id?: string
          visit_count?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_probe_log: {
        Row: {
          connected: boolean | null
          execution_id: string | null
          id: string
          placed_at: string
          status: string | null
          verified: boolean
        }
        Insert: {
          connected?: boolean | null
          execution_id?: string | null
          id?: string
          placed_at?: string
          status?: string | null
          verified?: boolean
        }
        Update: {
          connected?: boolean | null
          execution_id?: string | null
          id?: string
          placed_at?: string
          status?: string | null
          verified?: boolean
        }
        Relationships: []
      }
      whatsapp_bulk_campaigns: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          exotel_settings_id: string | null
          failed_count: number
          id: string
          message_content: string
          name: string
          org_id: string
          pending_count: number
          scheduled_at: string | null
          sent_count: number
          started_at: string | null
          status: string
          template_id: string | null
          total_recipients: number
          updated_at: string
          variable_mappings: Json | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          exotel_settings_id?: string | null
          failed_count?: number
          id?: string
          message_content: string
          name: string
          org_id: string
          pending_count?: number
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          template_id?: string | null
          total_recipients?: number
          updated_at?: string
          variable_mappings?: Json | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          exotel_settings_id?: string | null
          failed_count?: number
          id?: string
          message_content?: string
          name?: string
          org_id?: string
          pending_count?: number
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          template_id?: string | null
          total_recipients?: number
          updated_at?: string
          variable_mappings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_bulk_campaigns_exotel_settings_id_fkey"
            columns: ["exotel_settings_id"]
            isOneToOne: false
            referencedRelation: "exotel_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_bulk_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "communication_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_campaign_recipients: {
        Row: {
          campaign_id: string
          contact_id: string | null
          created_at: string
          custom_data: Json | null
          error_message: string | null
          id: string
          last_retry_at: string | null
          max_retries: number
          message_id: string | null
          next_retry_at: string | null
          phone_number: string
          retry_count: number
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          contact_id?: string | null
          created_at?: string
          custom_data?: Json | null
          error_message?: string | null
          id?: string
          last_retry_at?: string | null
          max_retries?: number
          message_id?: string | null
          next_retry_at?: string | null
          phone_number: string
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          contact_id?: string | null
          created_at?: string
          custom_data?: Json | null
          error_message?: string | null
          id?: string
          last_retry_at?: string | null
          max_retries?: number
          message_id?: string | null
          next_retry_at?: string | null
          phone_number?: string
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_bulk_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaign_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          contact_id: string
          conversation_id: string | null
          created_at: string | null
          delivered_at: string | null
          direction: string
          error_message: string | null
          exotel_message_id: string | null
          exotel_status_code: string | null
          gupshup_message_id: string | null
          id: string
          media_type: string | null
          media_url: string | null
          message_content: string
          org_id: string
          phone_number: string
          read_at: string | null
          replied_to_message_id: string | null
          scheduled_at: string | null
          sender_name: string | null
          sent_at: string | null
          sent_by: string | null
          status: string | null
          template_id: string | null
          template_variables: Json | null
        }
        Insert: {
          contact_id: string
          conversation_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          direction?: string
          error_message?: string | null
          exotel_message_id?: string | null
          exotel_status_code?: string | null
          gupshup_message_id?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          message_content: string
          org_id: string
          phone_number: string
          read_at?: string | null
          replied_to_message_id?: string | null
          scheduled_at?: string | null
          sender_name?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          template_id?: string | null
          template_variables?: Json | null
        }
        Update: {
          contact_id?: string
          conversation_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          direction?: string
          error_message?: string | null
          exotel_message_id?: string | null
          exotel_status_code?: string | null
          gupshup_message_id?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          message_content?: string
          org_id?: string
          phone_number?: string
          read_at?: string | null
          replied_to_message_id?: string | null
          scheduled_at?: string | null
          sender_name?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          template_id?: string | null
          template_variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_replied_to_message_id_fkey"
            columns: ["replied_to_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "communication_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      mkt_follow_campaign_stats: {
        Row: {
          bounced: number | null
          campaign_key: string | null
          campaign_name: string | null
          complained: number | null
          delivered: number | null
          delivered_today: number | null
          facebook_clicks: number | null
          failed: number | null
          first_sent_at: string | null
          follow_clicks: number | null
          last_sent_at: string | null
          opened: number | null
          org_id: string | null
          post_reads: number | null
          queued: number | null
          reminders_sent: number | null
          segment: string | null
          sent: number | null
          sent_today: number | null
          total_people: number | null
          unsubscribed: number | null
        }
        Relationships: []
      }
      v_call_intelligence: {
        Row: {
          agent_ref: string | null
          ai_analysis: Json | null
          ai_summary: string | null
          analysis_error: string | null
          analysis_provider: string | null
          analyzed_at: string | null
          bolna_execution_id: string | null
          call_kind: string | null
          contact_id: string | null
          direction: string | null
          duration_sec: number | null
          from_number: string | null
          id: string | null
          occurred_at: string | null
          org_id: string | null
          provider_call_id: string | null
          quality_score: number | null
          recording_url: string | null
          sentiment: string | null
          status: string | null
          to_number: string | null
          transcribed_at: string | null
          transcript: string | null
          transcript_provider: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accounting_post_document_journal: {
        Args: { p_doc_id: string }
        Returns: undefined
      }
      accounting_post_payment_journal: {
        Args: { p_payment_id: string }
        Returns: undefined
      }
      aggregate_automation_performance_daily: {
        Args: { _date: string }
        Returns: undefined
      }
      can_create_import_job: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      check_and_increment_daily_limit: {
        Args: { _contact_id: string; _max_per_day: number; _org_id: string }
        Returns: boolean
      }
      check_circular_dependency: {
        Args: { _depends_on_rule_id: string; _rule_id: string }
        Returns: boolean
      }
      cleanup_orphaned_profile: {
        Args: { user_id: string }
        Returns: undefined
      }
      create_default_call_dispositions: {
        Args: { _org_id: string }
        Returns: undefined
      }
      create_default_pipeline_stages: {
        Args: { _org_id: string }
        Returns: undefined
      }
      create_organization_for_user: {
        Args: { p_org_name: string; p_org_slug: string; p_user_id: string }
        Returns: string
      }
      generate_unique_slug: { Args: { base_slug: string }; Returns: string }
      get_all_current_icps: {
        Args: { _org_id: string }
        Returns: {
          aha_moment_days: number | null
          budget_range: Json
          company_sizes: string[]
          confidence_score: number
          created_at: string
          designations: string[]
          evolution_reason: string | null
          evolved_by: string
          geographies: string[]
          id: string
          industries: string[]
          languages: string[]
          last_evolved_at: string
          org_id: string
          pain_points: string[]
          product_key: string
          updated_at: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "mkt_product_icp"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_campaign_stats: {
        Args: { p_org_id: string; p_product_key: string }
        Returns: {
          active_enrollments: number
          completed_enrollments: number
          converted: number
          email_sent: number
          failed: number
          opened: number
          replied: number
          sent: number
          trials: number
          wa_sent: number
        }[]
      }
      get_current_icp: {
        Args: { _org_id: string; _product_key: string }
        Returns: {
          aha_moment_days: number | null
          budget_range: Json
          company_sizes: string[]
          confidence_score: number
          created_at: string
          designations: string[]
          evolution_reason: string | null
          evolved_by: string
          geographies: string[]
          id: string
          industries: string[]
          languages: string[]
          last_evolved_at: string
          org_id: string
          pain_points: string[]
          product_key: string
          updated_at: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "mkt_product_icp"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_icp_history: {
        Args: { _org_id: string; _product_key: string }
        Returns: {
          aha_moment_days: number | null
          budget_range: Json
          company_sizes: string[]
          confidence_score: number
          created_at: string
          designations: string[]
          evolution_reason: string | null
          evolved_by: string
          geographies: string[]
          id: string
          industries: string[]
          languages: string[]
          last_evolved_at: string
          org_id: string
          pain_points: string[]
          product_key: string
          updated_at: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "mkt_product_icp"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_monthly_actuals_optimized: {
        Args: { _org_id: string; _year: number }
        Returns: {
          deal_contact_ids: string[]
          deals: number
          invoiced: number
          invoiced_invoice_ids: string[]
          month: number
          proposal_contact_ids: string[]
          proposals: number
          qualified: number
          qualified_contact_ids: string[]
          received: number
          received_invoice_ids: string[]
        }[]
      }
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_automation_cooldown: {
        Args: { _contact_id: string; _org_id: string; _rule_id: string }
        Returns: undefined
      }
      increment_automation_rule_stats: {
        Args: { _rule_id: string; _stat_type: string }
        Returns: undefined
      }
      increment_email_campaign_stats: {
        Args: {
          p_campaign_id: string
          p_failed_increment?: number
          p_pending_increment?: number
          p_sent_increment?: number
        }
        Returns: undefined
      }
      increment_sms_campaign_stats: {
        Args: {
          p_campaign_id: string
          p_failed_increment?: number
          p_pending_increment?: number
          p_sent_increment?: number
        }
        Returns: undefined
      }
      is_admin_of_conversation: {
        Args: { check_user_id: string; conv_id: string }
        Returns: boolean
      }
      is_email_suppressed: {
        Args: { _email: string; _org_id: string }
        Returns: boolean
      }
      is_email_unsubscribed: {
        Args: { _email: string; _org_id: string }
        Returns: boolean
      }
      is_participant_in_conversation: {
        Args: { check_user_id: string; conv_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      is_within_business_hours: {
        Args: { _check_time: string; _org_id: string }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sync_platform_email_list: { Args: never; Returns: undefined }
      toggle_product_active: {
        Args: { _active: boolean; _product_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "sales_manager"
        | "sales_agent"
        | "support_manager"
        | "support_agent"
        | "analyst"
      import_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "partial"
        | "cancelled"
        | "reverted"
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
      app_role: [
        "super_admin",
        "admin",
        "sales_manager",
        "sales_agent",
        "support_manager",
        "support_agent",
        "analyst",
      ],
      import_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "partial",
        "cancelled",
        "reverted",
      ],
    },
  },
} as const
