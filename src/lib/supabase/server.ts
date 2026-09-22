import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { supabasePublishableKey, supabaseSecretKey, supabaseUrl } from "@/lib/env";
import type { Database } from "./database.types";

/** Supabase client acting as the logged-in user (RLS applies). Create one per request. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component – the proxy refreshes the session instead.
        }
      },
    },
  });
}

/** Service client that bypasses RLS. Only for admin actions after an explicit role check. */
export function createAdminClient() {
  return createSupabaseClient<Database>(supabaseUrl(), supabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
