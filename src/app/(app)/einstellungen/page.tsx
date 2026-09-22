import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { FirmForm } from "./firm-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function FirmSettingsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: firm } = await supabase.from("firm_settings").select("*").eq("id", true).single();

  if (!firm) return null;
  return <FirmForm firm={firm} editable={profile.role === "admin"} />;
}
