"use client";

import { useTranslations } from "next-intl";

import { NativeSelect } from "@/components/form";
import { fmt, Notice, NumberField, Section } from "@/components/planning/fields";
import { Fact, NumberParam, OptionField } from "@/components/planning/plan-ui";
import { Label } from "@/components/ui/label";
import { activeTrades, type FeeTotals, rateOf, type TradeFee } from "@/lib/fees/calc";
import { type FeeMethod, type FeeOfferData, phaseShare, type TradeData } from "@/lib/fees/offer-schema";
import { phaseLabel, tradeNames } from "@/lib/fees/options";
import { buildingTypes, factorLimits, feePhases, type FeeTrade, feeTrades, siaColumns, tradeColumn } from "@/lib/fees/sia108";
import { formatMoney } from "@/lib/number-input";
import type { AppLanguage } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

export type DataProps = {
  data: FeeOfferData;
  onChange: (change: (data: FeeOfferData) => FeeOfferData) => void;
  editable: boolean;
  language: AppLanguage;
};

const clamp = (value: number | null, [min, max]: readonly [number, number], fallback: number) => (value === null ? fallback : Math.min(max, Math.max(min, value)));

/** Fee method, trades with their SIA 108 factors and the phases per trade. */
export function FeeSection({ data, onChange, editable, language, totals }: DataProps & { totals: FeeTotals }) {
  const t = useTranslations("feeOffers.fee");
  const trades = activeTrades(data);
  const columns = siaColumns.filter((c) => trades.some((tr) => tradeColumn[tr] === c));
  const missingZ = data.method === "sia" && columns.some((c) => data.z[c].z1 === null || data.z[c].z2 === null);

  const setTrade = (trade: FeeTrade, change: (t: TradeData) => TradeData) =>
    onChange((d) => ({ ...d, trades: { ...d.trades, [trade]: change(d.trades[trade]) } }));

  const toggleTrade = (trade: FeeTrade, on: boolean) =>
    setTrade(trade, (tr) => {
      const anyPhase = feePhases.some((p) => tr.phases[p].on);
      if (!on || anyPhase) return { ...tr, on };
      return { ...tr, on, phases: Object.fromEntries(feePhases.map((p) => [p, { ...tr.phases[p], on: true }])) as TradeData["phases"] };
    });

  return (
    <Section title={t("title")} description={t("description")} collapseKey="fee-offer:fee">
      <div className="grid gap-4 sm:grid-cols-3">
        <OptionField<FeeMethod>
          label={t("method")}
          value={data.method}
          options={["sia", "hours"]}
          optionLabel={(m) => t(`methods.${m}`)}
          editable={editable}
          onChange={(method) => onChange((d) => ({ ...d, method }))}
          hint={t(`methodHints.${data.method}`)}
        />
        {data.method === "sia" && (
          <div className="space-y-1.5">
            <Label htmlFor="sia-rate">{t("siaRate")}</Label>
            <NativeSelect id="sia-rate" value={data.siaRateId} disabled={!editable} onChange={(e) => onChange((d) => ({ ...d, siaRateId: e.target.value }))}>
              {data.rates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} – CHF {fmt(r.rate, 2)}/h
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">{t("siaRateHint")}</p>
          </div>
        )}
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("trades")}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {feeTrades.map((trade) => (
              <label key={trade} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={data.trades[trade].on} disabled={!editable} onChange={(e) => toggleTrade(trade, e.target.checked)} />
                {tradeNames[trade][language]}
              </label>
            ))}
          </div>
        </div>
      </div>

      {data.method === "sia" && columns.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("zTitle")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {columns.map((c) => (
              <div key={c} className="grid grid-cols-[auto_1fr_1fr] items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="font-medium">{t(`columns.${c}`)}</span>
                <NumberField label={`Z1 ${t(`columns.${c}`)}`} placeholder="Z1" value={data.z[c].z1} decimals={4} disabled={!editable} onChange={(z1) => onChange((d) => ({ ...d, z: { ...d.z, [c]: { ...d.z[c], z1 } } }))} />
                <NumberField label={`Z2 ${t(`columns.${c}`)}`} placeholder="Z2" value={data.z[c].z2} decimals={3} disabled={!editable} onChange={(z2) => onChange((d) => ({ ...d, z: { ...d.z, [c]: { ...d.z[c], z2 } } }))} />
              </div>
            ))}
          </div>
          {missingZ && <Notice>{t("zMissing")}</Notice>}
        </div>
      )}

      {trades.length === 0 && <Notice tone="info">{t("noTrades")}</Notice>}

      {totals.trades.map((fee) => (
        <TradeCard key={fee.trade} fee={fee} data={data} editable={editable} language={language} onTrade={(change) => setTrade(fee.trade, change)} />
      ))}
    </Section>
  );
}

