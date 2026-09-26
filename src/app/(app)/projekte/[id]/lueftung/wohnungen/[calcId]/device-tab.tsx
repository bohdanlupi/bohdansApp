"use client";

import { useTranslations } from "next-intl";

import { NativeSelect } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { type DeviceResult, spiLimit, spiTarget } from "@/lib/kwl/calc";
import { findDevice, kwlDevices } from "@/lib/kwl/devices";
import type { PlanParams } from "@/lib/kwl/plan-schema";
import type { KwlData } from "@/lib/kwl/schema";
import { externalPressureCheck } from "@/lib/kwl/sia3825";

import { FanChart } from "./fan-chart";
import { fmt, Notice, NumberField, Result, Section } from "../../fields";

/** SIA 382/5 Table 7: external pressure drop AUL → ZUL + ABL → FOL, examples of footnotes 1) and 2). */
const pressurePresets = [
  { key: "limit", supply: 80, extract: 70 },
  { key: "target", supply: 50, extract: 50 },
] as const;

const manufacturers = [...new Set(kwlDevices.map((d) => d.name.split(",")[0]))];

export function DeviceTab({
  device: input,
  result,
  supplyFlow,
  extractFlow,
  minimumFlow,
  planParams,
  editable,
  onChange,
}: {
  device: KwlData["device"];
  result: DeviceResult;
  supplyFlow: number;
  extractFlow: number;
  minimumFlow: number;
  planParams: PlanParams;
  editable: boolean;
  onChange: (device: KwlData["device"]) => void;
}) {
  const t = useTranslations("kwl");
  const device = findDevice(input.id);
  const { supply, extract, spi } = result;
  const tooSmall = device && ((supply && !supply.nominalStage) || (extract && !extract.nominalStage));
  const lowestFlow = (side: typeof supply) => side?.points.filter((p) => p.flow > 0).at(-1)?.flow ?? null;
  const lowest = Math.max(lowestFlow(supply) ?? 0, lowestFlow(extract) ?? 0);
  const totalDrop = input.supplyDrop !== null || input.extractDrop !== null ? (input.supplyDrop ?? 0) + (input.extractDrop ?? 0) : null;
  const pressure = externalPressureCheck(planParams.system, planParams.operation === "demand", totalDrop);
  const spiTone = spi === null ? undefined : spi < spiTarget ? "ok" : spi < spiLimit ? "warn" : "bad";

  return (
    <div className="space-y-4">
      <Section title={t("device.title")} description={t("device.description")}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="kwl-device">{t("device.device")}</Label>
            <NativeSelect
              id="kwl-device"
              value={input.id ?? ""}
              disabled={!editable}
              onChange={(e) => onChange({ ...input, id: e.target.value || null })}
            >
              <option value="">{t("device.none")}</option>
              {manufacturers.map((m) => (
                <optgroup key={m} label={m}>
                  {kwlDevices
                    .filter((d) => d.name.startsWith(`${m},`))
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name.slice(m.length + 1).trim()}
                      </option>
                    ))}
                </optgroup>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="kwl-power">{t("device.power")}</Label>
            <NumberField
              id="kwl-power"
              value={input.power}
              decimals={1}
              label={t("device.power")}
              disabled={!editable}
              placeholder={t("device.powerPlaceholder")}
              onChange={(power) => onChange({ ...input, power })}
              className="h-8 max-w-40 rounded-lg"
            />
            <p className="text-xs text-muted-foreground">{t("device.powerHint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="kwl-supply-drop">{t("device.supplyDrop")}</Label>
            <NumberField id="kwl-supply-drop" value={input.supplyDrop} decimals={0} label={t("device.supplyDrop")} disabled={!editable} onChange={(supplyDrop) => onChange({ ...input, supplyDrop })} className="h-8 max-w-40 rounded-lg" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kwl-extract-drop">{t("device.extractDrop")}</Label>
            <NumberField id="kwl-extract-drop" value={input.extractDrop} decimals={0} label={t("device.extractDrop")} disabled={!editable} onChange={(extractDrop) => onChange({ ...input, extractDrop })} className="h-8 max-w-40 rounded-lg" />
          </div>
        </div>
        {editable && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("device.presets")}</span>
            {pressurePresets.map((p) => (
              <Button
                key={p.key}
                variant="outline"
                size="sm"
                onClick={() => onChange({ ...input, supplyDrop: p.supply, extractDrop: p.extract })}
              >
                {t(`device.preset.${p.key}`, { supply: p.supply, extract: p.extract })}
              </Button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t("device.dropHint")}</p>
        {pressure.status !== null && (
          <Notice tone={pressure.status === "exceeded" ? "warn" : "info"}>
            {t(`device.pressure.${pressure.status}`, { total: fmt(totalDrop), limit: pressure.limit, target: pressure.target })}
          </Notice>
        )}
      </Section>

      {!device ? (
        <Notice tone="info">{t("device.choose")}</Notice>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Result label={t("device.nominalStage")} value={supply?.nominalStage || extract?.nominalStage ? `${supply?.nominalStage?.stage ?? "–"} / ${extract?.nominalStage?.stage ?? "–"}` : ""} hint={t("device.nominalStageHint")} tone={tooSmall ? "bad" : undefined} />
            <Result label={t("summary.party")} value={fmt(result.partyFlow)} unit="m³/h" hint={t("device.partyHint")} />
            <Result
              label={t("device.spi")}
              value={fmt(spi, 2)}
              unit={t("device.spiUnit")}
              tone={spiTone}
              hint={spi === null ? t("device.spiUnknown") : t("device.spiLimits", { limit: fmt(spiLimit, 2), target: fmt(spiTarget, 2) })}
            />
            <Result
              label={t("device.spiCheck")}
              value={spi === null ? "" : `${spi < spiLimit ? t("yes") : t("no")} / ${spi < spiTarget ? t("yes") : t("no")}`}
              tone={spiTone}
              hint={t("device.spiCheckHint")}
            />
          </div>
          {result.spiFromInput && <p className="text-xs text-muted-foreground">{t("device.spiFromInput")}</p>}
          {tooSmall && <Notice>{t("device.tooSmall")}</Notice>}
          {lowest > minimumFlow && <Notice>{t("device.minimumNotReached", { lowest: fmt(lowest), minimum: fmt(minimumFlow) })}</Notice>}
          {(!supplyFlow || !extractFlow) && <Notice>{t("device.noFlows")}</Notice>}

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pl-4 text-left font-medium">{t("device.stage")}</th>
                  <th className="px-2 text-right font-medium">{t("supply")} m³/h</th>
                  <th className="px-2 text-right font-medium">{t("supply")} Pa</th>
                  <th className="px-2 text-right font-medium">{t("extract")} m³/h</th>
                  <th className="px-2 text-right font-medium">{t("extract")} Pa</th>
                  <th className="pr-4 pl-2 text-right font-medium">{t("device.stagePower")}</th>
                </tr>
              </thead>
              <tbody>
                {device.stages.map((stage, i) => {
                  const s = supply?.points[i];
                  const e = extract?.points[i];
                  const nominal = stage.stage === supply?.nominalStage?.stage || stage.stage === extract?.nominalStage?.stage;
                  return (
                    <tr key={stage.stage} className={`border-b last:border-0 ${nominal ? "bg-brand/10 font-medium" : ""}`}>
                      <td className="py-1.5 pl-4">
                        {t("device.stageN", { stage: stage.stage })}
                        {stage.stage === supply?.nominalStage?.stage && ` · ${t("supplyShort")}`}
                        {stage.stage === extract?.nominalStage?.stage && ` · ${t("extractShort")}`}
                      </td>
                      <td className="px-2 text-right tabular-nums">{fmt(s?.flow)}</td>
                      <td className="px-2 text-right tabular-nums">{fmt(s?.pressure)}</td>
                      <td className="px-2 text-right tabular-nums">{fmt(e?.flow)}</td>
                      <td className="px-2 text-right tabular-nums">{fmt(e?.pressure)}</td>
                      <td className="pr-4 pl-2 text-right tabular-nums">{stage.power ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {(["supply", "extract"] as const).map((key) => (
              <FanChart
                key={key}
                device={device}
                side={key === "supply" ? supply : extract}
                title={t(`device.chart.${key}`, { flow: fmt(key === "supply" ? supplyFlow : extractFlow), drop: fmt(key === "supply" ? input.supplyDrop : input.extractDrop) })}
                flowLabel={t("device.chart.flow")}
                pressureLabel={t("device.chart.pressure")}
                systemLabel={t("device.chart.system")}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("device.chart.hint")}</p>
        </>
      )}
    </div>
  );
}
