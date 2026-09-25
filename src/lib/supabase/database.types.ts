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
      catalog_nodes: {
        Row: {
          article_number: string | null
          catalog_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["node_kind"]
          long_text: Json
          number: string | null
          parent_id: string | null
          price_date: string | null
          search_text: string | null
          short_text: Json
          sort: number
          unit: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          article_number?: string | null
          catalog_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["node_kind"]
          long_text?: Json
          number?: string | null
          parent_id?: string | null
          price_date?: string | null
          search_text?: string | null
          short_text?: Json
          sort?: number
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          article_number?: string | null
          catalog_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["node_kind"]
          long_text?: Json
          number?: string | null
          parent_id?: string | null
          price_date?: string | null
          search_text?: string | null
          short_text?: Json
          sort?: number
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_nodes_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_nodes_parent_id_catalog_id_fkey"
            columns: ["parent_id", "catalog_id"]
            isOneToOne: false
            referencedRelation: "catalog_nodes"
            referencedColumns: ["id", "catalog_id"]
          },
        ]
      }
      catalogs: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          entry_count: number
          external_key: string | null
          id: string
          imported_at: string | null
          name: string
          source: string
          supplier: string | null
          trade: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          version: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_count?: number
          external_key?: string | null
          id?: string
          imported_at?: string | null
          name: string
          source?: string
          supplier?: string | null
          trade?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          version?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_count?: number
          external_key?: string | null
          id?: string
          imported_at?: string | null
          name?: string
          source?: string
          supplier?: string | null
          trade?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          archived: boolean
          categories: string[]
          city: string | null
          country: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          language: Database["public"]["Enums"]["app_language"]
          name: string
          name2: string | null
          notes: string | null
          phone: string | null
          po_box: string | null
          street: string | null
          trades: string[]
          uid_number: string | null
          updated_at: string
          website: string | null
          zip: string | null
        }
        Insert: {
          archived?: boolean
          categories?: string[]
          city?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          language?: Database["public"]["Enums"]["app_language"]
          name: string
          name2?: string | null
          notes?: string | null
          phone?: string | null
          po_box?: string | null
          street?: string | null
          trades?: string[]
          uid_number?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Update: {
          archived?: boolean
          categories?: string[]
          city?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          language?: Database["public"]["Enums"]["app_language"]
          name?: string
          name2?: string | null
          notes?: string | null
          phone?: string | null
          po_box?: string | null
          street?: string | null
          trades?: string[]
          uid_number?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          email: string | null
          first_name: string | null
          function: string | null
          id: string
          language: Database["public"]["Enums"]["app_language"] | null
          last_name: string
          mobile: string | null
          notes: string | null
          phone: string | null
          salutation: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string | null
          function?: string | null
          id?: string
          language?: Database["public"]["Enums"]["app_language"] | null
          last_name: string
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          salutation?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string | null
          function?: string | null
          id?: string
          language?: Database["public"]["Enums"]["app_language"] | null
          last_name?: string
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          salutation?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_plan_items: {
        Row: {
          code: string
          id: string
          name: Json
          parent_id: string | null
          sort: number
          template_id: string
        }
        Insert: {
          code: string
          id?: string
          name?: Json
          parent_id?: string | null
          sort?: number
          template_id: string
        }
        Update: {
          code?: string
          id?: string
          name?: Json
          parent_id?: string | null
          sort?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_plan_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cost_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_plan_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cost_plan_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_plan_templates: {
        Row: {
          created_at: string
          id: string
          key: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          key?: string | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string | null
          name?: string
        }
        Relationships: []
      }
      firm_settings: {
        Row: {
          bank_name: string | null
          bic: string | null
          city: string | null
          country: string
          email: string | null
          iban: string | null
          id: boolean
          logo_path: string | null
          managing_director: string | null
          name: string
          offer_validity_days: number
          payment_terms_days: number
          phone: string | null
          street: string | null
          uid_number: string | null
          updated_at: string
          updated_by: string | null
          vat_rate: number
          website: string | null
          zip: string | null
        }
        Insert: {
          bank_name?: string | null
          bic?: string | null
          city?: string | null
          country?: string
          email?: string | null
          iban?: string | null
          id?: boolean
          logo_path?: string | null
          managing_director?: string | null
          name: string
          offer_validity_days?: number
          payment_terms_days?: number
          phone?: string | null
          street?: string | null
          uid_number?: string | null
          updated_at?: string
          updated_by?: string | null
          vat_rate?: number
          website?: string | null
          zip?: string | null
        }
        Update: {
          bank_name?: string | null
          bic?: string | null
          city?: string | null
          country?: string
          email?: string | null
          iban?: string | null
          id?: boolean
          logo_path?: string | null
          managing_director?: string | null
          name?: string
          offer_validity_days?: number
          payment_terms_days?: number
          phone?: string | null
          street?: string | null
          uid_number?: string | null
          updated_at?: string
          updated_by?: string | null
          vat_rate?: number
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lv_bidders: {
        Row: {
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          discount_pct: number
          id: string
          invited_at: string | null
          lv_id: string
          notes: string | null
          offer_received_at: string | null
          offer_reference: string | null
          other_deductions: number
          skonto_pct: number
          status: Database["public"]["Enums"]["bidder_status"]
          updated_at: string
          vat_pct: number
        }
        Insert: {
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_pct?: number
          id?: string
          invited_at?: string | null
          lv_id: string
          notes?: string | null
          offer_received_at?: string | null
          offer_reference?: string | null
          other_deductions?: number
          skonto_pct?: number
          status?: Database["public"]["Enums"]["bidder_status"]
          updated_at?: string
          vat_pct?: number
        }
        Update: {
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_pct?: number
          id?: string
          invited_at?: string | null
          lv_id?: string
          notes?: string | null
          offer_received_at?: string | null
          offer_reference?: string | null
          other_deductions?: number
          skonto_pct?: number
          status?: Database["public"]["Enums"]["bidder_status"]
          updated_at?: string
          vat_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "lv_bidders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lv_bidders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lv_bidders_contact_id_company_id_fkey"
            columns: ["contact_id", "company_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "lv_bidders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lv_bidders_lv_id_fkey"
            columns: ["lv_id"]
            isOneToOne: false
            referencedRelation: "lv_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lv_bidders_lv_id_fkey"
            columns: ["lv_id"]
            isOneToOne: false
            referencedRelation: "lvs"
            referencedColumns: ["id"]
          },
        ]
      }
      lv_measurements: {
        Row: {
          count: number
          created_at: string
          description: string | null
          factor_a: number | null
          factor_b: number | null
          factor_c: number | null
          id: string
          lv_node_id: string
          result: number | null
          sort: number
        }
        Insert: {
          count?: number
          created_at?: string
          description?: string | null
          factor_a?: number | null
          factor_b?: number | null
          factor_c?: number | null
          id?: string
          lv_node_id: string
          result?: number | null
          sort?: number
        }
        Update: {
          count?: number
          created_at?: string
          description?: string | null
          factor_a?: number | null
          factor_b?: number | null
          factor_c?: number | null
          id?: string
          lv_node_id?: string
          result?: number | null
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "lv_measurements_lv_node_id_fkey"
            columns: ["lv_node_id"]
            isOneToOne: false
            referencedRelation: "lv_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      lv_nodes: {
        Row: {
          cost_plan_item_id: string | null
          created_at: string
          custom_number: string | null
          discounts: Json
          gross_unit_price: number | null
          id: string
          is_lump_sum: boolean
          is_optional: boolean
          kind: Database["public"]["Enums"]["node_kind"]
          long_text: Json
          lv_id: string
          number: string | null
          parent_id: string | null
          quantity: number | null
          short_text: Json
          sort: number
          source_catalog_node_id: string | null
          unit: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          cost_plan_item_id?: string | null
          created_at?: string
          custom_number?: string | null
          discounts?: Json
          gross_unit_price?: number | null
          id?: string
          is_lump_sum?: boolean
          is_optional?: boolean
          kind: Database["public"]["Enums"]["node_kind"]
          long_text?: Json
          lv_id: string
          number?: string | null
          parent_id?: string | null
          quantity?: number | null
          short_text?: Json
          sort?: number
          source_catalog_node_id?: string | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          cost_plan_item_id?: string | null
          created_at?: string
          custom_number?: string | null
          discounts?: Json
          gross_unit_price?: number | null
          id?: string
          is_lump_sum?: boolean
          is_optional?: boolean
          kind?: Database["public"]["Enums"]["node_kind"]
          long_text?: Json
          lv_id?: string
          number?: string | null
          parent_id?: string | null
          quantity?: number | null
          short_text?: Json
          sort?: number
          source_catalog_node_id?: string | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lv_nodes_cost_plan_item_id_fkey"
            columns: ["cost_plan_item_id"]
            isOneToOne: false
            referencedRelation: "cost_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lv_nodes_lv_id_fkey"
            columns: ["lv_id"]
            isOneToOne: false
            referencedRelation: "lv_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lv_nodes_lv_id_fkey"
            columns: ["lv_id"]
            isOneToOne: false
            referencedRelation: "lvs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lv_nodes_parent_id_lv_id_fkey"
            columns: ["parent_id", "lv_id"]
            isOneToOne: false
            referencedRelation: "lv_nodes"
            referencedColumns: ["id", "lv_id"]
          },
          {
            foreignKeyName: "lv_nodes_source_catalog_node_id_fkey"
            columns: ["source_catalog_node_id"]
            isOneToOne: false
            referencedRelation: "catalog_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      lvs: {
        Row: {
          award_date: string | null
          award_justification: string | null
          awarded_bidder_id: string | null
          cost_plan_item_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          language: Database["public"]["Enums"]["app_language"]
          number: string
          project_id: string
          status: Database["public"]["Enums"]["lv_status"]
          submission_deadline: string | null
          title: string
          trade: string | null
          updated_at: string
        }
        Insert: {
          award_date?: string | null
          award_justification?: string | null
          awarded_bidder_id?: string | null
          cost_plan_item_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          language?: Database["public"]["Enums"]["app_language"]
          number: string
          project_id: string
          status?: Database["public"]["Enums"]["lv_status"]
          submission_deadline?: string | null
          title: string
          trade?: string | null
          updated_at?: string
        }
        Update: {
          award_date?: string | null
          award_justification?: string | null
          awarded_bidder_id?: string | null
          cost_plan_item_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          language?: Database["public"]["Enums"]["app_language"]
          number?: string
          project_id?: string
          status?: Database["public"]["Enums"]["lv_status"]
          submission_deadline?: string | null
          title?: string
          trade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lvs_awarded_bidder_fkey"
            columns: ["awarded_bidder_id", "id"]
            isOneToOne: false
            referencedRelation: "lv_bidders"
            referencedColumns: ["id", "lv_id"]
          },
          {
            foreignKeyName: "lvs_awarded_bidder_fkey"
            columns: ["awarded_bidder_id", "id"]
            isOneToOne: false
            referencedRelation: "offer_totals"
            referencedColumns: ["lv_bidder_id", "lv_id"]
          },
          {
            foreignKeyName: "lvs_cost_plan_item_id_fkey"
            columns: ["cost_plan_item_id"]
            isOneToOne: false
            referencedRelation: "cost_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lvs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lvs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lvs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_prices: {
        Row: {
          lv_bidder_id: string
          lv_id: string
          lv_node_id: string
          note: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          lv_bidder_id: string
          lv_id: string
          lv_node_id: string
          note?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          lv_bidder_id?: string
          lv_id?: string
          lv_node_id?: string
          note?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_prices_lv_bidder_id_lv_id_fkey"
            columns: ["lv_bidder_id", "lv_id"]
            isOneToOne: false
            referencedRelation: "lv_bidders"
            referencedColumns: ["id", "lv_id"]
          },
          {
            foreignKeyName: "offer_prices_lv_bidder_id_lv_id_fkey"
            columns: ["lv_bidder_id", "lv_id"]
            isOneToOne: false
            referencedRelation: "offer_totals"
            referencedColumns: ["lv_bidder_id", "lv_id"]
          },
          {
            foreignKeyName: "offer_prices_lv_node_id_lv_id_fkey"
            columns: ["lv_node_id", "lv_id"]
            isOneToOne: false
            referencedRelation: "lv_nodes"
            referencedColumns: ["id", "lv_id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          language: Database["public"]["Enums"]["app_language"]
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          language?: Database["public"]["Enums"]["app_language"]
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          language?: Database["public"]["Enums"]["app_language"]
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      project_cost_items: {
        Row: {
          budget: number | null
          cost_plan_item_id: string
          id: string
          manual_amount: number | null
          note: string | null
          project_id: string
          updated_at: string
        }
        Insert: {
          budget?: number | null
          cost_plan_item_id: string
          id?: string
          manual_amount?: number | null
          note?: string | null
          project_id: string
          updated_at?: string
        }
        Update: {
          budget?: number | null
          cost_plan_item_id?: string
          id?: string
          manual_amount?: number | null
          note?: string | null
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_cost_items_cost_plan_item_id_fkey"
            columns: ["cost_plan_item_id"]
            isOneToOne: false
            referencedRelation: "cost_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cost_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cost_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_participants: {
        Row: {
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          project_id: string
          role: string
        }
        Insert: {
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          project_id: string
          role: string
        }
        Update: {
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          project_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_participants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_participants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_participants_contact_id_company_id_fkey"
            columns: ["contact_id", "company_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "project_participants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_participants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_participants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          city: string | null
          cost_plan_template_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          language: Database["public"]["Enums"]["app_language"]
          name: string
          number: string
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          street: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          city?: string | null
          cost_plan_template_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          language?: Database["public"]["Enums"]["app_language"]
          name: string
          number: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          street?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          city?: string | null
          cost_plan_template_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          language?: Database["public"]["Enums"]["app_language"]
          name?: string
          number?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          street?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_cost_plan_template_id_fkey"
            columns: ["cost_plan_template_id"]
            isOneToOne: false
            referencedRelation: "cost_plan_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ventilation_calcs: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          name: string
          project_id: string
          sort: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          name: string
          project_id: string
          sort?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          name?: string
          project_id?: string
          sort?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventilation_calcs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventilation_calcs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventilation_calcs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ventilation_plans: {
        Row: {
          created_at: string
          data: Json
          project_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          data?: Json
          project_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          project_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventilation_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "project_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventilation_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventilation_plans_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      company_list: {
        Row: {
          archived: boolean | null
          categories: string[] | null
          city: string | null
          contact_count: number | null
          country: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string | null
          language: Database["public"]["Enums"]["app_language"] | null
          name: string | null
          name2: string | null
          notes: string | null
          phone: string | null
          po_box: string | null
          search_text: string | null
          street: string | null
          trades: string[] | null
          uid_number: string | null
          updated_at: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          archived?: boolean | null
          categories?: string[] | null
          city?: string | null
          contact_count?: never
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string | null
          language?: Database["public"]["Enums"]["app_language"] | null
          name?: string | null
          name2?: string | null
          notes?: string | null
          phone?: string | null
          po_box?: string | null
          search_text?: never
          street?: string | null
          trades?: string[] | null
          uid_number?: string | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          archived?: boolean | null
          categories?: string[] | null
          city?: string | null
          contact_count?: never
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string | null
          language?: Database["public"]["Enums"]["app_language"] | null
          name?: string | null
          name2?: string | null
          notes?: string | null
          phone?: string | null
          po_box?: string | null
          search_text?: never
          street?: string | null
          trades?: string[] | null
          uid_number?: string | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lv_list: {
        Row: {
          award_date: string | null
          award_justification: string | null
          awarded_bidder_id: string | null
          cost_plan_item_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          estimate_total: number | null
          id: string | null
          language: Database["public"]["Enums"]["app_language"] | null
          number: string | null
          position_count: number | null
          project_id: string | null
          status: Database["public"]["Enums"]["lv_status"] | null
          submission_deadline: string | null
          title: string | null
          trade: string | null
          updated_at: string | null
        }
        Insert: {
          award_date?: string | null
          award_justification?: string | null
          awarded_bidder_id?: string | null
          cost_plan_item_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          estimate_total?: never
          id?: string | null
          language?: Database["public"]["Enums"]["app_language"] | null
          number?: string | null
          position_count?: never
          project_id?: string | null
          status?: Database["public"]["Enums"]["lv_status"] | null
          submission_deadline?: string | null
          title?: string | null
          trade?: string | null
          updated_at?: string | null
        }
        Update: {
          award_date?: string | null
          award_justification?: string | null
          awarded_bidder_id?: string | null
          cost_plan_item_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          estimate_total?: never
          id?: string | null
          language?: Database["public"]["Enums"]["app_language"] | null
          number?: string | null
          position_count?: never
          project_id?: string | null
          status?: Database["public"]["Enums"]["lv_status"] | null
          submission_deadline?: string | null
          title?: string | null
          trade?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lvs_awarded_bidder_fkey"
            columns: ["awarded_bidder_id", "id"]
            isOneToOne: false
            referencedRelation: "lv_bidders"
            referencedColumns: ["id", "lv_id"]
          },
          {
            foreignKeyName: "lvs_awarded_bidder_fkey"
            columns: ["awarded_bidder_id", "id"]
            isOneToOne: false
            referencedRelation: "offer_totals"
            referencedColumns: ["lv_bidder_id", "lv_id"]
          },
          {
            foreignKeyName: "lvs_cost_plan_item_id_fkey"
            columns: ["cost_plan_item_id"]
            isOneToOne: false
            referencedRelation: "cost_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lvs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lvs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lvs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_totals: {
        Row: {
          gross_total: number | null
          lv_bidder_id: string | null
          lv_id: string | null
          missing_prices: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lv_bidders_lv_id_fkey"
            columns: ["lv_id"]
            isOneToOne: false
            referencedRelation: "lv_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lv_bidders_lv_id_fkey"
            columns: ["lv_id"]
            isOneToOne: false
            referencedRelation: "lvs"
            referencedColumns: ["id"]
          },
        ]
      }
      project_cost_lv_amounts: {
        Row: {
          amount: number | null
          cost_plan_item_id: string | null
          project_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lvs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lvs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_list: {
        Row: {
          city: string | null
          client_names: string | null
          cost_plan_template_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string | null
          language: Database["public"]["Enums"]["app_language"] | null
          name: string | null
          number: string | null
          search_text: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"] | null
          street: string | null
          updated_at: string | null
          zip: string | null
        }
        Insert: {
          city?: string | null
          client_names?: never
          cost_plan_template_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string | null
          language?: Database["public"]["Enums"]["app_language"] | null
          name?: string | null
          number?: string | null
          search_text?: never
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          street?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Update: {
          city?: string | null
          client_names?: never
          cost_plan_template_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string | null
          language?: Database["public"]["Enums"]["app_language"] | null
          name?: string | null
          number?: string | null
          search_text?: never
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          street?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_cost_plan_template_id_fkey"
            columns: ["cost_plan_template_id"]
            isOneToOne: false
            referencedRelation: "cost_plan_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_write: { Args: never; Returns: boolean }
      catalog_children: {
        Args: {
          p_catalog_id: string
          p_limit?: number
          p_offset?: number
          p_parent_id: string
        }
        Returns: {
          article_number: string
          child_count: number
          id: string
          kind: Database["public"]["Enums"]["node_kind"]
          number: string
          parent_id: string
          short_text: Json
          sort: number
          unit: string
          unit_price: number
        }[]
      }
      catalog_subtrees: {
        Args: { p_ids: string[] }
        Returns: {
          article_number: string | null
          catalog_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["node_kind"]
          long_text: Json
          number: string | null
          parent_id: string | null
          price_date: string | null
          search_text: string | null
          short_text: Json
          sort: number
          unit: string | null
          unit_price: number | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "catalog_nodes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      import_addresses: {
        Args: {
          company_categories: string[]
          company_language: Database["public"]["Enums"]["app_language"]
          company_trades: string[]
          import_rows: Json
        }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      lv_discount_factor: { Args: { p_discounts: Json }; Returns: number }
      lv_refresh_prices: { Args: { p_lv_ids: string[] }; Returns: undefined }
      search_catalog_nodes: {
        Args: { p_catalog_id: string; p_limit?: number; p_query: string }
        Returns: {
          article_number: string
          id: string
          kind: Database["public"]["Enums"]["node_kind"]
          number: string
          parent_id: string
          path: string
          short_text: Json
          sort: number
          unit: string
          unit_price: number
        }[]
      }
    }
    Enums: {
      app_language: "de" | "fr" | "it"
      app_role: "admin" | "planer" | "viewer"
      bidder_status: "invited" | "offered" | "declined"
      lv_status: "draft" | "tendered" | "awarded"
      node_kind: "group" | "position" | "r_position" | "text"
      project_status:
        | "acquisition"
        | "active"
        | "on_hold"
        | "completed"
        | "archived"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_language: ["de", "fr", "it"],
      app_role: ["admin", "planer", "viewer"],
      bidder_status: ["invited", "offered", "declined"],
      lv_status: ["draft", "tendered", "awarded"],
      node_kind: ["group", "position", "r_position", "text"],
      project_status: [
        "acquisition",
        "active",
        "on_hold",
        "completed",
        "archived",
      ],
    },
  },
} as const