function TradeCard({
  fee,
  data,
  editable,
  language,
  onTrade,
}: {
  fee: TradeFee;
  data: FeeOfferData;
  editable: boolean;
  language: AppLanguage;
  onTrade: (change: (t: TradeData) => TradeData) => void;
}) {
  const t = useTranslations("feeOffers.fee");
  const trade = data.trades[fee.trade];
  const sia = data.method === "sia";
  const column = tradeColumn[fee.trade];
  const factor = (key: "n" | "r" | "i" | "s" | "u") => (
    <NumberParam
      label={t(`factors.${key}`)}
      value={trade[key]}
      decimals={2}
      editable={editable}
      hint={t("range", { min: fmt(factorLimits[key][0], 2), max: fmt(factorLimits[key][1], 2) })}
      onChange={(v) => onTrade((tr) => ({ ...tr, [key]: clamp(v, factorLimits[key], 1), ...(key === "n" ? { buildingType: null } : {}) }))}
    />
  );
  const setPhase = (phase: (typeof feePhases)[number], change: (p: TradeData["phases"][typeof phase]) => TradeData["phases"][typeof phase]) =>
    onTrade((tr) => ({ ...tr, phases: { ...tr.phases, [phase]: change(tr.phases[phase]) } }));
  const amountOf = (phase: (typeof feePhases)[number]) => fee.phases.find((p) => p.phase === phase);

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{tradeNames[fee.trade][language]}</h3>
        <span className="text-sm tabular-nums">
          {fmt(fee.hours, 0)} h · <span className="font-semibold">CHF {formatMoney(fee.amount)}</span>
        </span>
      </div>

      {sia && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <NumberParam label={t("cost")} value={trade.cost} decimals={0} editable={editable} hint={t("costHint")} onChange={(cost) => onTrade((tr) => ({ ...tr, cost }))} />
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor={`bt-${fee.trade}`}>{t("buildingType")}</Label>
              <NativeSelect
                id={`bt-${fee.trade}`}
                value={trade.buildingType ?? ""}
                disabled={!editable}
                onChange={(e) => {
                  const type = buildingTypes.find((b) => b.id === e.target.value);
                  onTrade((tr) => ({ ...tr, buildingType: type?.id ?? null, n: type ? type.n[column] : tr.n }));
                }}
              >
                <option value="">{t("buildingTypeManual")}</option>
                {Object.entries(Object.groupBy(buildingTypes, (b) => b.group[language])).map(([group, types]) => (
                  <optgroup key={group} label={group}>
                    {types!.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.text[language]} (n = {fmt(b.n[column], 1)})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">{t("buildingTypeHint")}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-5">
            {factor("n")}
            {factor("r")}
            {factor("i")}
            {factor("s")}
            {factor("u")}
          </div>
          <div className="grid gap-x-6 sm:grid-cols-3">
            <Fact label={t("bp")} value={fee.bp ? `CHF ${fmt(fee.bp, 0)}` : "–"} />
            <Fact label={t("p")} value={fee.p !== null ? fmt(fee.p, 4) : "–"} />
            <Fact label={t("qSum")} value={`${fmt(fee.q, 1)} %`} />
          </div>
          {column === "hk" && data.trades.heating.on && data.trades.cooling.on && <p className="text-xs text-muted-foreground">{t("bpShared")}</p>}
        </>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="w-8 py-1.5" />
              <th className="py-1.5 text-left font-medium">{t("phase")}</th>
              {sia ? (
                <>
                  <th className="w-24 py-1.5 text-right font-medium">q %</th>
                  <th className="w-24 py-1.5 text-right font-medium">{t("hours")}</th>
                </>
              ) : (
                data.rates.map((r) => (
                  <th key={r.id} className="w-24 py-1.5 text-right font-medium" title={`CHF ${fmt(r.rate, 2)}/h`}>
                    {r.label} [h]
                  </th>
                ))
              )}
              <th className="w-32 py-1.5 text-right font-medium">CHF</th>
            </tr>
          </thead>
          <tbody>
            {feePhases.map((phase) => {
              const p = trade.phases[phase];
              const result = amountOf(phase);
              return (
                <tr key={phase} className={cn("border-b last:border-0", !p.on && "text-muted-foreground")}>
                  <td className="py-1">
                    <input type="checkbox" aria-label={phaseLabel(phase, language)} checked={p.on} disabled={!editable} onChange={(e) => setPhase(phase, (x) => ({ ...x, on: e.target.checked }))} />
                  </td>
                  <td className="py-1">{phaseLabel(phase, language)}</td>
                  {sia ? (
                    <>
                      <td className="py-1">
                        <NumberField
                          label={`q ${phase}`}
                          value={p.q}
                          placeholder={fmt(data.shares[column][phase], 1)}
                          disabled={!editable || !p.on}
                          onChange={(q) => setPhase(phase, (x) => ({ ...x, q: q === null ? null : Math.min(100, q) }))}
                        />
                      </td>
                      <td className="py-1 text-right tabular-nums">{p.on ? fmt(result?.hours, 0) : ""}</td>
                    </>
                  ) : (
                    data.rates.map((r) => (
                      <td key={r.id} className="py-1 pl-2">
                        <NumberField
                          label={`${r.label} ${phase}`}
                          value={p.hours[r.id] ?? null}
                          disabled={!editable || !p.on}
                          onChange={(h) =>
                            setPhase(phase, (x) => {
                              const hours = { ...x.hours };
                              if (h) hours[r.id] = h;
                              else delete hours[r.id];
                              return { ...x, hours };
                            })
                          }
                        />
                      </td>
                    ))
                  )}
                  <td className="py-1 text-right tabular-nums">{p.on ? (result?.amount === null ? "–" : formatMoney(result?.amount)) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sia && trade.cost === null && <Notice>{t("costMissing")}</Notice>}
      {!sia && data.rates.length === 0 && <Notice>{t("noRates")}</Notice>}
      {sia && rateOf(data, data.siaRateId) === null && <Notice>{t("rateMissing")}</Notice>}
      {sia && <p className="text-xs text-muted-foreground">{t("qHint", { sum: fmt(feePhases.reduce((s, ph) => s + phaseShare(data, fee.trade, ph), 0), 1) })}</p>}
    </div>
  );
}
