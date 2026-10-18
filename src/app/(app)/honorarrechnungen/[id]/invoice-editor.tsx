"use client";

import { FileText, Trash2 } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { ConfirmButton } from "@/components/confirm-button";
import { NativeSelect } from "@/components/form";
import { CommitInput } from "@/components/planning/commit-input";
import { fmt, NumberField, Section } from "@/components/planning/fields";
import { NumberParam, SaveIndicator } from "@/components/planning/plan-ui";
import { usePlan } from "@/components/planning/use-plan";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { localeToLanguage, type Locale } from "@/i18n/config";
import { type FeeInvoiceData, type FeeInvoiceStatus, feeInvoiceStatuses, type InvoiceLine, invoiceSkonto, invoiceTotals } from "@/lib/fees/invoice";
import type { FeeOfferData } from "@/lib/fees/offer-schema";
import { phaseLabel, tradeNames } from "@/lib/fees/options";
import type { FeeTrade } from "@/lib/fees/sia108";
import { formatMoney } from "@/lib/number-input";
import { cn } from "@/lib/utils";

import { deleteFeeInvoice, saveFeeInvoice } from "../actions";

export type FeeInvoiceHeaderState = {
  number: string;
  status: FeeInvoiceStatus;
  invoice_date: string;
  due_date: string | null;
};

type State = { header: FeeInvoiceHeaderState; data: FeeInvoiceData };

const fmtPct = (value: number) => `${new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 }).format(value)} %`;

