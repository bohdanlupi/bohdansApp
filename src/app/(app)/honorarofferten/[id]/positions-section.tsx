"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { NativeSelect } from "@/components/form";
import { CommitInput } from "@/components/planning/commit-input";
import { NumberField, Section } from "@/components/planning/fields";
import { Button } from "@/components/ui/button";
import { positionAmount, positionPrice } from "@/lib/fees/calc";
import { type FeeOfferData, MAX_POSITIONS, type OfferPosition, positionUnits, type PositionUnit } from "@/lib/fees/offer-schema";
import { formatMoney } from "@/lib/number-input";

import { RatesEditor, type RateSuggestion } from "./fee-section";

const to5Rappen = (v: number | null) => (v === null ? null : Math.round(v * 20) / 20);

/** Free offer: positions with Menge × Ansatz (hours from a rate category of the offer or an own Ansatz). */
export function PositionsSection({
  data,
  onChange,
  editable,
  suggestion,
}: {
  data: FeeOfferData;
  onChange: (change: (d: FeeOfferData) => FeeOfferData) => void;
  editable: boolean;
  suggestion: RateSuggestion;
}) {
  const t = useTranslations("feeOffers.positions");
  const setPosition = (id: string, change: Partial<OfferPosition>) =>
    onChange((d) => ({ ...d, positions: d.positions.map((p) => (p.id === id ? { ...p, ...change } : p)) }));
  const move = (index: number, by: number) =>
    onChange((d) => {
      const positions = [...d.positions];
      const [p] = positions.splice(index, 1);
      positions.splice(index + by, 0, p);
      return { ...d, positions };
    });
  const add = () =>
    onChange((d) => ({
      ...d,
      positions: [...d.positions, { id: crypto.randomUUID(), text: "", qty: null, unit: "h", rateId: d.siaRateId || d.rates[0]?.id || null, price: null }],
    }));
  const total = data.positions.reduce((s, p) => s + positionAmount(data, p), 0);

  return (
    <Section title={t("title")} description={t("hint")} collapseKey="fee-offer:positions">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1.5 font-medium">{t("text")}</th>
              <th className="py-1.5 pl-2 font-medium">{t("qty")}</th>
              <th className="py-1.5 pl-2 font-medium">{t("unit")}</th>
              <th className="py-1.5 pl-2 font-medium">{t("price")}</th>
              <th className="py-1.5 pl-2 text-right font-medium">{t("amount")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.positions.map((p, i) => (
              <tr key={p.id} className="border-b align-top last:border-0">
                <td className="py-1">
                  <CommitInput aria-label={t("text")} multiline rows={1} value={p.text} placeholder={t("textPlaceholder")} disabled={!editable} onCommit={(text) => setPosition(p.id, { text })} />
                </td>
                <td className="py-1 pl-2">
                  <NumberField label={t("qty")} value={p.qty} decimals={2} disabled={!editable} className="w-20" onChange={(qty) => setPosition(p.id, { qty })} />
                </td>
                <td className="py-1 pl-2">
                  <NativeSelect aria-label={t("unit")} value={p.unit} disabled={!editable} className="w-24" onChange={(e) => setPosition(p.id, { unit: e.target.value as PositionUnit })}>
                    {positionUnits.map((u) => (
                      <option key={u} value={u}>
                        {t(`units.${u}`)}
                      </option>
                    ))}
                  </NativeSelect>
                </td>
                <td className="py-1 pl-2">
                  <div className="flex gap-1">
                    {p.unit === "h" && (
                      <NativeSelect
                        aria-label={t("rate")}
                        value={p.rateId ?? ""}
                        disabled={!editable}
                        className="w-44"
                        onChange={(e) => setPosition(p.id, { rateId: e.target.value || null })}
                      >
                        {data.rates.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label} ({formatMoney(r.rate)})
                          </option>
                        ))}
                        <option value="">{t("ownRate")}</option>
                      </NativeSelect>
                    )}
                    {(p.unit !== "h" || !p.rateId) && (
                      <NumberField label={t("price")} value={p.price} decimals={2} disabled={!editable} className="w-28" onChange={(price) => setPosition(p.id, { price: to5Rappen(price) })} />
                    )}
                    {p.unit === "h" && p.rateId && positionPrice(data, p) === null && <span className="self-center text-xs text-destructive">{t("rateMissing")}</span>}
                  </div>
                </td>
                <td className="py-1 pl-2 pt-2 text-right tabular-nums">{formatMoney(positionAmount(data, p))}</td>
                <td className="py-1 pl-1">
                  {editable && (
                    <div className="flex">
                      <Button variant="ghost" size="icon-sm" aria-label={t("up")} disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t("down")} disabled={i === data.positions.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t("remove")} onClick={() => onChange((d) => ({ ...d, positions: d.positions.filter((x) => x.id !== p.id) }))}>
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td className="py-1.5" colSpan={4}>
                {t("total")}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums">{formatMoney(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {editable && data.positions.length < MAX_POSITIONS && (
        <Button variant="ghost" size="sm" onClick={add}>
          <Plus />
          {t("add")}
        </Button>
      )}
      <div className="mt-4 border-t pt-4">
        <RatesEditor data={data} onChange={onChange} editable={editable} suggestion={suggestion} />
      </div>
    </Section>
  );
}
