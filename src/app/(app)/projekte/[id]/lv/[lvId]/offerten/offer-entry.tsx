"use client";

import { FileText, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/confirm-button";
import { NativeSelect, type FormMessageKey } from "@/components/form";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pickText, type I18nText } from "@/lib/i18n-text";
import { formatMoney, formatNumber, formatQty, parseNumber } from "@/lib/number-input";
import { minus, offerGross, offerTotals } from "@/lib/offer-math";
import type { AppLanguage } from "@/lib/supabase/types";
import { isPosition, round2, type NodeKind } from "@/lib/tree";
import { cn } from "@/lib/utils";

import { removeBidder, saveOfferPrice, updateBidder, type BidderUpdate } from "./actions";
import type { BidderView } from "./bidder-list";

export type OfferRow = {
  id: string;
  parent_id: string | null;
  kind: NodeKind;
  sort: number;
  number: string | null;
  short_text: I18nText;
  unit: string | null;
  quantity: number | null;
  unit_price: number | null;
  is_optional: boolean;
  is_lump_sum: boolean;
  depth: number;
  offered: number | null;
};

export function OfferEntry({
  lvId,
  bidder,
  rows,
  language,
  editable,
}: {
  lvId: string;
  bidder: BidderView;
  rows: OfferRow[];
  language: AppLanguage;
  editable: boolean;
}) {
  const t = useTranslations("offers");
  const tt = useTranslations("tree");
  const tForms = useTranslations("forms");
  const router = useRouter();
  const [prices, setPrices] = useState(() => new Map(rows.map((r) => [r.id, r.offered])));
  const [terms, setTerms] = useState({
    discount_pct: bidder.discount_pct,
    skonto_pct: bidder.skonto_pct,
    other_deductions: bidder.other_deductions,
    vat_pct: bidder.vat_pct,
  });
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const positions = rows.filter((r) => isPosition(r.kind));

  const totals = useMemo(() => offerTotals(offerGross(rows, prices), terms), [rows, prices, terms]);
  const estimate = useMemo(() => offerGross(rows, new Map(rows.map((r) => [r.id, r.unit_price]))), [rows]);
  const missing = positions.filter((r) => prices.get(r.id) === null || prices.get(r.id) === undefined).length;

  const saveHeader = async (patch: BidderUpdate) => {
    const result = await updateBidder(bidder.id, patch);
    if (result.error) toast.error(tForms(result.error as FormMessageKey));
  };

  const savePrice = async (row: OfferRow, text: string) => {
    const value = parseNumber(text);
    if (value === (prices.get(row.id) ?? null)) return;
    setPrices((p) => new Map(p).set(row.id, value));
    const result = await saveOfferPrice(bidder.id, lvId, row.id, value);
    if (result.error) toast.error(tForms(result.error as FormMessageKey));
  };

  const focusNext = (rowId: string, offset: 1 | -1) => {
    const index = positions.findIndex((r) => r.id === rowId);
    const next = positions[index + offset];
    if (next) inputs.current.get(next.id)?.focus();
  };

  const letter = (type: string) => `/api/pdf/brief/${bidder.id}?typ=${type}`;

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4">
        <div>
          <h3 className="font-semibold">{bidder.company.name}</h3>
          <p className="text-sm text-muted-foreground">
            {[bidder.company.city, bidder.contact && [bidder.contact.first_name, bidder.contact.last_name].filter(Boolean).join(" ")]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={letter("einladung")} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <FileText />
            {t("letters.invitation")}
          </a>
          {editable && (
            <ConfirmButton
              variant="outline"
              size="sm"
              label={t("removeBidder")}
              trigger={<Trash2 />}
              title={t("removeBidder")}
              text={t("removeBidderConfirm", { name: bidder.company.name })}
              confirmLabel={t("removeBidder")}
              onConfirm={async () => {
                const result = await removeBidder(bidder.id);
                if (!result.error) router.push("?");
                return result;
              }}
            />
          )}
        </div>

        <fieldset disabled={!editable} className="grid w-full gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="space-y-1">
            <Label htmlFor="status" className="text-xs">
              {t("fields.status")}
            </Label>
            <NativeSelect
              id="status"
              defaultValue={bidder.status}
              onChange={(e) => saveHeader({ status: e.target.value as BidderView["status"] })}
            >
              {(["invited", "offered", "declined"] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="invited_at" className="text-xs">
              {t("fields.invitedAt")}
            </Label>
            <Input id="invited_at" type="date" defaultValue={bidder.invited_at ?? ""} onBlur={(e) => saveHeader({ invited_at: e.target.value || null })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="offer_received_at" className="text-xs">
              {t("fields.receivedAt")}
            </Label>
            <Input
              id="offer_received_at"
              type="date"
              defaultValue={bidder.offer_received_at ?? ""}
              onBlur={(e) => saveHeader({ offer_received_at: e.target.value || null })}
            />
          </div>
          <div className="space-y-1 sm:col-span-3">
            <Label htmlFor="offer_reference" className="text-xs">
              {t("fields.reference")}
            </Label>
            <Input
              id="offer_reference"
              defaultValue={bidder.offer_reference ?? ""}
              onBlur={(e) => saveHeader({ offer_reference: e.target.value.trim() || null })}
            />
          </div>
        </fieldset>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="w-24 py-2 pl-4 text-left font-medium">{t("columns.position")}</th>
              <th className="px-2 text-left font-medium">{t("columns.text")}</th>
              <th className="w-28 px-2 text-right font-medium">{t("columns.quantity")}</th>
              <th className="w-24 px-2 text-right font-medium">{t("columns.estimate")}</th>
              <th className="w-32 px-2 text-right font-medium">{t("columns.unitPrice")}</th>
              <th className="w-32 pr-4 pl-2 text-right font-medium">{t("columns.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const text = pickText(row.short_text, language).value;
              if (!isPosition(row.kind)) {
                if (row.kind === "text") return null;
                return (
                  <tr key={row.id} className="border-b bg-muted/20 font-semibold">
                    <td className="py-1.5 pl-4 font-mono text-xs">{row.number}</td>
                    <td colSpan={5} className="px-2 py-1.5">
                      {text}
                    </td>
                  </tr>
                );
              }
              const offered = prices.get(row.id);
              const amount = offered !== null && offered !== undefined ? round2((row.quantity ?? 0) * offered) : null;
              return (
                <tr key={row.id} className={cn("border-b last:border-0", row.is_optional && "text-muted-foreground italic")}>
                  <td className="py-1 pl-4 font-mono text-xs tabular-nums">
                    {row.kind === "r_position" && "R "}
                    {row.number}
                  </td>
                  <td className="max-w-md truncate px-2" title={text}>
                    {text}
                    {row.is_optional && <span className="ml-1.5 rounded border px-1 text-[10px] not-italic">{tt("optionalBadge")}</span>}
                  </td>
                  <td className="px-2 text-right text-xs whitespace-nowrap tabular-nums">
                    {row.is_lump_sum ? tt("lumpSumUnit") : `${formatQty(row.quantity)} ${row.unit ?? ""}`}
                  </td>
                  <td className="px-2 text-right text-xs text-muted-foreground tabular-nums">{formatMoney(row.unit_price)}</td>
                  <td className="px-1 py-0.5">
                    <input
                      ref={(el) => {
                        if (el) inputs.current.set(row.id, el);
                        else inputs.current.delete(row.id);
                      }}
                      aria-label={`${row.number} ${t("columns.unitPrice")}`}
                      inputMode="decimal"
                      disabled={!editable}
                      defaultValue={formatNumber(row.offered, 2)}
                      onBlur={(e) => {
                        const value = parseNumber(e.target.value);
                        e.target.value = formatNumber(value, 2);
                        void savePrice(row, e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "ArrowDown") {
                          e.preventDefault();
                          focusNext(row.id, 1);
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          focusNext(row.id, -1);
                        }
                      }}
                      className="h-7 w-full rounded border border-input bg-transparent px-1.5 text-right tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                    />
                  </td>
                  <td className="pr-4 pl-2 text-right tabular-nums">{amount !== null && (row.is_optional ? `(${formatMoney(amount)})` : formatMoney(amount))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset disabled={!editable} className="grid grid-cols-2 gap-3 rounded-xl border p-4">
          {(
            [
              ["discount_pct", t("fields.discount")],
              ["skonto_pct", t("fields.skonto")],
              ["other_deductions", t("fields.deductions")],
              ["vat_pct", t("fields.vat")],
            ] as const
          ).map(([field, label]) => (
            <div key={field} className="space-y-1">
              <Label htmlFor={field} className="text-xs">
                {label}
              </Label>
              <Input
                id={field}
                inputMode="decimal"
                className="text-right tabular-nums"
                defaultValue={formatNumber(terms[field], 2)}
                onBlur={(e) => {
                  const value = parseNumber(e.target.value) ?? 0;
                  e.target.value = formatNumber(value, 2);
                  if (value === terms[field]) return;
                  setTerms((current) => ({ ...current, [field]: value }));
                  void saveHeader({ [field]: value });
                }}
              />
            </div>
          ))}
          {missing > 0 && <p className="col-span-2 text-xs text-amber-600">{t("missingPrices", { count: missing })}</p>}
        </fieldset>

        <table className="w-full self-start rounded-xl border text-sm">
          <tbody>
            {[
              [t("summary.gross"), totals.gross, true],
              [`− ${t("summary.discount")} ${formatNumber(terms.discount_pct, 2, false)} %`, minus(totals.discount), false],
              [`− ${t("summary.deductions")}`, minus(totals.deductions), false],
              [t("summary.net"), totals.net, true],
              [`− ${t("summary.skonto")} ${formatNumber(terms.skonto_pct, 2, false)} %`, minus(totals.skonto), false],
              [`+ ${t("summary.vat")} ${formatNumber(terms.vat_pct, 2, false)} %`, totals.vat, false],
            ].map(([label, value, bold]) => (
              <tr key={label as string} className={cn(bold && "font-semibold")}>
                <td className="py-1 pl-4">{label as string}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{formatMoney(value as number)}</td>
              </tr>
            ))}
            <tr className="bg-brand font-semibold text-white">
              <td className="py-2 pl-4">{t("summary.total")}</td>
              <td className="py-2 pr-4 text-right tabular-nums">CHF {formatMoney(totals.total)}</td>
            </tr>
            <tr className="text-xs text-muted-foreground">
              <td className="py-1.5 pl-4">{t("summary.estimateGross")}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums">{formatMoney(estimate)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
