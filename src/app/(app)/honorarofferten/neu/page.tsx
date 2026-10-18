import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { requireProfile } from "@/lib/auth";
import { nextYearNumber } from "@/lib/next-number";
import { createClient } from "@/lib/supabase/server";

import { NewFeeOfferForm } from "./new-offer-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("feeOffers");
  return { title: t("new") };
}

export default async function NewFeeOfferPage() {
  const profile = await requireProfile();
  if (profile.role === "viewer") redirect("/honorarofferten");
  const t = await getTranslations("feeOffers");
  const supabase = await createClient();
  const { data: companies } = await supabase.from("companies").select("id, name, city").eq("archived", false).order("name");

  return (
    <div className="max-w-3xl">
      <PageHeader title={t("new")} description={t("newDescription")} />
      <NewFeeOfferForm suggestedNumber={await nextYearNumber("fee_offers")} companies={companies ?? []} />
    </div>
  );
}
