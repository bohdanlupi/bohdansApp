import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";
import { type FeeInvoiceStatus, feeInvoiceStatuses, parseFeeInvoiceData } from "@/lib/fees/invoice";
import { parseFeeOfferData } from "@/lib/fees/offer-schema";
import { createClient } from "@/lib/supabase/server";

import { FeeInvoiceEditor } from "./invoice-editor";

async function loadInvoice(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("fee_invoices")
    .select("*, offer:fee_offers(id, number, title, data, project:projects(id, number, name))")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/honorarrechnungen/[id]">): Promise<Metadata> {
  const invoice = await loadInvoice((await params).id);
  const t = await getTranslations("feeInvoices");
  return { title: invoice ? `${invoice.number} ${invoice.offer?.title ?? ""}` : t("title") };
}

export default async function FeeInvoicePage({ params }: PageProps<"/honorarrechnungen/[id]">) {
  const { id } = await params;
  const profile = await requireProfile();
  const invoice = await loadInvoice(id);
  if (!invoice?.offer) notFound();
  const { offer } = invoice;

  const supabase = await createClient();
  const [{ data: previous }, { data: firm }, { count: laterPaid }] = await Promise.all([
    supabase
      .from("fee_invoices")
      .select("number, data")
      .eq("offer_id", offer.id)
      .lt("created_at", invoice.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("firm_settings").select("vat_rate").eq("id", true).single(),
    supabase.from("fee_invoices").select("id", { count: "exact", head: true }).eq("offer_id", offer.id).eq("status", "paid").gt("created_at", invoice.created_at),
  ]);

  return (
    <div className="space-y-4">
      {offer.project && (
        <Link href={`/projekte/${offer.project.id}/honorar`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          {offer.project.number} · {offer.project.name}
        </Link>
      )}
      <FeeInvoiceEditor
        key={invoice.id}
        id={invoice.id}
        initialHeader={{
          number: invoice.number,
          status: feeInvoiceStatuses.includes(invoice.status as FeeInvoiceStatus) ? (invoice.status as FeeInvoiceStatus) : "draft",
          invoice_date: invoice.invoice_date,
          due_date: invoice.due_date,
        }}
        initialData={parseFeeInvoiceData(invoice.data)}
        offer={{ id: offer.id, number: offer.number, title: offer.title, data: parseFeeOfferData(offer.data) }}
        previous={previous ? { number: previous.number, data: parseFeeInvoiceData(previous.data) } : null}
        vatRate={firm?.vat_rate ?? 0}
        editable={profile.role !== "viewer"}
        laterPaid={Boolean(laterPaid)}
      />
    </div>
  );
}
