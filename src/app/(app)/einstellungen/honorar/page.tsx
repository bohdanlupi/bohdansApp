import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";
import { parseFeeSettings } from "@/lib/fees/settings-schema";
import { createClient } from "@/lib/supabase/server";

import { FeeSettingsForm } from "./fee-settings-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.tabs");
  return { title: t("fees") };
}

export default async function FeeSettingsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: firm } = await supabase.from("firm_settings").select("fee_settings").eq("id", true).single();
  return <FeeSettingsForm initial={parseFeeSettings(firm?.fee_settings)} editable={profile.role === "admin"} />;
}
