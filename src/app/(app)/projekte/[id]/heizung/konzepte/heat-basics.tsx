"use client";

import { ListPlus, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { NativeSelect } from "@/components/form";
import { fmt, NumberField, Section } from "@/components/planning/fields";
import { Fact, NumberParam, OptionField, SaveIndicator, Toggle } from "@/components/planning/plan-ui";
import { usePlan } from "@/components/planning/use-plan";
import { Button } from "@/components/ui/button";
import { climateStations } from "@/lib/heating/climate";
import { type Construction, type ConstructionKind, constructionValue, evaluateSite, groundwaterLevels, type HeatSite, inertiaModes } from "@/lib/heating/heat-load";
import type { HeatingPlan } from "@/lib/heating/plan-schema";

import { saveHeatingPlan } from "../actions";

const newId = () => crypto.randomUUID();

const blank = (kind: ConstructionKind, code: string, name: string, value: number | null = null, ground: Partial<Construction> = {}): Construction => ({
  id: newId(),
  code,
  name,
  kind,
  value,
  groundType: "floor",
  slabArea: null,
  perimeter: null,
  depth: null,
  ueqOverride: null,
  ...ground,
});

/** Typical catalogue of the LUPI template (U-values to be filled in). */
const typical = (): Construction[] => [
  blank("element", "W1", "Aussenwand"),
  blank("element", "W5", "Wohnungstrennwand"),
  blank("element", "IW", "Innenwand"),
  blank("element", "F1", "Fenster"),
  blank("element", "T1", "Aussentüre"),
  blank("element", "D1", "Dach"),
  blank("element", "D2", "Decke zwischen Geschossen"),
  blank("element", "D3", "Decke gegen unbeheizt"),
  blank("ground", "D4", "Bodenplatte gegen Erdreich", null, { groundType: "floor" }),
  blank("ground", "W3", "Wand gegen Erdreich", null, { groundType: "wall" }),
  blank("linear", "FEBr", "Fensterbrüstung", 0.1),
  blank("linear", "FELe", "Fensterleibung", 0.08),
  blank("linear", "FESt", "Fenstersturz", 0.08),
];

export function HeatBasics({ projectId, initial, editable }: { projectId: string; initial: HeatingPlan; editable: boolean }) {
  const t = useTranslations("heatLoad");
  const { plan, update, status } = usePlan(projectId, initial, editable, saveHeatingPlan);
  const site = plan.site;
  const s = evaluateSite(site);
  const setSite = <K extends keyof HeatSite>(key: K, value: HeatSite[K]) => update((d) => ({ ...d, site: { ...d.site, [key]: value } }));
  const setCatalog = (catalog: Construction[]) => update((d) => ({ ...d, catalog }));
  const setItem = (id: string, patch: Partial<Construction>) => setCatalog(plan.catalog.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-4">
      <Section title={t("site.title")} description={t("site.description")} actions={editable ? <SaveIndicator status={status} /> : undefined}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <OptionField
            label={t("site.station")}
            value={site.station ?? ""}
            options={["", ...climateStations.map((c) => c.name)]}
            optionLabel={(v) => v || "–"}
            editable={editable}
            onChange={(v) => setSite("station", v || null)}
          />
          <NumberParam label={t("site.altitude")} value={site.altitude} editable={editable} onChange={(v) => setSite("altitude", v)} />
          <NumberParam label={t("site.thetaEOverride")} value={site.thetaEOverride} decimals={1} editable={editable} negative onChange={(v) => setSite("thetaEOverride", v)} hint={t("site.overrideHint")} />
          <NumberParam label={t("site.thetaMeanOverride")} value={site.thetaMeanOverride} decimals={1} editable={editable} negative onChange={(v) => setSite("thetaMeanOverride", v)} />
          <OptionField label={t("site.inertia")} value={site.inertia} options={inertiaModes} optionLabel={(v) => t(`inertia.${v}`)} editable={editable} onChange={(v) => setSite("inertia", v)} hint={t("site.inertiaHint")} />
          {site.inertia === "tau" && <NumberParam label={t("site.tau")} value={site.tau} editable={editable} onChange={(v) => setSite("tau", v)} />}
          {site.inertia === "manual" && (
            <NumberParam label={t("site.inertiaManual")} value={site.inertiaManual} decimals={1} editable={editable} negative onChange={(v) => setSite("inertiaManual", v)} />
          )}
          <OptionField label={t("site.airtight")} value={site.airtight} options={["new", "old"] as const} optionLabel={(v) => t(`airtight.${v}`)} editable={editable} onChange={(v) => setSite("airtight", v)} />
          <OptionField
            label={t("site.groundwater")}
            value={site.groundwater}
            options={Object.keys(groundwaterLevels) as (keyof typeof groundwaterLevels)[]}
            optionLabel={(v) => t(`groundwater.${v}`)}
            editable={editable}
            onChange={(v) => setSite("groundwater", v)}
            hint={t("site.groundwaterHint")}
          />
        </div>
        <Toggle label={t("site.frostProtection")} checked={site.frostProtection} editable={editable} onChange={(v) => setSite("frostProtection", v)} />
        <div className="grid gap-x-8 md:grid-cols-3">
          <Fact label={t("site.thetaEClm")} value={s.thetaEClm === null ? "–" : `${fmt(s.thetaEClm, 1)} °C`} />
          <Fact label={t("site.altitudeCorrection")} value={`${fmt(s.altitudeCorrection, 2)} K`} />
          <Fact label={t("site.inertiaCorrection")} value={`${fmt(s.inertia, 2)} K`} />
          <Fact label={t("site.thetaE0")} value={s.thetaE0 === null ? "–" : `${fmt(s.thetaE0, 0)} °C`} ok={s.thetaE0 === null ? null : true} />
          <Fact label={t("site.thetaMean")} value={s.thetaMean === null ? "–" : `${fmt(s.thetaMean, 1)} °C`} />
          <Fact label={t("site.rhoCp")} value={`${fmt(s.rhoCp, 4)} Wh/m³K`} />
        </div>
      </Section>

      <Section
        title={t("catalog.title")}
        description={t("catalog.description")}
        actions={
          editable ? (
            <div className="flex flex-wrap gap-2">
              {plan.catalog.length === 0 && (
                <Button variant="outline" size="sm" onClick={() => setCatalog(typical())}>
                  <ListPlus />
                  {t("catalog.typical")}
                </Button>
              )}
              {(["element", "ground", "linear", "point"] as const).map((kind) => (
                <Button key={kind} variant="outline" size="sm" onClick={() => setCatalog([...plan.catalog, blank(kind, "", "", null, kind === "ground" ? { groundType: "floor" } : {})])}>
                  <Plus />
                  {t(`kinds.${kind}`)}
                </Button>
              ))}
            </div>
          ) : undefined
        }
      >
        {plan.catalog.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("catalog.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="py-1 font-medium">{t("catalog.code")}</th>
                  <th className="px-1 font-medium">{t("catalog.name")}</th>
                  <th className="px-1 font-medium">{t("catalog.kind")}</th>
                  <th className="px-1 text-right font-medium">{t("catalog.value")}</th>
                  <th className="px-1 font-medium">{t("catalog.groundType")}</th>
                  <th className="px-1 text-right font-medium">{t("catalog.slabArea")}</th>
                  <th className="px-1 text-right font-medium">{t("catalog.perimeter")}</th>
                  <th className="px-1 text-right font-medium">{t("catalog.depth")}</th>
                  <th className="px-1 text-right font-medium">{t("catalog.ueqOverride")}</th>
                  <th className="px-1 text-right font-medium">{t("catalog.result")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plan.catalog.map((c) => {
                  const v = constructionValue(c);
                  const ground = c.kind === "ground";
                  return (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="w-20 py-0.5 pr-1">
                        <input className="h-7 w-full rounded border border-input bg-transparent px-1.5" value={c.code} maxLength={20} disabled={!editable} aria-label={t("catalog.code")} onChange={(e) => setItem(c.id, { code: e.target.value })} />
                      </td>
                      <td className="px-1">
                        <input className="h-7 w-full min-w-48 rounded border border-input bg-transparent px-1.5" value={c.name} maxLength={120} disabled={!editable} aria-label={t("catalog.name")} onChange={(e) => setItem(c.id, { name: e.target.value })} />
                      </td>
                      <td className="px-1 whitespace-nowrap text-xs text-muted-foreground">{t(`kinds.${c.kind}`)}</td>
                      <td className="w-20 px-1">
                        <NumberField value={c.value} decimals={3} label={t(`valueOf.${c.kind}`)} disabled={!editable} onChange={(value) => setItem(c.id, { value })} />
                      </td>
                      <td className="px-1">
                        {ground && (
                          <NativeSelect value={c.groundType} disabled={!editable} className="h-7 w-24 text-xs" aria-label={t("catalog.groundType")} onChange={(e) => setItem(c.id, { groundType: e.target.value as "wall" | "floor" })}>
                            <option value="floor">{t("groundTypes.floor")}</option>
                            <option value="wall">{t("groundTypes.wall")}</option>
                          </NativeSelect>
                        )}
                      </td>
                      {(["slabArea", "perimeter", "depth", "ueqOverride"] as const).map((key) => (
                        <td key={key} className="w-20 px-1">
                          {ground && <NumberField value={c[key]} decimals={key === "ueqOverride" ? 3 : 1} label={t(`catalog.${key}`)} disabled={!editable} onChange={(value) => setItem(c.id, { [key]: value })} />}
                        </td>
                      ))}
                      <td className="px-1 text-right text-xs whitespace-nowrap tabular-nums">
                        {ground ? (v.value === null ? "–" : `Ueq ${fmt(v.value, 3)} · fe,an ${fmt(v.feAn, 1)}`) : ""}
                      </td>
                      <td className="w-8 text-right">
                        {editable && (
                          <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={t("catalog.remove")} title={t("catalog.remove")} onClick={() => setCatalog(plan.catalog.filter((x) => x.id !== c.id))}>
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t("catalog.hint")}</p>
      </Section>
    </div>
  );
}
