"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { NativeSelect } from "@/components/form";
import { findRoomType } from "@/lib/kwl/calc";
import { defaultNoiseCorrections, designNoiseLevel, noiseRequirement } from "@/lib/kwl/sia3825";

import { fmt, Notice, Section } from "../fields";
import { NumberParam } from "../plan-ui";
import { planInput, type WidgetProps } from "./types";

/** 2.2.7 / Annex C: requirement L_H per room and the design value of the A-weighted level L_Aeq. */
export function AcousticsWidget(props: WidgetProps) {
  const t = useTranslations("kwlPlan.acoustics");
  const tKwl = useTranslations("kwl");
  const p = props.plan.params;
  const k1 = planInput(props, "noise.k1", defaultNoiseCorrections.k1);
  const k2 = planInput(props, "noise.k2", defaultNoiseCorrections.k2);
  const k3 = planInput(props, "noise.k3", defaultNoiseCorrections.k3);
  const kp = planInput(props, "noise.kp", defaultNoiseCorrections.kp);
  const k = { k1: k1.value ?? 0, k2: k2.value ?? 0, k3: k3.value ?? 0, kp: kp.value ?? 0 };
  const [calcId, setCalcId] = useState(props.calcs[0]?.id ?? "");
  const calc = props.calcs.find((c) => c.id === calcId);

  return (
    <Section title={t("title")} description={t("description", { level: t(`levels.${p.noise}`) })}>
      <div className="grid gap-4 sm:grid-cols-4">
        <NumberParam label="K1" value={k1.value} editable={props.editable} onChange={k1.set} hint={t("k1Hint")} />
        <NumberParam label="K2" value={k2.value} editable={props.editable} onChange={k2.set} hint={t("k2Hint")} />
        <NumberParam label="K3" value={k3.value} editable={props.editable} onChange={k3.set} hint={t("k3Hint")} />
        <NumberParam label="K_P" value={kp.value} editable={props.editable} onChange={kp.set} hint={t("kpHint")} />
      </div>
      {props.calcs.length === 0 ? (
        <Notice tone="info">{t("empty")}</Notice>
      ) : (
        <>
          <NativeSelect aria-label={t("dwelling")} value={calcId} onChange={(e) => setCalcId(e.target.value)} className="max-w-xs">
            {props.calcs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          <table className="w-full max-w-3xl text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-1 text-left font-medium">{t("room")}</th>
                <th className="px-2 text-left font-medium">{t("type")}</th>
                <th className="px-2 text-right font-medium">{t("volume")}</th>
                <th className="px-2 text-right font-medium">L_H</th>
                <th className="px-2 text-right font-medium">{t("design")}</th>
              </tr>
            </thead>
            <tbody>
              {calc?.data.rooms.map((room) => {
                const volume = room.area ? room.area * calc.data.height : null;
                const lh = noiseRequirement(room.type, p.noise, { volumeM3: volume, demandControlled: p.operation === "demand" });
                const type = findRoomType(room.type);
                return (
                  <tr key={room.id} className="border-b last:border-0">
                    <td className="py-1">{[room.number, room.name].filter(Boolean).join(" ")}</td>
                    <td className="px-2 text-muted-foreground">{type ? `${type.code} ${tKwl(`roomTypes.${type.key}`)}` : ""}</td>
                    <td className="px-2 text-right tabular-nums">{volume ? `${fmt(volume, 1)} m³` : ""}</td>
                    <td className="px-2 text-right tabular-nums">{lh === null ? "–" : `${lh} dB`}</td>
                    <td className="px-2 text-right font-medium tabular-nums">{lh === null ? "–" : `≤ ${fmt(designNoiseLevel(lh, k), 0)} dB(A)`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </Section>
  );
}
