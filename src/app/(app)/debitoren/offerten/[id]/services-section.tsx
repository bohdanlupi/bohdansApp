"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Section } from "@/components/planning/fields";
import { Button } from "@/components/ui/button";
import { activeTrades } from "@/lib/fees/calc";
import { MAX_CUSTOM } from "@/lib/fees/offer-schema";
import { phaseLabel, tradeNames } from "@/lib/fees/options";
import { feeServices, serviceApplies, type ServiceState, serviceState } from "@/lib/fees/services";
import { type FeePhase, feePhases, type FeeTrade } from "@/lib/fees/sia108";
import { cn } from "@/lib/utils";

import { CommitInput } from "@/components/planning/commit-input";
import type { DataProps } from "./fee-section";

const states: ServiceState[] = ["in", "out", "no"];

const stateStyle: Record<ServiceState, string> = {
  in: "text-emerald-800 dark:text-emerald-300",
  out: "text-amber-800 dark:text-amber-300",
  no: "text-muted-foreground",
};

/** Included / not included services per phase and trade (defaults from SIA 108 and the LUPI template). */
export function ServicesSection({ data, onChange, editable, language }: DataProps) {
  const t = useTranslations("feeOffers.services");
  const trades = activeTrades(data);
  const phases = feePhases.filter((p) => trades.some((tr) => data.trades[tr].phases[p].on));

  const setService = (trade: FeeTrade, id: string, state: ServiceState) =>
    onChange((d) => ({ ...d, trades: { ...d.trades, [trade]: { ...d.trades[trade], services: { ...d.trades[trade].services, [id]: state } } } }));

  const addCustom = (phase: FeePhase) =>
    onChange((d) => ({
      ...d,
      customServices: [...d.customServices, { id: crypto.randomUUID(), phase, text: "", states: Object.fromEntries(trades.map((tr) => [tr, "in"])) }],
    }));

  if (!phases.length) return null;

  return (
    <Section title={t("title")} description={t("description")} collapseKey="fee-offer:services">
      {phases.map((phase) => {
        const items = feeServices.filter((s) => s.phase === phase && trades.some((tr) => serviceApplies(s, tr)));
        const custom = data.customServices.filter((c) => c.phase === phase);
        const phaseOn = (tr: FeeTrade) => data.trades[tr].phases[phase].on;
        return (
          <div key={phase} className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-1.5 text-left font-semibold">{phaseLabel(phase, language)}</th>
                  {trades.map((tr) => (
                    <th key={tr} className="w-32 py-1.5 pl-2 text-left text-xs font-medium text-muted-foreground">
                      {tradeNames[tr][language]}
                    </th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-1 pr-2">{s.text[language]}</td>
                    {trades.map((tr) => {
                      const applies = !s.trades || s.trades.includes(tr);
                      return (
                        <td key={tr} className="py-1 pl-2">
                          {applies && phaseOn(tr) ? (
                            <StateSelect editable={editable} value={serviceState(s, tr, data.trades[tr].services, trades)} label={`${s.text[language]} – ${tradeNames[tr][language]}`} onSelect={(state) => setService(tr, s.id, state)} />
                          ) : (
                            <span className="text-xs text-muted-foreground">–</span>
                          )}
                        </td>
                      );
                    })}
                    <td />
                  </tr>
                ))}
                {custom.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-1 pr-2">
                      <CommitInput
                        value={c.text}
                        placeholder={t("customPlaceholder")}
                        disabled={!editable}
                        onCommit={(text) => onChange((d) => ({ ...d, customServices: d.customServices.map((x) => (x.id === c.id ? { ...x, text } : x)) }))}
                      />
                    </td>
                    {trades.map((tr) => (
                      <td key={tr} className="py-1 pl-2">
                        {phaseOn(tr) ? (
                          <StateSelect editable={editable}
                            value={c.states[tr] ?? "no"}
                            label={`${c.text} – ${tradeNames[tr][language]}`}
                            onSelect={(state) => onChange((d) => ({ ...d, customServices: d.customServices.map((x) => (x.id === c.id ? { ...x, states: { ...x.states, [tr]: state } } : x)) }))}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">–</span>
                        )}
                      </td>
                    ))}
                    <td className="py-1 pl-1">
                      {editable && (
                        <Button variant="ghost" size="icon-sm" aria-label={t("removeCustom")} onClick={() => onChange((d) => ({ ...d, customServices: d.customServices.filter((x) => x.id !== c.id) }))}>
                          <Trash2 />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {editable && data.customServices.length < MAX_CUSTOM && (
              <Button variant="ghost" size="sm" className="mt-1" onClick={() => addCustom(phase)}>
                <Plus />
                {t("addCustom")}
              </Button>
            )}
          </div>
        );
      })}
    </Section>
  );
}

function StateSelect({ value, label, editable, onSelect }: { value: ServiceState; label: string; editable: boolean; onSelect: (s: ServiceState) => void }) {
  const t = useTranslations("feeOffers.services");
  return (
    <select
      aria-label={label}
      value={value}
      disabled={!editable}
      onChange={(e) => onSelect(e.target.value as ServiceState)}
      className={cn("h-7 w-full rounded border border-input bg-field px-1 text-xs outline-none focus:border-ring disabled:opacity-50", stateStyle[value])}
    >
      {states.map((s) => (
        <option key={s} value={s}>
          {t(`states.${s}`)}
        </option>
      ))}
    </select>
  );
}
