"use client";

import { Check, ChevronRight, PenLine, Plus, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { ConfirmButton } from "@/components/confirm-button";
import { NativeSelect } from "@/components/form";
import { fmt, NumberField, Result, Section } from "@/components/planning/fields";
import { SaveIndicator } from "@/components/planning/plan-ui";
import { usePlan } from "@/components/planning/use-plan";
import { Button, buttonVariants } from "@/components/ui/button";
import { summarizeFloors } from "@/lib/building/model";
import {
  type BuildingFloor,
  type BuildingModel,
  type BuildingZone,
  buildingStates,
  type ClimateSetKey,
  climateSetKeys,
  constructionModes,
  type EnvelopeAdjacency,
  envelopeAdjacencies,
  newFloor,
  newZone,
  type PlanInfo,
  regulations,
  type UnheatedCase,
  unheatedCaseKeys,
} from "@/lib/building/schema";
import { type ClimateStationData, climateSets, usageCategories, usageCategoryKeys } from "@/lib/building/sia3801-data";
import type { Construction } from "@/lib/heating/heat-load";
import { cn } from "@/lib/utils";

import { deleteBuildingPlan, saveBuildingModel } from "./actions";
import { PlanUploadDialog } from "./plan-upload";

const inputCls = "h-7 w-full rounded border border-input bg-field px-1.5 outline-none focus:border-ring disabled:opacity-60";

type Shared = { model: BuildingModel; update: (change: (m: BuildingModel) => BuildingModel) => void; editable: boolean; catalog: Construction[] };

/** Gebäudemodell overview: Geschosse with plans, slabs, zones (SIA 380/1) and the climate; autosaved as one document. */
export function BuildingView({ projectId, initial, plans, catalog, editable }: { projectId: string; initial: BuildingModel; plans: PlanInfo[]; catalog: Construction[]; editable: boolean }) {
  const t = useTranslations("building");
  const { plan: model, update, status } = usePlan(projectId, initial, editable, saveBuildingModel);
  const floors = summarizeFloors(model, plans);
  const totalArea = floors.every((f) => f.heatedArea !== null) ? floors.reduce((s, f) => s + (f.heatedArea ?? 0), 0) : null;
  const roomCount = floors.reduce((s, f) => s + f.roomCount, 0);
  const shared: Shared = { model, update, editable, catalog };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <Result label={t("summary.floors")} value={String(model.floors.length)} />
          <Result label={t("summary.rooms")} value={String(roomCount)} />
          <Result label={t("summary.heatedArea")} value={totalArea === null ? "–" : fmt(totalArea, 1)} unit="m²" hint={totalArea === null && roomCount ? t("summary.uncalibrated") : undefined} />
        </div>
        <Link href={`/projekte/${projectId}/gebaeude/sia3801`} className={buttonVariants({ variant: "outline" })}>
          {t("sia3801.link")}
          <ChevronRight />
        </Link>
      </div>

      <FloorsTable projectId={projectId} plans={plans} status={status} {...shared} />
      <SlabsTable {...shared} />
      <ZonesSection {...shared} />
      <ClimateSection {...shared} />

      <div className="space-y-1.5">
        <label htmlFor="bm-notes" className="text-sm font-medium">
          {t("notes")}
        </label>
        <textarea
          id="bm-notes"
          value={model.notes}
          maxLength={4000}
          disabled={!editable}
          rows={3}
          onChange={(e) => update((m) => ({ ...m, notes: e.target.value }))}
          className="w-full rounded-lg border border-input bg-field px-3 py-2 text-sm outline-none focus:border-ring disabled:opacity-60"
        />
      </div>
    </div>
  );
}

