import { FileSignature } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { NativeSelect } from "@/components/form";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireProfile } from "@/lib/auth";
import { feeTotals } from "@/lib/fees/calc";
import { parseFeeOfferData } from "@/lib/fees/offer-schema";
import { feeOfferStatuses } from "@/lib/fees/options";
import { createClient } from "@/lib/supabase/server";
import { param, searchWords } from "@/lib/validation";

import { invoiceRows } from "../honorarrechnungen/invoice-rows";
import { InvoiceStatusBadge } from "../honorarrechnungen/invoice-table";
import { isFeeOfferStatus } from "./offer-table";
import { type OverviewRow, OverviewTable } from "./overview-table";
import { FeeStatusBadge } from "./status-badge";

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

  // Open invoices (Entwurf / Versendet) first, earliest due date on top; paid invoices below the offers, newest first.
  // Their amounts need all invoices of the offers.
  const { data: invoiced } = await supabase.from("fee_invoices").select("offer_id");
  const invoicedOfferIds = [...new Set((invoiced ?? []).map((i) => i.offer_id))];
  const [{ data: invoicedOffers }, { data: offerInvoices }] = invoicedOfferIds.length
    ? await Promise.all([
        supabase.from("fee_offers").select("id, number, title, data, project:projects(number), company:companies(name)").in("id", invoicedOfferIds),
        supabase.from("fee_invoices").select("id, number, offer_id, invoice_date, due_date, status, data, created_at").in("offer_id", invoicedOfferIds).order("created_at"),
      ])
    : [{ data: [] }, { data: [] }];
  const allInvoices = invoiceRows(invoicedOffers ?? [], offerInvoices ?? [], firm?.vat_rate ?? 0);
  const paidInvoices = allInvoices
    .filter((i) => i.status === "paid")
    .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date) || b.number.localeCompare(a.number, "de", { numeric: true }));
  const openInvoices = allInvoices
    .filter((i) => i.status === "draft" || i.status === "sent")
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.number.localeCompare(b.number, "de", { numeric: true }));

  const vatRate = firm?.vat_rate ?? 0;
  const invoiceRow = (i: (typeof allInvoices)[number]): OverviewRow => ({
    id: i.id,
    href: `/honorarrechnungen/${i.id}`,
    projectNumber: i.project?.number || null,
    title: i.project?.title ?? "",
    number: `${i.number} · ${i.offerNumber}`,
    client: i.client,
    date: i.invoice_date,
    deadline: i.due_date,
    deadlineActive: i.status !== "paid",
    net: i.net,
    total: i.total,
    status: (i.status === "draft" || i.status === "sent" || i.status === "paid") && <InvoiceStatusBadge status={i.status} />,
  });
  const invoiceView = openInvoices.map(invoiceRow);
  const paidView = paidInvoices.map(invoiceRow);
  const offerView: OverviewRow[] = (offers ?? []).map((o) => {
    const totals = feeTotals(parseFeeOfferData(o.data), vatRate);
    return {
      id: o.id,
      href: `/honorarofferten/${o.id}`,
      projectNumber: o.project?.number ?? null,
      title: o.title,
      number: o.number,
      client: o.company?.name ?? null,
      date: o.offer_date,
      deadline: o.valid_until,
      deadlineActive: o.status === "draft" || o.status === "sent",
      net: totals.net,
      total: totals.total,
      status: isFeeOfferStatus(o.status) && <FeeStatusBadge status={o.status} />,
    };
  });

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
          <OverviewTable rows={invoiceView} kind="invoice" />
        </section>
      )}

      {(openInvoices.length > 0 || paidInvoices.length > 0) && <h2 className="mb-3 text-lg font-semibold">{t("feeOffers.title")}</h2>}
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
            <OverviewTable rows={offerView} kind="offer" />
          )}
        </>
      )}

      {paidView.length > 0 && (
        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-semibold">{t("feeInvoices.paidTitle")}</h2>
          <OverviewTable rows={paidView} kind="invoice" />
        </section>
      )}
    </>
  );
}
