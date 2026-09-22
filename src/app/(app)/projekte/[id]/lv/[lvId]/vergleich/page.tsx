import { FileText, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { pickText } from "@/lib/i18n-text";
import { formatMoney, formatNumber, formatQty } from "@/lib/number-input";
import { deviationPct, minus } from "@/lib/offer-math";
import { isPosition, round2 } from "@/lib/tree";
import { cn } from "@/lib/utils";

import { loadLv } from "../load-lv";
import { AwardForm } from "./award-form";
import { loadComparison } from "./load-comparison";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/lv/[lvId]/vergleich">): Promise<Metadata> {
  const { id, lvId } = await params;
  const lv = await loadLv(id, lvId);
  const t = await getTranslations("lvs.tabs");
  return { title: lv ? `${t("comparison")} · LV ${lv.number}` : t("comparison") };
}

const pct = (value: number | null) => (value === null ? "" : `${value > 0 ? "+" : ""}${formatNumber(value, 1)} %`);

export default async function ComparisonPage({ params }: PageProps<"/projekte/[id]/lv/[lvId]/vergleich">) {
  const { id, lvId } = await params;
  const profile = await requireProfile();
  if (!(await loadLv(id, lvId))) notFound();
  const data = await loadComparison(lvId);
  if (!data) notFound();

  const t = await getTranslations("comparison");
  const tt = await getTranslations("tree");
  const { lv, rows, bidders, estimate, estimateGroups } = data;
  const language = lv.language;
  const cheapest = bidders[0]?.totals.total ?? 0;

  if (bidders.length === 0) {
    return <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t("noOffers")}</p>;
  }

  const summary: { label: string; value: (b: (typeof bidders)[number]) => string; est: string; bold?: boolean; brand?: boolean }[] = [
    { label: t("summary.gross"), value: (b) => formatMoney(b.totals.gross), est: formatMoney(estimate.gross), bold: true },
    { label: t("summary.discount"), value: (b) => `${formatNumber(b.terms.discount_pct, 2, false)} % · ${formatMoney(minus(b.totals.discount))}`, est: "" },
    { label: t("summary.deductions"), value: (b) => formatMoney(minus(b.totals.deductions)), est: "" },
    { label: t("summary.net"), value: (b) => formatMoney(b.totals.net), est: formatMoney(estimate.net), bold: true },
    { label: t("summary.skonto"), value: (b) => `${formatNumber(b.terms.skonto_pct, 2, false)} % · ${formatMoney(minus(b.totals.skonto))}`, est: "" },
    { label: t("summary.vat"), value: (b) => formatMoney(b.totals.vat), est: formatMoney(estimate.vat) },
    { label: t("summary.total"), value: (b) => formatMoney(b.totals.total), est: formatMoney(estimate.total), bold: true, brand: true },
    { label: t("summary.rank"), value: (b) => `${b.rank}.`, est: "" },
    { label: t("summary.vsCheapest"), value: (b) => pct(deviationPct(b.totals.total, cheapest)), est: pct(deviationPct(estimate.total, cheapest)) },
    { label: t("summary.vsEstimate"), value: (b) => pct(deviationPct(b.totals.total, estimate.total)), est: "" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/pdf/vergleich/${lvId}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
            <FileText />
            {t("pdfComparison")}
          </a>
          <a href={`/api/pdf/vergabeantrag/${lvId}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
            <FileText />
            {t("pdfAwardProposal")}
          </a>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs">
            <tr>
              <th rowSpan={2} className="w-24 py-2 pl-4 text-left align-bottom font-medium text-muted-foreground">
                {t("columns.position")}
              </th>
              <th rowSpan={2} className="min-w-56 px-2 text-left align-bottom font-medium text-muted-foreground">
                {t("columns.text")}
              </th>
              <th rowSpan={2} className="w-24 px-2 text-right align-bottom font-medium text-muted-foreground">
                {t("columns.quantity")}
              </th>
              <th colSpan={2} className="border-l px-2 pt-2 text-center font-semibold">
                {t("estimate")}
              </th>
              {bidders.map((b) => (
                <th key={b.id} colSpan={2} className="border-l px-2 pt-2 text-center font-semibold">
                  <span className="inline-flex items-center gap-1">
                    {b.id === lv.awarded_bidder_id && <Trophy className="size-3.5 text-amber-500" />}
                    {b.rank}. {b.company.name}
                  </span>
                </th>
              ))}
            </tr>
            <tr className="text-muted-foreground">
              {[null, ...bidders].map((b) => (
                <FragmentHeaders key={b?.id ?? "estimate"} unit={t("columns.unitPrice")} amount={t("columns.amount")} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const text = pickText(row.short_text, language).value;
              if (row.kind === "text") return null;
              if (row.kind === "group") {
                return (
                  <tr key={row.id} className="border-b bg-muted/20 font-semibold">
                    <td className="py-1.5 pl-4 font-mono text-xs">{row.number}</td>
                    <td colSpan={2} className="px-2">
                      {text}
                    </td>
                    <td colSpan={2} className="border-l px-2 text-right tabular-nums">
                      {formatMoney(estimateGroups[row.id] ?? 0)}
                    </td>
                    {bidders.map((b) => (
                      <td key={b.id} colSpan={2} className="border-l px-2 text-right tabular-nums">
                        {formatMoney(b.groupTotals[row.id] ?? 0)}
                      </td>
                    ))}
                  </tr>
                );
              }
              if (!isPosition(row.kind)) return null;
              const offered = bidders.map((b) => b.prices[row.id]).filter((p): p is number => p !== null && p !== undefined);
              const min = offered.length > 1 ? Math.min(...offered) : null;
              const max = offered.length > 1 ? Math.max(...offered) : null;
              const qty = row.quantity ?? 0;
              return (
                <tr key={row.id} className={cn("border-b last:border-0", row.is_optional && "text-muted-foreground italic")}>
                  <td className="py-1 pl-4 font-mono text-xs tabular-nums">
                    {row.kind === "r_position" && "R "}
                    {row.number}
                  </td>
                  <td className="max-w-72 truncate px-2" title={text}>
                    {text}
                    {row.is_optional && <span className="ml-1.5 rounded border px-1 text-[10px] not-italic">{tt("optionalBadge")}</span>}
                  </td>
                  <td className="px-2 text-right text-xs whitespace-nowrap tabular-nums">
                    {row.is_lump_sum ? tt("lumpSumUnit") : `${formatQty(row.quantity)} ${row.unit ?? ""}`}
                  </td>
                  <td className="border-l px-2 text-right text-muted-foreground tabular-nums">{formatMoney(row.unit_price)}</td>
                  <td className="px-2 text-right text-muted-foreground tabular-nums">
                    {row.unit_price !== null && formatMoney(round2(qty * row.unit_price))}
                  </td>
                  {bidders.map((b) => {
                    const price = b.prices[row.id];
                    const has = price !== null && price !== undefined;
                    return (
                      <PriceCells
                        key={b.id}
                        price={has ? price : null}
                        amount={has ? round2(qty * price) : null}
                        tone={has && price === min ? "min" : has && price === max ? "max" : null}
                        optional={row.is_optional}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2">
            {summary.map((line) => (
              <tr key={line.label} className={cn("border-b last:border-0", line.bold && "font-semibold", line.brand && "bg-brand text-white")}>
                <td colSpan={3} className="py-1.5 pl-4">
                  {line.label}
                </td>
                <td colSpan={2} className="border-l px-2 text-right tabular-nums">
                  {line.est}
                </td>
                {bidders.map((b) => (
                  <td key={b.id} colSpan={2} className="border-l px-2 text-right whitespace-nowrap tabular-nums">
                    {line.value(b)}
                  </td>
                ))}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>

      {bidders.some((b) => b.missing > 0) && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {t("missingHint", {
            names: bidders
              .filter((b) => b.missing > 0)
              .map((b) => `${b.company.name} (${b.missing})`)
              .join(", "),
          })}
        </p>
      )}

      <AwardForm
        lvId={lvId}
        bidders={bidders.map((b) => ({ id: b.id, name: b.company.name, total: b.totals.total, rank: b.rank }))}
        award={{ bidderId: lv.awarded_bidder_id, date: lv.award_date, justification: lv.award_justification }}
        editable={profile.role !== "viewer"}
      />
    </div>
  );
}

function FragmentHeaders({ unit, amount }: { unit: string; amount: string }) {
  return (
    <>
      <th className="w-24 border-l px-2 pb-2 text-right font-medium">{unit}</th>
      <th className="w-28 px-2 pb-2 text-right font-medium">{amount}</th>
    </>
  );
}

function PriceCells({
  price,
  amount,
  tone,
  optional,
}: {
  price: number | null;
  amount: number | null;
  tone: "min" | "max" | null;
  optional: boolean;
}) {
  const style = cn(
    tone === "min" && "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
    tone === "max" && "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
  );
  return (
    <>
      <td className={cn("border-l px-2 text-right tabular-nums", style)}>{price === null ? "–" : formatMoney(price)}</td>
      <td className={cn("px-2 text-right tabular-nums", style)}>
        {amount === null ? "" : optional ? `(${formatMoney(amount)})` : formatMoney(amount)}
      </td>
    </>
  );
}
