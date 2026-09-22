// Hand-written until the Supabase project is linked.
// Regenerate with: npm run db:types

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = "admin" | "planer" | "viewer";
export type AppLanguage = "de" | "fr" | "it";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: AppRole;
          language: AppLanguage;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: AppRole;
          language?: AppLanguage;
          active?: boolean;
        };
        Update: {
          full_name?: string | null;
          role?: AppRole;
          language?: AppLanguage;
          active?: boolean;
        };
        Relationships: [];
      };
      firm_settings: {
        Row: {
          id: boolean;
          name: string;
          street: string | null;
          zip: string | null;
          city: string | null;
          country: string;
          phone: string | null;
          email: string | null;
          website: string | null;
          uid_number: string | null;
          bank_name: string | null;
          iban: string | null;
          bic: string | null;
          managing_director: string | null;
          vat_rate: number;
          offer_validity_days: number;
          payment_terms_days: number;
          logo_path: string | null;
          signature_path: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: never;
        Update: Partial<Omit<Database["public"]["Tables"]["firm_settings"]["Row"], "id" | "updated_at">>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      current_app_role: { Args: Record<string, never>; Returns: AppRole | null };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      can_write: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      app_role: AppRole;
      app_language: AppLanguage;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type FirmSettings = Database["public"]["Tables"]["firm_settings"]["Row"];
