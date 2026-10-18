import { FileDown, Plus, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { NativeSelect } from "@/components/form";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { isCreditorStatus, parseQuarter, quarterOf, quarterRange } from "@/lib/creditors";
import { formatMoney } from "@/lib/number-input";
import { createClient } from "@/lib/supabase/server";
import { param } from "@/lib/validation";

import { type CreditorRow, CreditorTable } from "./creditor-table";
import { loadVatData } from "./vat-data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("creditors") };
}

const SELECT = "id, number, invoice_date, due_date, paid_date, status, category, total, vat_rate, description, file_path, company:companies(name), project:projects(number, name)";

/**
 * Kreditoren: open invoices first (earliest due date on top), then the MWST-Abrechnung of a quarter (default: the
 * previous one, which is the one to file) with all received invoices of that quarter.
 */
export default async function CreditorsPage({ searchParams }: PageProps<"/kreditoren">) {
  const profile = await requireProfile();
  const editable = profile.role !== "viewer";
  const t = await getTranslations("creditors");
  const search = await searchParams;

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });
  const current = quarterOf(today);
  const previous = current.quarter === 1 ? { year: current.year - 1, quarter: 4 as const } : { year: current.year, quarter: (current.quarter - 1) as 1 | 2 | 3 };
  const quarter = parseQuarter(param(search.jahr), param(search.quartal)) ?? previous;
  const { from, to } = quarterRange(quarter);

  const supabase = await createClient();
  const [{ data: open }, { data: inQuarter }, vat] = await Promise.all([
    supabase.from("creditor_invoices").select(SELECT).eq("status", "open").order("due_date", { nullsFirst: false }).order("invoice_date"),
    supabase.from("creditor_invoices").select(SELECT).gte("invoice_date", from).lte("invoice_date", to).order("invoice_date").order("created_at"),
    loadVatData(supabase, quarter),
  ]);
  const rows = (list: typeof open) => (list ?? []).map((r): CreditorRow => ({ ...r, status: isCreditorStatus(r.status) ? r.status : "open" }));
  const { report } = vat;

  const years = Array.from({ length: 5 }, (_, i) => current.year - i);
  const label = `Q${quarter.quarter} ${quarter.year}`;
  const line = (ziffer: string, text: string, value: number, bold = false) => (
    <div className={`flex items-baseline gap-3 py-1 ${bold ? "font-semibold" : ""}`}>
      <span className="w-10 shrink-0 text-xs text-muted-foreground tabular-nums">{ziffer}</span>
      <span className="flex-1">{text}</span>
      <span className="tabular-nums">{formatMoney(value)}</span>
    </div>
  );

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          editable && (
            <Link href="/kreditoren/neu" className={buttonVariants()}>
              <Plus className="size-4" />
              {t("new")}
            </Link>
          )
        }
      />

      <section className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">{t("openTitle")}</h2>
        {open?.length ? (
          <CreditorTable rows={rows(open)} editable={editable} />
        ) : (
          <EmptyState icon={ReceiptText} title={t("noOpenTitle")} text={t("noOpenText")} />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("vat.title", { quarter: label })}</h2>
          <form className="flex items-center gap-2">
            <NativeSelect name="quartal" defaultValue={String(quarter.quarter)} className="w-24" aria-label={t("vat.quarter")}>
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  Q{q}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="jahr" defaultValue={String(quarter.year)} className="w-28" aria-label={t("vat.year")}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" variant="secondary">
              {t("vat.show")}
            </Button>
            <a href={`/api/pdf/mwst?jahr=${quarter.year}&quartal=${quarter.quarter}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
              <FileDown className="size-4" />
              {t("vat.pdf")}
            </a>
          </form>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("vat.summary", { from: new Date(from).toLocaleDateString("de-CH"), to: new Date(to).toLocaleDateString("de-CH") })}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-10 text-sm md:grid-cols-2">
            <div>
              {line("200", t("vat.revenue", { count: vat.outgoing.length }), report.revenue)}
              {report.outputTax.map((r) => line(String(r.ziffer ?? ""), t("vat.outputTax", { rate: r.rate, base: formatMoney(r.base) }), r.tax))}
              {line("399", t("vat.outputTaxTotal"), report.outputTaxTotal, true)}
            </div>
            <div>
              {line("400", t("vat.inputTax400"), report.inputTax400)}
              {line("405", t("vat.inputTax405"), report.inputTax405)}
              {line("479", t("vat.inputTaxTotal", { count: vat.incoming.length }), report.inputTaxTotal, true)}
              <div className="mt-2 border-t pt-2">
                {line(report.balance >= 0 ? "500" : "510", report.balance >= 0 ? t("vat.toPay") : t("vat.credit"), Math.abs(report.balance), true)}
              </div>
            </div>
          </CardContent>
        </Card>

        <h3 className="pt-2 font-semibold">{t("quarterInvoices", { quarter: label })}</h3>
        {inQuarter?.length ? (
          <CreditorTable rows={rows(inQuarter)} editable={editable} />
        ) : (
          <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">{t("noQuarterInvoices")}</p>
        )}
      </section>
    </>
  );
}
