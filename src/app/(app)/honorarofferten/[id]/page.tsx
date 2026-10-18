import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";
import { parseFeeOfferData } from "@/lib/fees/offer-schema";
import { type FeeOfferStatus, feeOfferStatuses } from "@/lib/fees/options";
import { parseFeeSettings } from "@/lib/fees/settings-schema";
import { createClient } from "@/lib/supabase/server";

import { FeeOfferEditor } from "./offer-editor";

async function loadOffer(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("fee_offers").select("*, project:projects(id, number, name)").eq("id", id).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/honorarofferten/[id]">): Promise<Metadata> {
  const offer = await loadOffer((await params).id);
  const t = await getTranslations("feeOffers");
  return { title: offer ? `${offer.number} ${offer.title}` : t("title") };
}

export default async function FeeOfferPage({ params }: PageProps<"/honorarofferten/[id]">) {
  const { id } = await params;
  const profile = await requireProfile();
  const offer = await loadOffer(id);
  if (!offer) notFound();
  const t = await getTranslations("feeOffers");

  const supabase = await createClient();
  const [{ data: companies }, { data: contacts }, { data: firm }] = await Promise.all([
    supabase.from("companies").select("id, name, city").eq("archived", false).order("name"),
    offer.company_id
      ? supabase.from("contacts").select("id, first_name, last_name, function").eq("company_id", offer.company_id).order("last_name")
      : Promise.resolve({ data: [] }),
    supabase.from("firm_settings").select("vat_rate, fee_settings").eq("id", true).single(),
  ]);
  const settings = parseFeeSettings(firm?.fee_settings);

  return (
    <div className="space-y-4">
      <Link href="/honorarofferten" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>
      <FeeOfferEditor
        key={offer.id}
        id={offer.id}
        initialHeader={{
          number: offer.number,
          title: offer.title,
          status: feeOfferStatuses.includes(offer.status as FeeOfferStatus) ? (offer.status as FeeOfferStatus) : "draft",
          company_id: offer.company_id,
          contact_id: offer.contact_id,
          street: offer.street,
          zip: offer.zip,
          city: offer.city,
          language: offer.language,
          offer_date: offer.offer_date,
          valid_until: offer.valid_until,
        }}
        initialData={parseFeeOfferData(offer.data)}
        project={offer.project}
        companies={companies ?? []}
        initialContacts={contacts ?? []}
        vatRate={firm?.vat_rate ?? 0}
        rateSuggestion={{ rates: settings.rates, siaRateId: settings.siaRateId }}
        editable={profile.role !== "viewer"}
      />
    </div>
  );
}
