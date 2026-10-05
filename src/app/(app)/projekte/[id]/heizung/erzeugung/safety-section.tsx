"use client";

import { useTranslations } from "next-intl";

import { NativeSelect } from "@/components/form";
import { fmt, Notice, Result, Section } from "@/components/planning/fields";
import { NumberParam, OptionField, Toggle } from "@/components/planning/plan-ui";
import { generatorName, type PlantData } from "@/lib/heating/plant-schema";
import { glycolCurves, type Glycol, type SafetyResult, type VesselResult } from "@/lib/heating/safety";

type Safety = PlantData["safety"];
type Brine = Safety["brine"];

/**
 * 242 Sicherheitseinrichtungen after SWKI HE301-01: Nennwärmeleistung and Sicherheitsventil per Wärmeerzeuger,
 * Druckausdehnungsgefäss of the heating water and, with a Sole/Wasser-WP, of the Solekreis.
 */
export function SafetySection({
  data,
  result,
  editable,
  setSafety,
}: {
  data: PlantData;
  result: SafetyResult;
  editable: boolean;
  setSafety: (patch: Partial<Safety>) => void;
}) {
  const t = useTranslations("heatingPlan.generation.safety");
  const tp = useTranslations("heatingPlan");
  const s = data.safety;
  const setBrine = (patch: Partial<Brine>) => setSafety({ brine: { ...s.brine, ...patch } });
  // Solekreis of a Sole/Wasser-WP, else the Zwischenkreis of a Wasser/Wasser-WP.
  const sole = data.generators.some((g) => g.type === "hpBrine");
  const closingLabel = (c: "0.8" | "0.9") => t(`closing.${c}`);

  return (
    <Section title={`5 · ${t("title")}`} description={t("hint")} collapseKey="heating-generation:safety">
      {/* Sicherheitsventile per Wärmeerzeuger */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">{t("valves")}</h3>
        {data.generators.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noGenerators")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-medium">{t("columns.generator")}</th>
                  <th className="w-24 py-1 pr-2 text-right font-medium">{t("columns.power")}</th>
                  <th className="py-1 pr-2 font-medium">{t("columns.mode")}</th>
                  <th className="py-1 pr-2 text-right font-medium">{t("columns.flow")}</th>
                  <th className="py-1 pr-2 text-right font-medium">{t("columns.isv")}</th>
                  <th className="py-1 text-right font-medium">{t("columns.isa")}</th>
                </tr>
              </thead>
              <tbody>
                {result.valves.map((v) => (
                  <tr key={v.id} className="border-t">
                    <td className="py-1.5 pr-2">{generatorName(data.generators, data.generators.find((u) => u.id === v.id)!, (g) => tp(`generation.short.${g}` as never))}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{v.power !== null ? fmt(v.power, 1) : "–"}</td>
                    <td className="py-1.5 pr-2">{t(`mode.${v.mode}`)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{v.flow !== null ? `${fmt(v.flow, v.mode === "evaporation" ? 1 : 0)} ${v.mode === "evaporation" ? "kg/h" : "l/h"}` : "–"}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{v.isv !== null ? `DN ${v.isv}` : v.mode === "evaporation" ? t("byManufacturer") : "–"}</td>
                    <td className="py-1.5 text-right tabular-nums">{v.isa !== null ? `DN ${v.isa}` : "–"}</td>
                  </tr>
                ))}
                {result.sourceValves.map((v) => (
                  <tr key={`source-${v.id}`} className="border-t">
                    <td className="py-1.5 pr-2">
                      {generatorName(data.generators, data.generators.find((u) => u.id === v.id)!, (g) => tp(`generation.short.${g}` as never))} · {t(`sourceCircuit.${v.generator}`)}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {v.power !== null ? fmt(v.power, 1) : "–"}
                      {v.fromHeating && <span className="block text-xs text-muted-foreground">{t("fromHeating")}</span>}
                    </td>
                    <td className="py-1.5 pr-2">{t("mode.expansion")}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{v.flow !== null ? `${fmt(v.flow, 0)} l/h` : "–"}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{v.isv !== null ? `DN ${v.isv}` : "–"}</td>
                    <td className="py-1.5 text-right tabular-nums">{v.isa !== null ? `DN ${v.isa}` : "–"}</td>
                  </tr>
                ))}
                {result.hotWaterValve && (
                  <tr className="border-t">
                    <td className="py-1.5 pr-2">{t("hotWaterValve")}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(result.hotWaterValve.power, 1)}</td>
                    <td className="py-1.5 pr-2">{t("mode.expansion")}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{`${fmt(result.hotWaterValve.flow, 0)} l/h`}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{result.hotWaterValve.isv !== null ? `DN ${result.hotWaterValve.isv}` : "–"}</td>
                    <td className="py-1.5 text-right tabular-nums">{result.hotWaterValve.isa !== null ? `DN ${result.hotWaterValve.isa}` : "–"}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <NumberParam label={t("pSV")} value={s.pSV} decimals={1} editable={editable} onChange={(v) => v !== null && setSafety({ pSV: v })} hint={t("pSVHint")} />
          <OptionField label={t("closingLabel")} value={s.closing} options={["0.8", "0.9"] as const} optionLabel={closingLabel} editable={editable} onChange={(v) => setSafety({ closing: v })} />
        </div>
        <p className="text-xs text-muted-foreground">{t("valvesHint")}</p>
        {result.sourceValves.length > 0 && <p className="text-xs text-muted-foreground">{t("sourceValvesHint")}</p>}
      </div>

      {/* Druckausdehnungsgefäss Heizung */}
      <div className="space-y-3 border-t pt-3">
        <h3 className="text-sm font-medium">{t("vessel")}</h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <OptionField label={t("medium")} value={s.medium} options={["water", "antifreeze30", "antifreeze40"] as const} optionLabel={(v) => t(`media.${v}`)} editable={editable} onChange={(v) => setSafety({ medium: v })} />
          <NumberParam label={t("meanTemp")} value={s.meanTemp} decimals={1} editable={editable} placeholder={fmt(result.meanTemp, 1)} onChange={(v) => setSafety({ meanTemp: v })} hint={t("meanTempHint")} />
          <NumberParam
            label={t("vsys")}
            value={s.vsys}
            decimals={0}
            editable={editable}
            placeholder={fmt(result.vsysEstimate.volume, 0)}
            onChange={(v) => setSafety({ vsys: v })}
            hint={result.vsysEstimate.skipped ? t("vsysSkipped", { n: result.vsysEstimate.skipped }) : t("vsysHint")}
          />
          {data.storage && <NumberParam label={t("storageTemp")} value={s.storageTemp} decimals={0} editable={editable} placeholder="60" onChange={(v) => setSafety({ storageTemp: v })} hint={t("storageTempHint", { v: fmt(data.storageVolume ?? 0, 0) })} />}
          <NumberParam label={t("height")} value={s.height} decimals={1} editable={editable} onChange={(v) => setSafety({ height: v })} hint={t("heightHint")} />
          <NumberParam label={t("thetaMax")} value={s.thetaMax} decimals={0} editable={editable} placeholder="≤ 100" onChange={(v) => setSafety({ thetaMax: v })} hint={t("thetaMaxHint")} />
          <NumberParam label={t("extraP0")} value={s.extraP0} decimals={2} editable={editable} placeholder="0" onChange={(v) => setSafety({ extraP0: v })} hint={t("extraP0Hint")} />
          <NumberParam label={t("pfin")} value={s.pfin} decimals={2} editable={editable} placeholder={fmt(result.vessel.pfinMax, 1)} onChange={(v) => setSafety({ pfin: v })} hint={t("pfinHint")} />
          <NumberParam label={t("vn")} value={s.vn} decimals={0} editable={editable} placeholder={result.vessel.vn !== null ? fmt(result.vessel.vn, 0) : ""} onChange={(v) => setSafety({ vn: v })} hint={t("vnHint")} />
        </div>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Result label={t("r.phiN")} value={fmt(result.phiN, 1)} unit="kW" />
          <Result label={t("r.e")} value={fmt(result.e, 4)} hint={t("r.eHint", { t: fmt(result.meanTemp, 1) })} />
          <Result label={t("r.x")} value={fmt(result.x, 2)} hint="Figur 5" />
          <Result label={t("r.vex")} value={fmt(result.vessel.vex, 1)} unit="dm³" hint="Gl. (1)" />
          <Result label={t("r.vwr")} value={fmt(result.vessel.vwr, 1)} unit="dm³" hint="Gl. (3)" />
          <Result label={t("r.vexTot")} value={fmt(result.vessel.vexTot, 1)} unit="dm³" hint={data.storage ? "Gl. (4)" : "Gl. (2)"} />
        </div>
        <VesselResults r={result.vessel} pSV={s.pSV} />
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Result label={t("r.isl")} value={result.isl !== null ? `DN ${result.isl}` : ""} hint={t("r.islHint")} />
        </div>
      </div>

      {/* Solekreis */}
      {result.brine && (
        <div className="space-y-3 border-t pt-3">
          <h3 className="text-sm font-medium">{t(sole ? "brine" : "intermediate")}</h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <NumberParam
              label={t(sole ? "brineVsys" : "intermediateVsys")}
              value={s.brine.vsys}
              decimals={0}
              editable={editable}
              placeholder={result.brine.sia ? fmt(result.brine.vsys, 0) : ""}
              onChange={(v) => setBrine({ vsys: v })}
              hint={result.brine.sia ? t("brineVsysEws") : t(sole ? "brineVsysHint" : "intermediateVsysHint")}
            />
            <OptionField label={t("glycol")} value={s.brine.glycol} options={["propylene", "ethylene"] as const} optionLabel={(v) => t(`glycols.${v}`)} editable={editable} onChange={(v) => setBrine({ glycol: v, share: Number(Object.keys(glycolCurves[v])[0]) })} />
            <div className="space-y-1.5">
              <label htmlFor="brine-share" className="text-sm font-medium">
                {t("share")}
              </label>
              <NativeSelect id="brine-share" value={String(s.brine.share)} disabled={!editable} onChange={(e) => setBrine({ share: Number(e.target.value) })}>
                {Object.keys(glycolCurves[s.brine.glycol as Glycol]).map((k) => (
                  <option key={k} value={k}>
                    {k} Vol-%
                  </option>
                ))}
              </NativeSelect>
            </div>
            <NumberParam label={t("minTemp")} value={s.brine.minTemp} decimals={0} negative editable={editable} onChange={(v) => v !== null && setBrine({ minTemp: v })} />
            <div className="flex items-end pb-2">
              <Toggle label={t("regeneration")} checked={s.brine.regeneration} editable={editable} onChange={(v) => setBrine({ regeneration: v })} />
            </div>
            <NumberParam label={t("height")} value={s.brine.height} decimals={1} editable={editable} onChange={(v) => setBrine({ height: v })} hint={t("brineHeightHint")} />
            <NumberParam label={t("pSV")} value={s.brine.pSV} decimals={1} editable={editable} onChange={(v) => v !== null && setBrine({ pSV: v })} />
            <OptionField label={t("closingLabel")} value={s.brine.closing} options={["0.8", "0.9"] as const} optionLabel={closingLabel} editable={editable} onChange={(v) => setBrine({ closing: v })} />
            <NumberParam label={t("pfin")} value={s.brine.pfin} decimals={2} editable={editable} placeholder={fmt(result.brine.pfinMax, 1)} onChange={(v) => setBrine({ pfin: v })} />
            <NumberParam label={t("vn")} value={s.brine.vn} decimals={0} editable={editable} placeholder={result.brine.vn !== null ? fmt(result.brine.vn, 0) : ""} onChange={(v) => setBrine({ vn: v })} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Result label={t("r.e")} value={fmt(result.brine.e, 4)} hint={t("r.eBrineHint", { a: fmt(s.brine.minTemp, 0), b: s.brine.regeneration ? "40" : "20" })} />
            <Result label={t("r.x")} value="2.5" hint="3.2.4" />
            <Result label={t("r.vex")} value={fmt(result.brine.vex, 1)} unit="dm³" />
            <Result label={t("r.vwr")} value={fmt(result.brine.vwr, 1)} unit="dm³" hint={t("r.vwrMin")} />
            <Result label={t("r.vexTot")} value={fmt(result.brine.vexTot, 1)} unit="dm³" />
          </div>
          <VesselResults r={result.brine} pSV={s.brine.pSV} />
          {result.brine.sia && (
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              <Result label={t("r.siaMin")} value={fmt(result.brine.sia.min, 1)} unit="l" hint={t("r.siaMinHint")} />
              <Result label={t("r.chosen")} value={fmt(result.brine.chosen, 0)} unit="l" tone="ok" hint={t("r.chosenHint")} />
            </div>
          )}
          {!result.brine.vsys && <Notice>{t(sole ? "brineVsysMissing" : "intermediateVsysMissing")}</Notice>}
        </div>
      )}

      {result.hints.length > 0 && (
        <div className="space-y-2 border-t pt-3">
          {result.hints.map((h) => (
            <Notice key={h} tone={h === "noPower" || h === "highPressure" ? "warn" : "info"}>
              {t(`hints.${h}`)}
            </Notice>
          ))}
        </div>
      )}
    </Section>
  );
}

/** Pressures and volumes of a Druckausdehnungsgefäss with their checks. */
function VesselResults({ r, pSV }: { r: VesselResult; pSV: number }) {
  const t = useTranslations("heatingPlan.generation.safety");
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Result label={t("r.pst")} value={fmt(r.pst, 2)} unit="bar" />
        <Result label={t("r.p0")} value={fmt(r.p0, 2)} unit="bar" hint={t("r.p0Hint")} />
        <Result label={t("r.pfin")} value={fmt(r.pfin, 2)} unit="bar" tone={r.ok.safetyValve ? undefined : "bad"} hint={t("r.pfinHint", { p: fmt(pSV, 1) })} />
        <Result label={t("r.vnMin")} value={fmt(r.vnMin, 1)} unit="dm³" tone={r.ok.pressures ? undefined : "bad"} hint="Gl. (6)" />
        <Result label={t("r.vn")} value={fmt(r.vn, 0)} unit="dm³" tone={r.ok.volume === false ? "bad" : r.ok.volume ? "ok" : undefined} />
        <Result label={t("r.pfil")} value={fmt(r.pfil, 2)} unit="bar" hint="Gl. (7)" />
      </div>
      {!r.ok.pressures && <Notice>{t("checks.pressures")}</Notice>}
      {r.ok.volume === false && <Notice>{t("checks.volume")}</Notice>}
      {!r.ok.safetyValve && <Notice>{t("checks.safetyValve")}</Notice>}
    </>
  );
}