export function FeeInvoiceEditor({
  id,
  initialHeader,
  initialData,
  offer,
  previous,
  vatRate,
  editable,
  laterPaid,
}: {
  id: string;
  initialHeader: FeeInvoiceHeaderState;
  initialData: FeeInvoiceData;
  offer: { id: string; number: string; title: string; data: FeeOfferData };
  /** Previous invoice of the offer (its Leistungsstand is already billed). */
  previous: { number: string; data: FeeInvoiceData } | null;
  vatRate: number;
  editable: boolean;
  /** A later invoice of the offer is paid: this one sets its deduction, so it is locked completely. */
  laterPaid: boolean;
}) {
  const t = useTranslations("feeInvoices");
  const language = localeToLanguage(useLocale() as Locale);
  const { plan, update, status } = usePlan<State>(id, { header: initialHeader, data: initialData }, editable, saveFeeInvoice);
  const { header, data } = plan;
  // Paid invoices are locked; only their status can be changed (back), unless a later invoice is paid as well.
  const canEdit = editable && header.status !== "paid" && !laterPaid;
  const canSetStatus = editable && !laterPaid;
  const skonto = invoiceSkonto(offer.data, data);
  const clampPct = (v: number | null) => Math.min(100, Math.max(0, v ?? 0));
  const totals = useMemo(() => invoiceTotals(offer.data, vatRate, data, previous?.data ?? null), [offer.data, vatRate, data, previous]);

  const setHeader = (change: Partial<FeeInvoiceHeaderState>) => update((s) => ({ ...s, header: { ...s.header, ...change } }));
  const setData = (change: (d: FeeInvoiceData) => FeeInvoiceData) => update((s) => ({ ...s, data: change(s.data) }));
  const setPhase = (trade: FeeTrade, phase: string, value: number | null) =>
    setData((d) => ({ ...d, progress: { ...d.progress, [trade]: { ...d.progress[trade], [phase]: Math.min(100, Math.max(0, value ?? 0)) } } }));

  const date = (key: "invoice_date" | "due_date") => (
    <div className="space-y-1.5">
      <Label htmlFor={`invoice-${key}`}>{t(`fields.${key}`)}</Label>
      <CommitInput id={`invoice-${key}`} type="date" value={header[key] ?? ""} required={key === "invoice_date"} disabled={!canEdit} onCommit={(v) => setHeader({ [key]: v || null })} />
    </div>
  );

  const cells = (l: InvoiceLine, input: React.ReactNode) => (
    <>
      <td className="py-1 text-right tabular-nums">{formatMoney(l.fee)}</td>
      <td className="py-1 text-right text-muted-foreground tabular-nums">{fmtPct(l.prevPct)}</td>
      <td className="py-1 pl-3">{input}</td>
      <td className="py-1 text-right tabular-nums">{formatMoney(l.earned)}</td>
      <td className={cn("py-1 text-right font-medium tabular-nums", l.amount < 0 && "text-destructive")}>{formatMoney(l.amount)}</td>
    </>
  );

  const pctInput = (label: string, value: number, prev: number, onChange: (v: number | null) => void) => (
    <div className="flex items-center gap-1">
      <NumberField label={label} value={value} decimals={0} disabled={!canEdit} className="w-20" onChange={onChange} />
      <span className="text-muted-foreground">%</span>
      {value < prev && <span className="text-xs text-destructive">{t("belowPrevious")}</span>}
    </div>
  );

  const head = (
    <tr className="border-b text-left text-xs text-muted-foreground">
      <th className="py-1.5 font-medium">{t("columns.phase")}</th>
      <th className="py-1.5 text-right font-medium">{t("columns.fee")}</th>
      <th className="py-1.5 text-right font-medium">{t("columns.prevPct")}</th>
      <th className="py-1.5 pl-3 font-medium">{t("columns.pct")}</th>
      <th className="py-1.5 text-right font-medium">{t("columns.earned")}</th>
      <th className="py-1.5 text-right font-medium">{t("columns.amount")}</th>
    </tr>
  );

  const sumRow = (label: string, value: number, opts: { negative?: boolean; bold?: boolean } = {}) => (
    <div className={cn("flex justify-between gap-4 py-0.5", opts.bold && "font-semibold")}>
      <span>{label}</span>
      <span className="tabular-nums">
        {opts.negative && value ? "−" : ""}
        {formatMoney(value)}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {header.number} {offer.title}
          </h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {t("ofOffer")}{" "}
            <Link href={`/honorarofferten/${offer.id}`} className="underline-offset-2 hover:underline">
              {offer.number}
            </Link>
            {" · "}
            {t("summary.total")}: CHF {formatMoney(totals.total)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SaveIndicator status={status} />
          <a href={`/api/pdf/honorarrechnung/${id}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
            <FileText />
            {t("pdf")}
          </a>
          {canEdit && (
            <ConfirmButton
              variant="outline"
              label={t("delete")}
              trigger={<Trash2 />}
              title={t("deleteTitle")}
              text={t("deleteText", { number: header.number })}
              confirmLabel={t("delete")}
              onConfirm={() => deleteFeeInvoice(id)}
            />
          )}
        </div>
      </div>

      {(header.status === "paid" || laterPaid) && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{laterPaid ? t("lockedLater") : t("lockedPaid")}</p>
      )}

      <Section title={t("sections.invoice")} collapseKey="fee-invoice:header">
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="invoice-number">{t("fields.number")}</Label>
            <CommitInput id="invoice-number" value={header.number} required disabled={!canEdit} onCommit={(v) => v && setHeader({ number: v })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-status">{t("fields.status")}</Label>
            <NativeSelect id="invoice-status" value={header.status} disabled={!canSetStatus} onChange={(e) => setHeader({ status: e.target.value as FeeInvoiceStatus })}>
              {feeInvoiceStatuses.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          {date("invoice_date")}
          {date("due_date")}
          <div className="space-y-1.5 sm:col-span-4">
            <Label htmlFor="invoice-text">{t("fields.text")}</Label>
            <CommitInput id="invoice-text" multiline rows={2} value={data.text} placeholder={t("textPlaceholder")} disabled={!canEdit} onCommit={(text) => setData((d) => ({ ...d, text }))} />
          </div>
        </div>
      </Section>

      <Section title={t("sections.progress")} description={previous ? t("progressHintPrevious", { number: previous.number }) : t("progressHint")} collapseKey="fee-invoice:progress">
        <div className="space-y-6 overflow-x-auto">
          {totals.trades.map((tr) => (
            <div key={tr.trade}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="font-medium">{tradeNames[tr.trade][language]}</p>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setData((d) => ({ ...d, progress: { ...d.progress, [tr.trade]: Object.fromEntries(tr.phases.map((p) => [p.phase, 100])) } }))}
                  >
                    {t("allDone")}
                  </Button>
                )}
              </div>
              <table className="w-full min-w-[40rem] text-sm">
                <thead>{head}</thead>
                <tbody>
                  {tr.phases.map((p) => (
                    <tr key={p.phase} className="border-b last:border-0">
                      <td className="py-1">{phaseLabel(p.phase, language)}</td>
                      {cells(p, pctInput(`${tradeNames[tr.trade][language]} ${p.phase}`, p.pct, p.prevPct, (v) => setPhase(tr.trade, p.phase, v)))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {totals.positions.length > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="font-medium">{t("positions")}</p>
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => setData((d) => ({ ...d, positions: Object.fromEntries(totals.positions.map((p) => [p.id, 100])) }))}>
                    {t("allPositionsDone")}
                  </Button>
                )}
              </div>
              <table className="w-full min-w-[40rem] text-sm">
                <thead>{head}</thead>
                <tbody>
                  {totals.positions.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-1 whitespace-pre-line">{p.text || "–"}</td>
                      {cells(p, pctInput(p.text, p.pct, p.prevPct, (v) => setData((d) => ({ ...d, positions: { ...d.positions, [p.id]: clampPct(v) } }))))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totals.extras.length > 0 && (
            <div>
              <p className="mb-1 font-medium">{t("extras")}</p>
              <table className="w-full min-w-[40rem] text-sm">
                <thead>{head}</thead>
                <tbody>
                  {totals.extras.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-1">{e.text || "–"}</td>
                      {cells(
                        e,
                        pctInput(e.text, e.pct, e.prevPct, (v) => setData((d) => ({ ...d, extras: { ...d.extras, [e.id]: Math.min(100, Math.max(0, v ?? 0)) } }))),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      <Section title={t("sections.summary")} collapseKey="fee-invoice:summary">
        <div className="max-w-md text-sm">
          {sumRow(t("summary.earned"), totals.current.subtotal)}
          {offer.data.discountPct > 0 && sumRow(t("summary.discount", { pct: offer.data.discountPct }), totals.current.discount, { negative: true })}
          {offer.data.expensesPct > 0 && sumRow(t("summary.expenses", { pct: offer.data.expensesPct }), totals.current.expenses)}
          {sumRow(t("summary.earnedNet"), totals.current.net, { bold: true })}
          {previous && sumRow(t("summary.previous", { number: previous.number }), totals.previous.net, { negative: true })}
          <div className="my-1 border-t" />
          {sumRow(t("summary.net"), totals.net, { bold: true })}
          {sumRow(t("summary.vat", { rate: vatRate }), totals.vat)}
          {sumRow(t("summary.total"), totals.total, { bold: true })}
          {totals.skonto > 0 && <div className="text-muted-foreground">{sumRow(t("summary.skonto", { pct: fmt(skonto.pct, 1), days: skonto.days }), totals.skonto, { negative: true })}</div>}
        </div>
        <div className="mt-4 grid max-w-md grid-cols-2 gap-3">
          <NumberParam
            label={t("fields.skontoPct")}
            value={skonto.pct}
            decimals={1}
            editable={canEdit}
            onChange={(v) => setData((d) => ({ ...d, skontoPct: v === null ? null : clampPct(v) }))}
          />
          <NumberParam
            label={t("fields.skontoDays")}
            value={skonto.days}
            editable={canEdit && skonto.pct > 0}
            onChange={(v) => setData((d) => ({ ...d, skontoDays: v === null ? null : Math.min(365, Math.max(0, Math.round(v))) }))}
          />
        </div>
      </Section>
    </div>
  );
}
