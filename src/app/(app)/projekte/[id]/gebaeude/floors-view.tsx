"use client";

import { Check, PenLine, Plus, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { ConfirmButton } from "@/components/confirm-button";
import { fmt, NumberField, Result } from "@/components/planning/fields";
import { SaveIndicator } from "@/components/planning/plan-ui";
import { usePlan } from "@/components/planning/use-plan";
import { Button, buttonVariants } from "@/components/ui/button";
import { summarizeFloors } from "@/lib/building/model";
import type { BuildingFloor, BuildingModel, PlanInfo } from "@/lib/building/schema";
import { cn } from "@/lib/utils";

import { deleteBuildingPlan, saveBuildingModel } from "./actions";
import { PlanUploadDialog } from "./plan-upload";

const inputCls = "h-7 w-full rounded border border-input bg-field px-1.5 outline-none focus:border-ring disabled:opacity-60";

/** Geschosse of the Gebäudemodell with their plans and room totals; autosaved. */
export function FloorsView({ projectId, initial, plans, editable }: { projectId: string; initial: BuildingModel; plans: PlanInfo[]; editable: boolean }) {
  const t = useTranslations("building");
  const router = useRouter();
  const { plan: model, update, status } = usePlan(projectId, initial, editable, saveBuildingModel);
  const floors = summarizeFloors(model, plans);
  const setFloor = (key: string, patch: Partial<BuildingFloor>) => update((m) => ({ ...m, floors: m.floors.map((f) => (f.key === key ? { ...f, ...patch } : f)) }));

  const addFloor = () => {
    const top = model.floors.reduce((max, f) => Math.max(max, f.level), -1);
    const level = top + 1;
    const key = `f${Date.now().toString(36)}`;
    const name = level === 0 ? "EG" : level < 0 ? `${-level}. UG` : `${level}. OG`;
    update((m) => ({ ...m, floors: [...m.floors, { key, name, level, height: 2.5, wallThickness: 0.5 }] }));
  };
  const removeFloor = (key: string) => update((m) => ({ ...m, floors: m.floors.filter((f) => f.key !== key), rooms: m.rooms.filter((r) => r.floor !== key) }));

  const totalArea = floors.every((f) => f.heatedArea !== null) ? floors.reduce((s, f) => s + (f.heatedArea ?? 0), 0) : null;
  const roomCount = floors.reduce((s, f) => s + f.roomCount, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Result label={t("summary.floors")} value={String(model.floors.length)} />
        <Result label={t("summary.rooms")} value={String(roomCount)} />
        <Result label={t("summary.heatedArea")} value={totalArea === null ? "–" : fmt(totalArea, 1)} unit="m²" hint={totalArea === null && roomCount ? t("summary.uncalibrated") : undefined} />
      </div>

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
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b text-left">
                <th className="py-1.5 pl-4 font-medium">{t("floor.name")}</th>
                <th className="px-1 text-right font-medium">{t("floor.level")}</th>
                <th className="px-1 text-right font-medium">{t("floor.height")}</th>
                <th className="px-1 text-right font-medium">{t("floor.wall")}</th>
                <th className="px-1 font-medium">{t("floor.plan")}</th>
                <th className="px-1 text-right font-medium">{t("floor.rooms")}</th>
                <th className="px-1 text-right font-medium">{t("floor.area")}</th>
                <th className="w-40 pr-4" />
              </tr>
            </thead>
            <tbody>
              {floors.map(({ floor, plan, roomCount: n, heatedArea }) => (
                <tr key={floor.key} className="border-b last:border-0">
                  <td className="w-40 py-1 pl-4 pr-1">
                    <input className={inputCls} value={floor.name} maxLength={60} disabled={!editable} aria-label={t("floor.name")} onChange={(e) => setFloor(floor.key, { name: e.target.value })} />
                  </td>
                  <td className="w-16 px-1">
                    <NumberField value={floor.level} decimals={0} negative label={t("floor.level")} disabled={!editable} onChange={(v) => setFloor(floor.key, { level: Math.round(v ?? 0) })} />
                  </td>
                  <td className="w-20 px-1">
                    <NumberField value={floor.height} decimals={2} label={t("floor.height")} disabled={!editable} onChange={(v) => setFloor(floor.key, { height: v })} />
                  </td>
                  <td className="w-20 px-1">
                    <NumberField value={floor.wallThickness} decimals={2} label={t("floor.wall")} disabled={!editable} onChange={(v) => setFloor(floor.key, { wallThickness: v })} />
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
