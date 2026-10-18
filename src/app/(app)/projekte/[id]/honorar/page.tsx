import { FileSignature, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { invoiceTotals, parseFeeInvoiceData } from "@/lib/fees/invoice";
import { parseFeeOfferData } from "@/lib/fees/offer-schema";
import { createClient } from "@/lib/supabase/server";

import { OfferTable } from "../../../honorarofferten/offer-table";
import { CreateInvoiceButton } from "../../../honorarrechnungen/create-invoice-button";
import { type InvoiceRow, InvoiceTable } from "../../../honorarrechnungen/invoice-table";
import { loadProject } from "../load-project";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/honorar">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("projects.tabs");
  return { title: project ? `${t("fee")} · ${project.number}` : t("fee") };
}

/** Honorar tab: the fee offers of the project (offer, Nachtrag, variants) and the invoices of the accepted ones. */
export default async function ProjectFeePage({ params }: PageProps<"/projekte/[id]/honorar">) {
  const { id } = await params;
  const profile = await requireProfile();
  const project = await loadProject(id);
  if (!project) notFound();
  const t = await getTranslations();
  const canWrite = profile.role !== "viewer";

  const supabase = await createClient();
  const [{ data: offers }, { data: firm }] = await Promise.all([
    supabase
      .from("fee_offers")
      .select("id, number, title, city, offer_date, status, data, company:companies(name)")
      .eq("project_id", id)
      .order("offer_date", { ascending: false })
      .order("number", { ascending: false }),
    supabase.from("firm_settings").select("vat_rate").eq("id", true).single(),
  ]);
  const vatRate = firm?.vat_rate ?? 0;
  const offerIds = (offers ?? []).map((o) => o.id);
  const { data: invoiceData } = offerIds.length
    ? await supabase.from("fee_invoices").select("id, number, offer_id, invoice_date, due_date, status, data, created_at").in("offer_id", offerIds).order("created_at")
    : { data: [] };

  // Amount of each invoice: Leistungsstand minus that of the previous invoice of the same offer.
  const invoices: InvoiceRow[] = [];
  for (const offer of offers ?? []) {
    const offerData = parseFeeOfferData(offer.data);
    let previous = null;
    for (const inv of (invoiceData ?? []).filter((i) => i.offer_id === offer.id)) {
      const data = parseFeeInvoiceData(inv.data);
      invoices.push({ ...inv, offerNumber: offer.number, total: invoiceTotals(offerData, vatRate, data, previous).total });
      previous = data;
    }
  }
  invoices.sort((a, b) => b.number.localeCompare(a.number, "de", { numeric: true }));
  const accepted = (offers ?? []).filter((o) => o.status === "accepted");

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("feeOffers.title")}</h2>
          {canWrite && (
            <Link href={`/honorarofferten/neu?projekt=${id}`} className={buttonVariants({ variant: "outline" })}>
              <Plus />
              {t("feeOffers.new")}
            </Link>
          )}
        </div>
        {offers?.length ? (
          <OfferTable offers={offers} vatRate={vatRate} />
        ) : (
          <EmptyState icon={FileSignature} title={t("feeOffers.emptyTitle")} text={t("feeOffers.emptyProjectText")} />
        )}
      </section>

      {(accepted.length > 0 || invoices.length > 0) && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("feeInvoices.title")}</h2>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                {accepted.map((o) => (
                  <CreateInvoiceButton key={o.id} offerId={o.id} offerNumber={o.number} variant="outline" />
                ))}
              </div>
            )}
          </div>
          {invoices.length ? (
            <InvoiceTable invoices={invoices} />
          ) : (
            <p className="rounded-xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">{t("feeInvoices.empty")}</p>
          )}
        </section>
      )}
    </div>
  );
}
