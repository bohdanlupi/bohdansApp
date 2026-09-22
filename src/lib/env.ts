function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

// NEXT_PUBLIC_* must be referenced literally so Next.js can inline them.
export const supabaseUrl = () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

export const supabasePublishableKey = () =>
  required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

/** Server-only. Bypasses RLS – use only for admin operations such as inviting users. */
export const supabaseSecretKey = () => required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);

export const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
