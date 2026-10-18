import { FileSignature } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { NativeSelect } from "@/components/form";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireProfile } from "@/lib/auth";
import { feeOfferStatuses } from "@/lib/fees/options";
import { createClient } from "@/lib/supabase/server";
import { param, searchWords } from "@/lib/validation";

import { invoiceRows } from "../honorarrechnungen/invoice-rows";
import { InvoiceTable } from "../honorarrechnungen/invoice-table";
import { isFeeOfferStatus, OfferTable } from "./offer-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("feeOffers") };
}

export default async function FeeOffersPage({ searchParams }: PageProps<"/honorarofferten">) {
  await requireProfile();
  const t = await getTranslations();
  const search = await searchParams;
  const q = param(search.q)?.trim() ?? "";
  const statusParam = param(search.status);
  const status = isFeeOfferStatus(statusParam) ? statusParam : null;

  const supabase = await createClient();
  let query = supabase
    .from("fee_offers")
    .select("id, number, title, city, offer_date, valid_until, status, data, company:companies(name), project:projects(id, number)")
    .order("number", { ascending: false })
    .limit(300);
  for (const word of searchWords(q)) query = query.or(`number.ilike.%${word}%,title.ilike.%${word}%,city.ilike.%${word}%`);
  if (status) query = query.eq("status", status);
  const [{ data: offers }, { data: firm }] = await Promise.all([query, supabase.from("firm_settings").select("vat_rate").eq("id", true).single()]);

  // Open invoices (Entwurf / Versendet) first, earliest due date on top. Their amounts need all invoices of the offers.
  const { data: open } = await supabase.from("fee_invoices").select("offer_id").in("status", ["draft", "sent"]);
  const openOfferIds = [...new Set((open ?? []).map((i) => i.offer_id))];
  const [{ data: openOffers }, { data: offerInvoices }] = openOfferIds.length
    ? await Promise.all([
        supabase.from("fee_offers").select("id, number, title, data, project:projects(number)").in("id", openOfferIds),
        supabase.from("fee_invoices").select("id, number, offer_id, invoice_date, due_date, status, data, created_at").in("offer_id", openOfferIds).order("created_at"),
      ])
    : [{ data: [] }, { data: [] }];
  const openInvoices = invoiceRows(openOffers ?? [], offerInvoices ?? [], firm?.vat_rate ?? 0)
    .filter((i) => i.status === "draft" || i.status === "sent")
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.number.localeCompare(b.number, "de", { numeric: true }));

  const filtered = Boolean(q || status);
  const isEmpty = !offers?.length;

  return (
    <>
      <PageHeader
        title={t("feeOffers.title")}
        description={t("feeOffers.description")}
      />

      {openInvoices.length > 0 && (
        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-semibold">{t("feeInvoices.openTitle")}</h2>
          <InvoiceTable invoices={openInvoices} showProject />
        </section>
      )}

      {openInvoices.length > 0 && <h2 className="mb-3 text-lg font-semibold">{t("feeOffers.title")}</h2>}
      {isEmpty && !filtered ? (
        <EmptyState icon={FileSignature} title={t("feeOffers.emptyTitle")} text={t("feeOffers.emptyText")} />
      ) : (
        <>
          <form className="mb-4 flex flex-wrap items-center gap-2">
            <Input name="q" defaultValue={q} placeholder={t("feeOffers.searchPlaceholder")} aria-label={t("common.search")} className="w-72" />
            <NativeSelect name="status" defaultValue={status ?? ""} className="w-48">
              <option value="">{t("feeOffers.allStatuses")}</option>
              {feeOfferStatuses.map((s) => (
                <option key={s} value={s}>
                  {t(`feeOffers.status.${s}`)}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" variant="secondary">
              {t("common.search")}
            </Button>
            {filtered && (
              <Link href="/honorarofferten" className={buttonVariants({ variant: "ghost" })}>
                {t("common.reset")}
              </Link>
            )}
          </form>

          {isEmpty ? (
            <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">{t("feeOffers.noResults")}</p>
          ) : (
            <OfferTable offers={offers} vatRate={firm?.vat_rate ?? 0} showProject />
          )}
        </>
      )}
    </>
  );
}
