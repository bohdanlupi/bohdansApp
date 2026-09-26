"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { NativeSelect } from "@/components/form";
import { spiLimit } from "@/lib/kwl/calc";
import type { PlanData } from "@/lib/kwl/plan-schema";
import { balanceDeviation, balanceTolerance, defaultNoiseCorrections, measuredNoiseTotal, noiseRequirement } from "@/lib/kwl/sia3825";
import { cn } from "@/lib/utils";

import { fmt, Notice, NumberField, Result, Section } from "@/components/planning/fields";
import type { WidgetProps } from "./types";

type Measurement = PlanData["measurements"][string];
type RoomMeasurement = Measurement["rooms"][string];

const deviation = (ist: number | null | undefined, soll: number | null | undefined) =>
  ist != null && soll ? (ist - soll) / soll : null;

/** Inbetriebnahme: target / measured values per room, balance ≤ 10 %, acoustics, measured power. */
export function CommissioningWidget(props: WidgetProps) {
  const t = useTranslations("kwlPlan.commissioning");
  const [calcId, setCalcId] = useState(props.calcs[0]?.id ?? "");
  const calc = props.calcs.find((c) => c.id === calcId);
  const measured: Measurement = props.plan.measurements[calcId] ?? { rooms: {}, power: null };
  const p = props.plan.params;
  const k = {
    k1: props.plan.inputs["noise.k1"] ?? defaultNoiseCorrections.k1,
    k2: props.plan.inputs["noise.k2"] ?? defaultNoiseCorrections.k2,
    k3: props.plan.inputs["noise.k3"] ?? defaultNoiseCorrections.k3,
  };

  const setRoom = (roomId: string, patch: Partial<RoomMeasurement>) =>
    props.update((d) => {
      const current = d.measurements[calcId] ?? { rooms: {}, power: null };
      const room = { ...(current.rooms[roomId] ?? { supply: null, extract: null, laeq: null }), ...patch };
      return { ...d, measurements: { ...d.measurements, [calcId]: { ...current, rooms: { ...current.rooms, [roomId]: room } } } };
    });
  const setPower = (power: number | null) =>
    props.update((d) => {
      const current = d.measurements[calcId] ?? { rooms: {}, power: null };
      return { ...d, measurements: { ...d.measurements, [calcId]: { ...current, power } } };
    });

  if (!calc) {
    return (
      <Section title={t("title")} description={t("description")}>
        <Notice tone="info">{t("empty")}</Notice>
      </Section>
    );
  }

  const rooms = calc.data.rooms.filter((r) => (r.supply ?? 0) > 0 || (r.extract ?? 0) > 0);
  const totalSupply = rooms.reduce((s, r) => s + (measured.rooms[r.id]?.supply ?? 0), 0);
  const totalExtract = rooms.reduce((s, r) => s + (measured.rooms[r.id]?.extract ?? 0), 0);
  const balance = balanceDeviation(totalSupply, totalExtract);
  const spi = measured.power && Math.max(totalSupply, totalExtract) > 0 ? measured.power / Math.max(totalSupply, totalExtract) : null;
  const pct = (v: number | null) => (v === null ? "" : `${v > 0 ? "+" : ""}${fmt(v * 100, 0)} %`);

  const cell = (roomId: string, key: keyof RoomMeasurement, label: string) => (
    <td className="px-1 py-1">
      <NumberField
        value={measured.rooms[roomId]?.[key] ?? null}
        decimals={key === "laeq" ? 1 : 0}
        label={label}
        disabled={!props.editable}
        onChange={(v) => setRoom(roomId, { [key]: v })}
        className="w-20"
      />
    </td>
  );

  return (
    <Section title={t("title")} description={t("description")}>
      <NativeSelect aria-label={t("dwelling")} value={calcId} onChange={(e) => setCalcId(e.target.value)} className="max-w-xs">
        {props.calcs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1 text-left font-medium">{t("room")}</th>
              <th className="px-2 text-right font-medium">{t("supplySoll")}</th>
              <th className="px-2 text-right font-medium">{t("supplyIst")}</th>
              <th className="px-2 text-right font-medium">Δ</th>
              <th className="px-2 text-right font-medium">{t("extractSoll")}</th>
              <th className="px-2 text-right font-medium">{t("extractIst")}</th>
              <th className="px-2 text-right font-medium">Δ</th>
              <th className="px-2 text-right font-medium">L_Aeq</th>
              <th className="px-2 text-right font-medium">{t("noiseTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => {
              const m = measured.rooms[r.id];
              const dSup = deviation(m?.supply, r.supply);
              const dExt = deviation(m?.extract, r.extract);
              const lh = noiseRequirement(r.type, p.noise, { volumeM3: r.area ? r.area * calc.data.height : null, demandControlled: p.operation === "demand" });
              const total = m?.laeq != null ? measuredNoiseTotal(m.laeq, k) : null;
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-1">{[r.number, r.name].filter(Boolean).join(" ")}</td>
                  <td className="px-2 text-right tabular-nums">{fmt(r.supply)}</td>
                  {r.supply ? cell(r.id, "supply", `${r.name} ${t("supplyIst")}`) : <td />}
                  <td className={cn("px-2 text-right tabular-nums", dSup !== null && dSup < 0 && "text-destructive")}>{pct(dSup)}</td>
                  <td className="px-2 text-right tabular-nums">{fmt(r.extract)}</td>
                  {r.extract ? cell(r.id, "extract", `${r.name} ${t("extractIst")}`) : <td />}
                  <td className={cn("px-2 text-right tabular-nums", dExt !== null && dExt < 0 && "text-destructive")}>{pct(dExt)}</td>
                  {cell(r.id, "laeq", `${r.name} L_Aeq`)}
                  <td className={cn("px-2 text-right tabular-nums", total !== null && lh !== null && (total <= lh ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"))}>
                    {total === null ? "" : `${fmt(total, 0)} / ${lh ?? "–"} dB`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Result label={t("totals")} value={`${fmt(totalSupply)} / ${fmt(totalExtract)}`} unit="m³/h" hint={t("totalsHint", { supply: fmt(calc.result.summary.supply), extract: fmt(calc.result.summary.extract) })} />
        <Result
          label={t("balance")}
          value={balance === null ? "" : `${fmt(balance * 100, 1)} %`}
          tone={balance === null ? undefined : balance <= balanceTolerance ? "ok" : "bad"}
          hint={t("balanceHint")}
        />
        <div className="rounded-lg border px-3 py-2">
          <p className="text-xs text-muted-foreground">{t("power")}</p>
          <NumberField value={measured.power} decimals={1} label={t("power")} disabled={!props.editable} onChange={setPower} className="mt-1 h-8 w-28" />
        </div>
        <Result label={t("spi")} value={fmt(spi, 2)} unit="W/(m³/h)" tone={spi === null ? undefined : spi < spiLimit ? "ok" : "bad"} />
      </div>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </Section>
  );
}
