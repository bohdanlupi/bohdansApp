import { FileDown, Plus, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { NativeSelect } from "@/components/form";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireProfile } from "@/lib/auth";
import {
  compareCreditors,
  creditorCategories,
  type CreditorSort,
  creditorStatuses,
  isCreditorCategory,
  isCreditorSortKey,
  isCreditorStatus,
  matchesCreditorSearch,
  parseQuarter,
  parseVatLines,
  quarterOf,
  quarterRange,
} from "@/lib/creditors";
import { formatMoney } from "@/lib/number-input";
import { createClient } from "@/lib/supabase/server";
import { param, searchWords } from "@/lib/validation";

import { type CreditorRow, CreditorTable } from "./creditor-table";
import { loadVatData } from "./vat-data";

const PAGE_SIZE = 50;

const SELECT = "id, number, invoice_date, due_date, paid_date, status, category, total, vat_lines, description, file_path, company:companies(name), project:projects(number, name)";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("creditors") };
}

/**
 * Kreditoren: all received invoices, filtered (search, status, category, year) and sorted by a column (newest first by
 * default), then the MWST-Abrechnung of a quarter (default: the previous one, which is the one to file) with all
 * received invoices of that quarter. Search and sorting happen in memory: the list of a firm stays small, and both
 * span the supplier and the project of the joined tables.
 */
export default async function CreditorsPage({ searchParams }: PageProps<"/kreditoren">) {
  const profile = await requireProfile();
  const editable = profile.role !== "viewer";
  const t = await getTranslations("creditors");
  const tc = await getTranslations("common");
  const search = await searchParams;

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });
  const current = quarterOf(today);
  const previous = current.quarter === 1 ? { year: current.year - 1, quarter: 4 as const } : { year: current.year, quarter: (current.quarter - 1) as 1 | 2 | 3 };
  const quarter = parseQuarter(param(search.jahr), param(search.quartal)) ?? previous;
  const { from, to } = quarterRange(quarter);

  // List filters and sorting (URL params in German like the other lists).
  const q = param(search.q)?.trim() ?? "";
  const statusParam = param(search.status);
  const status = isCreditorStatus(statusParam) ? statusParam : null;
  const categoryParam = param(search.kategorie);
  const category = isCreditorCategory(categoryParam) ? categoryParam : null;
  const yearParam = Number(param(search.rechnungsjahr));
  const year = Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 2100 ? yearParam : null;
  const sortKey = param(search.sortierung);
  const direction = param(search.richtung);
  const sort: CreditorSort = isCreditorSortKey(sortKey) ? { key: sortKey, desc: direction === "desc" } : { key: "invoiceDate", desc: direction !== "asc" };
  const page = Math.max(1, Number(param(search.seite)) || 1);
  const listParams = {
    q: q || undefined,
    status: status ?? undefined,
    kategorie: category ?? undefined,
    rechnungsjahr: year ? String(year) : undefined,
    sortierung: isCreditorSortKey(sortKey) ? sortKey : undefined,
    richtung: direction === "desc" || direction === "asc" ? direction : undefined,
  };
  const quarterParams = { jahr: String(quarter.year), quartal: String(quarter.quarter) };
  const allParams = { ...listParams, ...quarterParams };

  const supabase = await createClient();
  let query = supabase.from("creditor_invoices").select(SELECT);
  if (status) query = query.eq("status", status);
  if (category) query = query.eq("category", category);
  if (year) query = query.gte("invoice_date", `${year}-01-01`).lte("invoice_date", `${year}-12-31`);
  const [{ data: list }, { data: inQuarter }, { count: total }, vat] = await Promise.all([
    query,
    supabase.from("creditor_invoices").select(SELECT).gte("invoice_date", from).lte("invoice_date", to).order("invoice_date").order("created_at"),
    supabase.from("creditor_invoices").select("id", { count: "exact", head: true }),
    loadVatData(supabase, quarter),
  ]);
  const rows = (data: typeof list) => (data ?? []).map((r): CreditorRow => ({ ...r, vat_lines: parseVatLines(r.vat_lines), status: isCreditorStatus(r.status) ? r.status : "open" }));
  const words = searchWords(q);
  const filtered = rows(list)
    .filter((r) => matchesCreditorSearch(r, words))
    .sort(compareCreditors(sort));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const isFiltered = Boolean(q || status || category || year);
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
  // Each form keeps the other form's params as hidden fields, so filtering and the quarter don't reset each other.
  const hidden = (params: Record<string, string | undefined>) => Object.entries(params).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />);

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
        <h2 className="text-lg font-semibold">{t("allTitle")}</h2>
        {!total ? (
          <EmptyState icon={ReceiptText} title={t("emptyTitle")} text={t("emptyText")} />
        ) : (
          <>
            <form className="flex flex-wrap items-center gap-2">
              {hidden({ ...quarterParams, sortierung: listParams.sortierung, richtung: listParams.richtung })}
              <Input name="q" defaultValue={q} placeholder={t("searchPlaceholder")} aria-label={tc("search")} className="w-72" />
              <NativeSelect name="status" defaultValue={status ?? ""} className="w-36" aria-label={t("fields.status")}>
                <option value="">{t("allStatuses")}</option>
                {creditorStatuses.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect name="kategorie" defaultValue={category ?? ""} className="w-44" aria-label={t("fields.category")}>
                <option value="">{t("allCategories")}</option>
                {creditorCategories.map((c) => (
                  <option key={c} value={c}>
                    {t(`categories.${c}`)}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect name="rechnungsjahr" defaultValue={year ? String(year) : ""} className="w-32" aria-label={t("fields.invoiceDate")}>
                <option value="">{t("allYears")}</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </NativeSelect>
              <Button type="submit" variant="secondary">
                {tc("search")}
              </Button>
              {isFiltered && (
                <Link href={`?${new URLSearchParams(quarterParams)}`} className={buttonVariants({ variant: "ghost" })}>
                  {tc("reset")}
                </Link>
              )}
            </form>

            {filtered.length ? (
              <CreditorTable rows={pageRows} editable={editable} sort={{ current: sort, params: allParams }} />
            ) : (
              <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">{t("noResults")}</p>
            )}
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} params={allParams} />
          </>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("vat.title", { quarter: label })}</h2>
          <form className="flex items-center gap-2">
            {hidden(listParams)}
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
