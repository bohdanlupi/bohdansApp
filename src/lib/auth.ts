import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import type { AppRole, Profile } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/** Profile of the logged-in user, or null. Deduplicated per request. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return profile && profile.active ? profile : null;
});

/** For pages: redirects to /login when there is no active profile. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

/** For server actions: throws when the caller lacks one of the given roles. */
export async function assertRole(...roles: AppRole[]): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile || !roles.includes(profile.role)) {
    throw new Error("Forbidden");
  }
  return profile;
}
