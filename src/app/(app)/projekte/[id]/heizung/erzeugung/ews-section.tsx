"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { NativeSelect } from "@/components/form";
import { fmt, Notice, NumberField, Result, Section } from "@/components/planning/fields";
import { NumberParam, OptionField, Toggle } from "@/components/planning/plan-ui";
import { Button } from "@/components/ui/button";
import type { EwsContext, EwsResult } from "@/lib/heating/ews";
import { brineMedia, type BrineMedium, envelopeFactors, pePipes, regenerationRates, requirementClasses, type RockType, rockTypes } from "@/lib/heating/ews-data";
import type { GroundLayer, PlantData } from "@/lib/heating/plant-schema";

type Ews = PlantData["ews"];

/**
 * 242 Erdwärmesonden after SIA 384/6 (shown with a Sole/Wasser-WP): simplified method D.4 for einfache Anlagen with
 * Geologie, Standort, Auslegetemperatur (Tabelle 2, future neighbour probes 3.5), hydraulics and Expansionsgefäss.
 */
export function EwsSection({
  data,
  ctx,
  result: r,
  editable,
  setEws,
}: {
  data: PlantData;
  ctx: EwsContext;
  result: EwsResult;
  editable: boolean;
  setEws: (patch: Partial<Ews>) => void;
}) {
  const t = useTranslations("heatingPlan.generation.ews");
  const e = data.ews;
  const n = e.neighbours;
  const setNb = (patch: Partial<Ews["neighbours"]>) => setEws({ neighbours: { ...n, ...patch } });
  const setLayer = (id: string, patch: Partial<GroundLayer>) => setEws({ layers: e.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const rocks = Object.keys(rockTypes) as RockType[];
  const h = r.hydraulics;
  const num = (label: string, key: keyof Ews, decimals = 1, placeholder?: string, hint?: string) => (
    <NumberParam label={t(label as never)} value={e[key] as number | null} decimals={decimals} editable={editable} placeholder={placeholder} hint={hint} onChange={(v) => setEws({ [key]: v } as Partial<Ews>)} />
  );
  const required = (label: string, key: keyof Ews, decimals = 1, hint?: string, negative = false) => (
    <NumberParam label={t(label as never)} value={e[key] as number} decimals={decimals} negative={negative} editable={editable} hint={hint} onChange={(v) => v !== null && setEws({ [key]: v } as Partial<Ews>)} />
  );

  return (
    <Section title={`6 · ${t("title")}`} description={t("hint")} collapseKey="heating-generation:ews">
      {!r.simple.ok && <Notice>{t("complex", { reasons: r.simple.reasons.map((x) => t(`reasons.${x}`)).join(", ") })}</Notice>}

      {/* Wärmepumpe und Bedarf */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">{t("demand")}</h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {num("heatingCapacity", "heatingCapacity", 1, undefined, t("b0w35"))}
          {num("coolingCapacity", "coolingCapacity", 1, undefined, t("coolingHint"))}
          {num("heatLoad", "heatLoad", 1, ctx.heatLoad !== null ? fmt(ctx.heatLoad, 1) : "", t("heatLoadHint"))}
          <div className="flex items-end pb-2">
            <Toggle label={t("hotWater")} checked={e.hotWater} editable={editable} onChange={(v) => setEws({ hotWater: v })} />
          </div>
          {e.hotWater && (
            <>
              {required("hotWaterLitres", "hotWaterLitres", 0)}
              {required("hotWaterTemp", "hotWaterTemp", 0)}
              {required("coldWaterTemp", "coldWaterTemp", 0)}
              {num("heatingCapacityHotWater", "heatingCapacityHotWater", 1, e.heatingCapacity !== null ? fmt(e.heatingCapacity, 1) : "", t("b0w55"))}
            </>
          )}
        </div>
      </div>

      {/* Standort */}
      <div className="space-y-2 border-t pt-3">
        <h3 className="text-sm font-medium">{t("site")}</h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {num("altitude", "altitude", 0, ctx.altitude !== null ? fmt(ctx.altitude, 0) : "500")}
          {num("thetaMean", "thetaMean", 1, ctx.thetaMean !== null ? fmt(ctx.thetaMean, 1) : "", t("thetaMeanHint"))}
          <OptionField label={t("side")} value={e.side} options={["north", "south"] as const} optionLabel={(v) => t(`sides.${v}`)} editable={editable} onChange={(v) => setEws({ side: v })} />
          {num("thetaGs", "thetaGs", 1, fmt(r.thetaGs, 2), t("thetaGsHint"))}
          {required("gradient", "gradient", 3, t("gradientHint"))}
        </div>
      </div>

      {/* Geologie */}
      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{t("geology")}</h3>
          {editable && (
            <Button size="sm" variant="outline" onClick={() => setEws({ layers: [...e.layers, { id: crypto.randomUUID(), rock: "moraine", thickness: 0, lambda: rockTypes.moraine[0], rhoC: rockTypes.moraine[1] }] })}>
              <Plus /> {t("addLayer")}
            </Button>
          )}
        </div>
        {e.layers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noLayers")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-medium">{t("layer.rock")}</th>
                  <th className="w-24 py-1 pr-2 text-right font-medium">{t("layer.thickness")}</th>
                  <th className="w-24 py-1 pr-2 text-right font-medium">λ [W/mK]</th>
                  <th className="w-24 py-1 pr-2 text-right font-medium">ρ·c [MJ/m³K]</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {e.layers.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="py-1.5 pr-2">
                      <NativeSelect
                        value={l.rock ?? ""}
                        disabled={!editable}
                        aria-label={t("layer.rock")}
                        onChange={(ev) => {
                          const rock = (ev.target.value || null) as RockType | null;
                          setLayer(l.id, rock ? { rock, lambda: rockTypes[rock][0], rhoC: rockTypes[rock][1] } : { rock: null });
                        }}
                      >
                        <option value="">{t("layer.own")}</option>
                        {rocks.map((k) => (
                          <option key={k} value={k}>
                            {t(`rocks.${k}`)}
                          </option>
                        ))}
                      </NativeSelect>
                    </td>
                    <td className="py-1.5 pr-2">
                      <NumberField value={l.thickness} decimals={0} label={t("layer.thickness")} disabled={!editable} onChange={(v) => setLayer(l.id, { thickness: v ?? 0 })} className="h-8 rounded-lg" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <NumberField value={l.lambda} decimals={2} label="λ" disabled={!editable} onChange={(v) => v !== null && setLayer(l.id, { lambda: v, rock: null })} className="h-8 rounded-lg" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <NumberField value={l.rhoC} decimals={2} label="ρ·c" disabled={!editable} onChange={(v) => v !== null && setLayer(l.id, { rhoC: v, rock: null })} className="h-8 rounded-lg" />
                    </td>
                    <td className="py-1.5 text-right">
                      {editable && (
                        <Button size="icon" variant="ghost" aria-label={t("removeLayer")} onClick={() => setEws({ layers: e.layers.filter((x) => x.id !== l.id) })}>
                          <Trash2 />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Result label={t("r.depthLayers")} value={fmt(r.depthLayers, 0)} unit="m" />
          <Result label={t("r.lambda")} value={fmt(r.lambda, 2)} unit="W/mK" />
          <Result label={t("r.rhoC")} value={fmt(r.rhoC, 2)} unit="MJ/m³K" />
        </div>
      </div>

      {/* Sonden */}
      <div className="space-y-2 border-t pt-3">
        <h3 className="text-sm font-medium">{t("probes")}</h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <OptionField label={t("diameter")} value={String(e.diameter) as "32" | "40"} options={["32", "40"] as const} optionLabel={(v) => `Duplex ${v} mm`} editable={editable} onChange={(v) => setEws({ diameter: Number(v) as 32 | 40 })} />
          {required("count", "probes", 0, t("countHint"))}
          {required("spacing", "spacing", 1, t("spacingHint"))}
          {num("maxDepth", "maxDepth", 0, undefined, t("maxDepthHint"))}
          {e.probes === 4 && (
            <div className="flex items-end pb-2">
              <Toggle label={t("square")} checked={e.square} editable={editable} onChange={(v) => setEws({ square: v })} />
            </div>
          )}
        </div>
      </div>

      {/* Auslegetemperatur */}
      <div className="space-y-2 border-t pt-3">
        <h3 className="text-sm font-medium">{t("design")}</h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <OptionField label={t("regeneration")} value={e.regeneration} options={regenerationRates} optionLabel={(v) => t(`regenerations.${v}`)} editable={editable} onChange={(v) => setEws({ regeneration: v })} />
          <OptionField
            label={t("requirement")}
            value={e.requirement ?? "auto"}
            options={["auto", ...requirementClasses] as const}
            optionLabel={(v) => (v === "auto" ? t("requirementAuto", { r: r.requirement }) : t(`requirements.${v}`))}
            editable={editable}
            onChange={(v) => setEws({ requirement: v === "auto" ? null : v })}
          />
          <div className="flex items-end pb-2 xl:col-span-2">
            <Toggle label={t("neighbours")} checked={n.enabled} editable={editable} onChange={(v) => setNb({ enabled: v })} />
          </div>
        </div>
        {n.enabled && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <NumberParam label={t("nb.gsf")} value={n.gsf} decimals={0} editable={editable} onChange={(v) => setNb({ gsf: v })} />
              <NumberParam label={t("nb.asf")} value={n.asf} decimals={0} editable={editable} onChange={(v) => setNb({ asf: v })} hint={t("nb.asfHint")} />
              <NumberParam label={t("nb.aff")} value={n.aff} decimals={0} editable={editable} onChange={(v) => setNb({ aff: v })} hint={t("nb.affHint")} />
              <NumberParam label={t("nb.energyArea")} value={n.energyArea} decimals={0} editable={editable} placeholder={ctx.energyArea !== null ? fmt(ctx.energyArea, 0) : ""} onChange={(v) => setNb({ energyArea: v })} />
              <OptionField label={t("nb.category")} value={n.category} options={Object.keys(envelopeFactors) as (keyof typeof envelopeFactors)[]} optionLabel={(v) => `${t(`categories.${v}`)} (${fmt(envelopeFactors[v], 2)})`} editable={editable} onChange={(v) => setNb({ category: v })} />
              <NumberParam label={t("nb.qHli0")} value={n.qHli0} decimals={1} editable={editable} onChange={(v) => setNb({ qHli0: v })} hint={t("nb.qHliHint")} />
              <NumberParam label={t("nb.dqHli")} value={n.dqHli} decimals={1} editable={editable} onChange={(v) => setNb({ dqHli: v })} />
              <NumberParam label={t("nb.qW")} value={n.qW} decimals={1} editable={editable} onChange={(v) => setNb({ qW: v })} hint={t("nb.qWHint")} />
              <NumberParam label={t("nb.fGeo")} value={n.fGeo} decimals={0} editable={editable} placeholder="40" onChange={(v) => setNb({ fGeo: v })} hint={t("nb.fGeoHint")} />
              <NumberParam label={t("nb.f50m")} value={n.f50m} decimals={0} editable={editable} placeholder="0" onChange={(v) => setNb({ f50m: v })} />
            </div>
            {r.neighbour && (
              <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
                <Result label={t("r.gsfEff")} value={fmt(r.neighbour.gsfEff, 0)} unit="m²" hint="Gl. 3" />
                <Result label={t("r.qHli")} value={fmt(r.neighbour.qHli, 2)} unit="kWh/m²" />
                <Result label={t("r.fZB")} value={fmt(r.neighbour.fZB * 100, 0)} unit="%" hint="Gl. 2" />
                <Result label={t("r.pGsf")} value={fmt(r.neighbour.pGsf, 1)} unit="kWh/m²" hint="Gl. 1" />
                <Result label={t("r.cooling")} value={fmt(r.neighbour.cooling, 2)} unit="K" hint={t("r.coolingHint", { r: r.requirement })} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Ergebnis */}
      <div className="space-y-2 border-t pt-3">
        <h3 className="text-sm font-medium">{t("result")}</h3>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Result label={t("r.pSpec")} value={fmt(r.pSpec, 1)} unit="W/m" hint={e.diameter === 40 ? "Figur 10" : "Figur 9"} />
          <Result label={t("r.lengthNorm")} value={fmt(r.lengthNorm, 0)} unit="m" hint="Gl. 14" />
          <Result label={t("r.hoursNorm")} value={fmt(r.hoursNorm, 0)} unit="h" hint="Figur 12" />
          <Result label={t("r.hoursHeating")} value={fmt(r.hoursHeating, 0)} unit="h" hint="Gl. 16" />
          <Result label={t("r.qW")} value={fmt(r.qW, 0)} unit="kWh" hint="Gl. 17" />
          <Result label={t("r.hours")} value={fmt(r.hours, 0)} unit="h" hint={t("r.hoursHint")} />
          <Result label={t("r.surcharge")} value={fmt(r.surcharge, 1)} unit="%" hint="Figuren 13–21" />
          <Result label={t("r.lengthPre")} value={fmt(r.lengthPre, 1)} unit="m" hint="Gl. 20" />
          <Result label={t("r.thetaGs")} value={fmt(r.thetaGs, 2)} unit="°C" hint={t(`r.thetaGsSource.${r.thetaGsSource}`)} />
          <Result label={t("r.thetaDesign")} value={r.thetaDesign !== null ? fmt(r.thetaDesign + (r.laminar ? 1.5 : 0), 1) : ""} unit="°C" hint={r.laminar ? t("r.laminarHint") : t("r.designHint", { r: r.requirement })} />
          <Result label={t("r.length")} value={fmt(r.length, 1)} unit="m" tone={r.tooDeep ? "bad" : r.length !== null ? "ok" : undefined} hint={r.iterations.length ? t("r.iterations", { list: r.iterations.map((x) => fmt(x, 1)).join(" → ") }) : ""} />
          <Result label={t("r.lengthTotal")} value={fmt(r.lengthTotal, 0)} unit="m" hint={r.length !== null ? t("r.chosen", { n: e.probes, l: fmt(Math.ceil(r.length / 5) * 5, 0) }) : ""} />
        </div>
        {r.thetaDesign === null && <Notice>{t("checks.regenerationRequired")}</Notice>}
        {r.tooDeep && <Notice>{t("checks.tooDeep", { max: fmt(e.maxDepth, 0) })}</Notice>}
        {(e.coolingCapacity ?? 0) <= 0 && <Notice tone="info">{t("checks.noCooling")}</Notice>}
      </div>

      {/* Hydraulik */}
      <div className="space-y-2 border-t pt-3">
        <h3 className="text-sm font-medium">{t("hydraulics")}</h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <OptionField label={t("medium")} value={e.medium} options={Object.keys(brineMedia) as BrineMedium[]} optionLabel={(v) => t(`media.${v}`)} editable={editable} onChange={(v) => setEws({ medium: v })} />
          {num("cp", "cp", 2, fmt(brineMedia[e.medium].cp, 2), t("cpHint"))}
          {required("deltaT", "deltaT", 1, t("deltaTHint"))}
          {required("feedLength", "feedLength", 0, t("feedLengthHint"))}
          <OptionField label={t("feedDn")} value={String(e.feedDn)} options={pePipes.map(([o]) => String(o))} optionLabel={(v) => `PE ${v} × ${pePipes.find(([o]) => String(o) === v)![1]}`} editable={editable} onChange={(v) => setEws({ feedDn: Number(v) })} />
          {required("mainLength", "mainLength", 0, t("mainLengthHint"))}
          <OptionField label={t("mainDn")} value={String(e.mainDn)} options={pePipes.map(([o]) => String(o))} optionLabel={(v) => `PE ${v} × ${pePipes.find(([o]) => String(o) === v)![1]}`} editable={editable} onChange={(v) => setEws({ mainDn: Number(v) })} />
          {num("distributorLoss", "distributorLoss", 1, "0", t("distributorLossHint"))}
          {num("evaporatorLoss", "evaporatorLoss", 1, "0", t("evaporatorLossHint"))}
          {required("pumpEfficiency", "pumpEfficiency", 2, t("pumpEfficiencyHint"))}
        </div>
        {h && (
          <>
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              <Result label={t("r.flow")} value={fmt(h.flow, 0)} unit="l/h" />
              <Result label={t("r.perProbe")} value={fmt(h.perProbe, 0)} unit="l/h" />
              <Result label={t("r.re")} value={fmt(h.probe.re, 0)} tone={h.probe.laminar ? "warn" : "ok"} hint={h.probe.laminar ? t("r.laminar") : t("r.turbulent")} />
              <Result label={t("r.probeLoss")} value={fmt(h.probe.kPa, 1)} unit="kPa" hint={t("r.perMetre", { v: fmt(h.probe.kPaPerM, 3) })} />
              <Result label={t("r.feed")} value={fmt(h.feed.kPa, 2)} unit="kPa" tone={h.feed.ok ? undefined : "bad"} hint={t("r.velocity", { v: fmt(h.feed.v, 2), max: "1.0" })} />
              <Result label={t("r.main")} value={fmt(h.main.kPa, 2)} unit="kPa" tone={h.main.ok ? undefined : "bad"} hint={t("r.velocity", { v: fmt(h.main.v, 2), max: "1.5" })} />
              <Result label={t("r.total")} value={fmt(h.total, 1)} unit="kPa" />
              <Result label={t("r.pumpPower")} value={fmt(h.pumpPower, 0)} unit="W" hint="Gl. 23" />
              <Result label={t("r.pumpShare")} value={h.pumpShare !== null ? fmt(h.pumpShare * 100, 1) : ""} unit="%" tone={h.pumpShare === null ? undefined : h.pumpShare < 0.08 ? "ok" : "bad"} hint={t("r.pumpShareHint")} />
            </div>
            {!h.feed.ok && <Notice>{t("checks.feedVelocity")}</Notice>}
            {!h.main.ok && <Notice>{t("checks.mainVelocity")}</Notice>}
            {!h.distributorOk && <Notice>{t("checks.distributor")}</Notice>}
            {!h.deltaTOk && <Notice>{t("checks.deltaT")}</Notice>}
            {h.probe.laminar && <Notice tone="info">{t("checks.laminar")}</Notice>}
          </>
        )}
      </div>

      {/* Expansionsgefäss */}
      <div className="space-y-2 border-t pt-3">
        <h3 className="text-sm font-medium">{t("vessel")}</h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {num("extraVolume", "extraVolume", 0, "0", t("extraVolumeHint"))}
          {required("vesselPrePressure", "vesselPrePressure", 1, t("vesselPrePressureHint"))}
          {required("vesselMaxPressure", "vesselMaxPressure", 1)}
        </div>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Result label={t("r.volume")} value={fmt(r.volume, 0)} unit="l" />
          <Result label={t("r.expansion")} value={fmt(brineMedia[e.medium].expansion, 4)} hint="Tabelle 14" />
          <Result label={t("r.eta")} value={fmt(r.vessel.eta, 2)} hint="Gl. 12" />
          <Result label={t("r.vesselMin")} value={fmt(r.vessel.min, 1)} unit="l" hint={t("r.vesselMinHint")} />
          <Result label={t("r.vesselSize")} value={fmt(r.vessel.size, 0)} unit="l" hint={t("r.vesselSizeHint")} />
        </div>
      </div>
    </Section>
  );
}