function FloorsTable({ projectId, plans, status, model, update, editable }: Shared & { projectId: string; plans: PlanInfo[]; status: Parameters<typeof SaveIndicator>[0]["status"] }) {
  const t = useTranslations("building");
  const router = useRouter();
  const floors = summarizeFloors(model, plans);
  const setFloor = (key: string, patch: Partial<BuildingFloor>) => update((m) => ({ ...m, floors: m.floors.map((f) => (f.key === key ? { ...f, ...patch } : f)) }));
  const addFloor = () => {
    const top = model.floors.reduce((max, f) => Math.max(max, f.level), -1);
    const level = top + 1;
    const key = `f${Date.now().toString(36)}`;
    const name = level === 0 ? "EG" : level < 0 ? `${-level}. UG` : `${level}. OG`;
    update((m) => ({ ...m, floors: [...m.floors, newFloor(key, name, level)] }));
  };
  const removeFloor = (key: string) =>
    update((m) => ({ ...m, floors: m.floors.filter((f) => f.key !== key), rooms: m.rooms.filter((r) => r.floor !== key), envelopes: m.envelopes.filter((e) => e.floor !== key) }));

  return (
    <section className="rounded-xl border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="font-semibold">{t("floors")}</h2>
        <div className="flex items-center gap-3">
          <SaveIndicator status={status} />
          {editable && (
            <Button size="sm" variant="outline" onClick={addFloor}>
              <Plus />
              {t("addFloor")}
            </Button>
          )}
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b text-left">
              <th className="py-1.5 pl-4 font-medium">{t("floor.name")}</th>
              <th className="px-1 text-right font-medium">{t("floor.level")}</th>
              <th className="px-1 text-right font-medium">{t("floor.height")}</th>
              <th className="px-1 text-right font-medium">{t("floor.storeyHeight")}</th>
              <th className="px-1 text-right font-medium">{t("floor.wall")}</th>
              <th className="px-1 text-right font-medium">{t("floor.windowHeight")}</th>
              <th className="px-1 font-medium">{t("floor.plan")}</th>
              <th className="px-1 text-right font-medium">{t("floor.rooms")}</th>
              <th className="px-1 text-right font-medium">{t("floor.area")}</th>
              <th className="w-40 pr-4" />
            </tr>
          </thead>
          <tbody>
            {floors.map(({ floor, plan, roomCount: n, heatedArea }) => (
              <tr key={floor.key} className="border-b last:border-0">
                <td className="w-36 py-1 pl-4 pr-1">
                  <input className={inputCls} value={floor.name} maxLength={60} disabled={!editable} aria-label={t("floor.name")} onChange={(e) => setFloor(floor.key, { name: e.target.value })} />
                </td>
                <td className="w-14 px-1">
                  <NumberField value={floor.level} decimals={0} negative label={t("floor.level")} disabled={!editable} onChange={(v) => setFloor(floor.key, { level: Math.round(v ?? 0) })} />
                </td>
                <td className="w-20 px-1">
                  <NumberField value={floor.height} decimals={2} label={t("floor.height")} disabled={!editable} onChange={(v) => setFloor(floor.key, { height: v })} />
                </td>
                <td className="w-20 px-1">
                  <NumberField value={floor.storeyHeight} decimals={2} label={t("floor.storeyHeight")} disabled={!editable} placeholder={floor.height === null ? "" : fmt(floor.height + 0.3, 2)} onChange={(v) => setFloor(floor.key, { storeyHeight: v })} />
                </td>
                <td className="w-20 px-1">
                  <NumberField value={floor.wallThickness} decimals={2} label={t("floor.wall")} disabled={!editable} onChange={(v) => setFloor(floor.key, { wallThickness: v })} />
                </td>
                <td className="w-20 px-1">
                  <NumberField value={floor.windowHeight} decimals={2} label={t("floor.windowHeight")} disabled={!editable} onChange={(v) => setFloor(floor.key, { windowHeight: v })} />
                </td>
                <td className="px-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {plan ? (
                      <>
                        <span className="text-xs">
                          {plan.name || t("floor.planPage", { page: plan.page })} · {plan.width} × {plan.height} px
                        </span>
                        {plan.scale ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                            <Check className="size-3.5" />
                            {t("floor.calibrated", { scale: fmt(1 / plan.scale, 1) })}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                            <TriangleAlert className="size-3.5" />
                            {t("floor.uncalibrated")}
                          </span>
                        )}
                        {editable && (
                          <>
                            <PlanUploadDialog projectId={projectId} floorKey={floor.key} floorName={floor.name} replace />
                            <ConfirmButton
                              variant="ghost"
                              size="icon-sm"
                              label={t("floor.deletePlan")}
                              trigger={<Trash2 />}
                              title={t("floor.deletePlan")}
                              text={t("floor.deletePlanText", { name: floor.name })}
                              confirmLabel={t("floor.deletePlan")}
                              onConfirm={async () => {
                                const r = await deleteBuildingPlan(plan.id, projectId);
                                if (!r.error) router.refresh();
                                return r;
                              }}
                            />
                          </>
                        )}
                      </>
                    ) : editable ? (
                      <PlanUploadDialog projectId={projectId} floorKey={floor.key} floorName={floor.name} replace={false} />
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("floor.noPlan")}</span>
                    )}
                  </div>
                </td>
                <td className="px-1 text-right tabular-nums">{n}</td>
                <td className="px-1 text-right tabular-nums">{heatedArea === null ? "–" : fmt(heatedArea, 1)}</td>
                <td className="py-1 pr-4">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={`/projekte/${projectId}/gebaeude/plan/${floor.key}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), !plan && "pointer-events-none opacity-50")} aria-disabled={!plan}>
                      <PenLine />
                      {t("draw")}
                    </Link>
                    {editable && (
                      <ConfirmButton
                        variant="ghost"
                        size="icon-sm"
                        label={t("floor.delete")}
                        trigger={<Trash2 />}
                        title={t("floor.delete")}
                        text={t("floor.deleteText", { name: floor.name, rooms: n })}
                        confirmLabel={t("floor.delete")}
                        onConfirm={async () => {
                          if (plan) {
                            const r = await deleteBuildingPlan(plan.id, projectId);
                            if (r.error) return r;
                          }
                          removeFloor(floor.key);
                          router.refresh();
                        }}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {model.floors.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">{t("noFloors")}</p>}
    </section>
  );
}

function ConstructionSelect({ value, catalog, editable, label, onChange, ground = false }: { value: string | null; catalog: Construction[]; editable: boolean; label: string; onChange: (id: string | null) => void; ground?: boolean }) {
  const list = catalog.filter((c) => c.kind === "element" || (ground && c.kind === "ground"));
  return (
    <NativeSelect value={value ?? ""} disabled={!editable} className="h-7 w-full text-xs" aria-label={label} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">–</option>
      {list.map((c) => (
        <option key={c.id} value={c.id}>
          {[c.code, c.name].filter(Boolean).join(" ")}
          {c.value !== null && c.kind !== "ground" ? ` (${fmt(c.value, 3)})` : ""}
        </option>
      ))}
    </NativeSelect>
  );
}

function UnheatedCaseSelect({ value, insulated, editable, onChange }: { value: UnheatedCase; insulated: boolean; editable: boolean; onChange: (c: UnheatedCase, insulated: boolean) => void }) {
  const t = useTranslations("building.unheated");
  return (
    <div className="flex items-center gap-1">
      <NativeSelect value={value} disabled={!editable} className="h-7 text-xs" aria-label={t("case")} onChange={(e) => onChange(e.target.value as UnheatedCase, insulated)}>
        {unheatedCaseKeys.map((k) => (
          <option key={k} value={k}>
            {t(`cases.${k}`)}
          </option>
        ))}
      </NativeSelect>
      <label className="flex items-center gap-1 whitespace-nowrap text-xs" title={t("insulatedHint")}>
        <input type="checkbox" checked={insulated} disabled={!editable} onChange={(e) => onChange(value, e.target.checked)} />
        {t("insulated")}
      </label>
    </div>
  );
}

/** Floors and ceilings per Geschoss: what lies below / above the parts not drawn, their constructions, b cases. */
function SlabsTable({ model, update, editable, catalog }: Shared) {
  const t = useTranslations("building");
  const setFloor = (key: string, patch: Partial<BuildingFloor>) => update((m) => ({ ...m, floors: m.floors.map((f) => (f.key === key ? { ...f, ...patch } : f)) }));
  const floors = [...model.floors].sort((a, b) => b.level - a.level);
  return (
    <Section title={t("slabs.title")} description={t("slabs.description")} collapseKey="building-slabs">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b text-left">
              <th className="py-1.5 font-medium">{t("floor.name")}</th>
              <th className="px-1 font-medium">{t("slabs.floorAgainst")}</th>
              <th className="px-1 font-medium">{t("slabs.floorConstruction")}</th>
              <th className="px-1 font-medium">{t("slabs.ceilingAgainst")}</th>
              <th className="px-1 font-medium">{t("slabs.ceilingConstruction")}</th>
              <th className="px-1 font-medium">{t("slabs.slab")}</th>
              <th className="px-1 font-medium">{t("slabs.partition")}</th>
            </tr>
          </thead>
          <tbody>
            {floors.map((f) => (
              <tr key={f.key} className="border-b align-top last:border-0">
                <td className="w-24 py-1 font-medium">{f.name}</td>
                <td className="w-56 px-1 py-1">
                  <NativeSelect value={f.floorAdjacency} disabled={!editable} className="h-7 w-full text-xs" aria-label={t("slabs.floorAgainst")} onChange={(e) => setFloor(f.key, { floorAdjacency: e.target.value as EnvelopeAdjacency })}>
                    {envelopeAdjacencies.map((a) => (
                      <option key={a} value={a}>
                        {t(`editor.adjacency.${a}`)}
                      </option>
                    ))}
                  </NativeSelect>
                  {f.floorAdjacency === "unheated" && <div className="mt-1"><UnheatedCaseSelect value={f.floorUnheatedCase} insulated={f.floorUnheatedInsulated} editable={editable} onChange={(c, i) => setFloor(f.key, { floorUnheatedCase: c, floorUnheatedInsulated: i })} /></div>}
                </td>
                <td className="w-52 px-1 py-1">
                  <ConstructionSelect value={f.floorConstructionId} catalog={catalog} editable={editable} ground label={t("slabs.floorConstruction")} onChange={(id) => setFloor(f.key, { floorConstructionId: id })} />
                </td>
                <td className="w-56 px-1 py-1">
                  <NativeSelect value={f.ceilingAdjacency} disabled={!editable} className="h-7 w-full text-xs" aria-label={t("slabs.ceilingAgainst")} onChange={(e) => setFloor(f.key, { ceilingAdjacency: e.target.value as EnvelopeAdjacency })}>
                    {envelopeAdjacencies.map((a) => (
                      <option key={a} value={a}>
                        {t(`editor.adjacency.${a}`)}
                      </option>
                    ))}
                  </NativeSelect>
                  {f.ceilingAdjacency === "unheated" && <div className="mt-1"><UnheatedCaseSelect value={f.ceilingUnheatedCase} insulated={f.ceilingUnheatedInsulated} editable={editable} onChange={(c, i) => setFloor(f.key, { ceilingUnheatedCase: c, ceilingUnheatedInsulated: i })} /></div>}
                </td>
                <td className="w-52 px-1 py-1">
                  <ConstructionSelect value={f.ceilingConstructionId} catalog={catalog} editable={editable} label={t("slabs.ceilingConstruction")} onChange={(id) => setFloor(f.key, { ceilingConstructionId: id })} />
                </td>
                <td className="w-48 px-1 py-1">
                  <ConstructionSelect value={f.slabConstructionId} catalog={catalog} editable={editable} label={t("slabs.slab")} onChange={(id) => setFloor(f.key, { slabConstructionId: id })} />
                </td>
                <td className="w-48 px-1 py-1">
                  <ConstructionSelect value={f.partitionConstructionId} catalog={catalog} editable={editable} label={t("slabs.partition")} onChange={(id) => setFloor(f.key, { partitionConstructionId: id })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {catalog.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-400">{t("editor.noCatalog")}</p>}
    </Section>
  );
}

/** SIA 380/1 Nutzungszonen. */
function ZonesSection({ model, update, editable }: Shared) {
  const t = useTranslations("building.zones");
  const setZone = (id: string, patch: Partial<BuildingZone>) => update((m) => ({ ...m, zones: m.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) }));
  const addZone = () => update((m) => ({ ...m, zones: [...m.zones, newZone(crypto.randomUUID(), m.zones.length ? t("defaultName", { n: m.zones.length + 1 }) : t("defaultFirst"))] }));
  const removeZone = (id: string) => update((m) => ({ ...m, zones: m.zones.filter((z) => z.id !== id), rooms: m.rooms.map((r) => (r.zoneId === id ? { ...r, zoneId: null } : r)) }));
  const roomsOf = (id: string) => model.rooms.filter((r) => r.kind === "heated" && (r.zoneId === id || (r.zoneId === null && model.zones.length === 1))).length;

  return (
    <Section
      title={t("title")}
      description={t("description")}
      collapseKey="building-zones"
      actions={
        editable && (
          <Button size="sm" variant="outline" onClick={addZone}>
            <Plus />
            {t("add")}
          </Button>
        )
      }
    >
      {model.zones.length === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">{t("none")}</p>
      ) : (
        <div className="space-y-3">
          {model.zones.map((z) => {
            const usage = usageCategories[z.category];
            return (
              <div key={z.id} className="space-y-2 rounded-lg border p-3">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("name")}</label>
                    <input className={inputCls} value={z.name} maxLength={120} disabled={!editable} onChange={(e) => setZone(z.id, { name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("category")}</label>
                    <NativeSelect value={z.category} disabled={!editable} className="h-7 text-xs" onChange={(e) => setZone(z.id, { category: e.target.value as BuildingZone["category"] })}>
                      {usageCategoryKeys.map((k) => (
                        <option key={k} value={k}>
                          {usageCategories[k].label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("state")}</label>
                    <NativeSelect value={z.state} disabled={!editable} className="h-7 text-xs" onChange={(e) => setZone(z.id, { state: e.target.value as BuildingZone["state"] })}>
                      {buildingStates.map((s) => (
                        <option key={s} value={s}>
                          {t(`states.${s}`)}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("regulation")}</label>
                    <NativeSelect value={z.regulation} disabled={!editable} className="h-7 text-xs" onChange={(e) => setZone(z.id, { regulation: e.target.value as BuildingZone["regulation"] })}>
                      {regulations.map((r) => (
                        <option key={r} value={r}>
                          {t(`regulations.${r}`)}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("construction")}</label>
                    <NativeSelect value={z.construction} disabled={!editable} className="h-7 text-xs" onChange={(e) => setZone(z.id, { construction: e.target.value as BuildingZone["construction"] })}>
                      {constructionModes.map((c) => (
                        <option key={c} value={c}>
                          {t(`constructions.${c}`)}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">θi [°C]</label>
                    <NumberField value={z.thetaInt} decimals={1} label="θi" disabled={!editable} placeholder={usage.thetaInt === null ? "" : fmt(usage.thetaInt, 1)} onChange={(v) => setZone(z.id, { thetaInt: v })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("airflow")}</label>
                    <NumberField value={z.airflowOverride} decimals={2} label={t("airflow")} disabled={!editable} placeholder={usage.airflow === null ? "" : fmt(usage.airflow * (1 - (z.wrgEfficiency ?? 0)), 2)} onChange={(v) => setZone(z.id, { airflowOverride: v })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("wrg")}</label>
                    <NumberField value={z.wrgEfficiency} decimals={2} label={t("wrg")} disabled={!editable} placeholder="0" onChange={(v) => setZone(z.id, { wrgEfficiency: v })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("bridgesPct")}</label>
                    <NumberField value={z.bridgesPct} decimals={0} label={t("bridgesPct")} disabled={!editable} placeholder="0" onChange={(v) => setZone(z.id, { bridgesPct: v })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("floorHeating")}</label>
                    <NumberField value={z.floorHeatingFlow} decimals={0} label={t("floorHeating")} disabled={!editable} placeholder="–" onChange={(v) => setZone(z.id, { floorHeatingFlow: v })} />
                  </div>
                  <div className="flex items-end justify-between gap-2 text-xs text-muted-foreground">
                    <span>{t("roomCount", { count: roomsOf(z.id) })}</span>
                    {editable && (
                      <ConfirmButton variant="ghost" size="icon-sm" label={t("remove")} trigger={<Trash2 />} title={t("remove")} text={t("removeText", { name: z.name })} confirmLabel={t("remove")} onConfirm={async () => removeZone(z.id)} />
                    )}
                  </div>
                </div>
                <BridgesList zone={z} editable={editable} onChange={(bridges) => setZone(z.id, { bridges })} />
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function BridgesList({ zone, editable, onChange }: { zone: BuildingZone; editable: boolean; onChange: (b: BuildingZone["bridges"]) => void }) {
  const t = useTranslations("building.zones");
  const set = (id: string, patch: Partial<BuildingZone["bridges"][number]>) => onChange(zone.bridges.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{t("bridges", { count: zone.bridges.length })}</span>
        {editable && (
          <Button size="sm" variant="ghost" onClick={() => onChange([...zone.bridges, { id: crypto.randomUUID(), name: "", psi: null, length: null, b: null }])}>
            <Plus />
            {t("addBridge")}
          </Button>
        )}
      </div>
      {zone.bridges.map((b) => (
        <div key={b.id} className="grid grid-cols-[1fr_5rem_5rem_4rem_auto] items-center gap-1">
          <input className={inputCls} value={b.name} maxLength={120} placeholder={t("bridgeName")} disabled={!editable} onChange={(e) => set(b.id, { name: e.target.value })} />
          <NumberField value={b.psi} decimals={3} label="ψ" disabled={!editable} placeholder="ψ W/mK" onChange={(v) => set(b.id, { psi: v })} />
          <NumberField value={b.length} decimals={2} label="l" disabled={!editable} placeholder="l m" onChange={(v) => set(b.id, { length: v })} />
          <NumberField value={b.b} decimals={2} label="b" disabled={!editable} placeholder="b 1" onChange={(v) => set(b.id, { b: v })} />
          {editable && (
            <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={t("removeBridge")} title={t("removeBridge")} onClick={() => onChange(zone.bridges.filter((x) => x.id !== b.id))}>
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function ClimateSection({ model, update, editable }: Shared) {
  const t = useTranslations("building.climate");
  const stations = climateSets[model.climate.set] as readonly ClimateStationData[];
  const station = stations.find((s) => s.name === model.climate.station) ?? null;
  return (
    <Section title={t("title")} description={t("description")} collapseKey="building-climate">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t("set")}</label>
          <NativeSelect value={model.climate.set} disabled={!editable} className="h-8" onChange={(e) => update((m) => ({ ...m, climate: { set: e.target.value as ClimateSetKey, station: null } }))}>
            {climateSetKeys.map((k) => (
              <option key={k} value={k}>
                {t(`sets.${k}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t("station")}</label>
          <NativeSelect value={model.climate.station ?? ""} disabled={!editable} className="h-8" onChange={(e) => update((m) => ({ ...m, climate: { ...m.climate, station: e.target.value || null } }))}>
            <option value="">–</option>
            {stations.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1 text-sm">
          <span className="text-xs text-muted-foreground">{t("facts")}</span>
          <p className="tabular-nums">{station ? `${fmt(station.altitude, 0)} m ü. M. · θe,avg ${fmt(station.thetaMean, 1)} °C · θe,design ${fmt(station.thetaDesign, 0)} °C` : "–"}</p>
        </div>
      </div>
      {model.climate.set === "sia4028" && <p className="text-xs text-amber-700 dark:text-amber-400">{t("draftHint")}</p>}
    </Section>
  );
}
