"use client";

import { FileText, ListPlus, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/confirm-button";
import type { FormMessageKey } from "@/components/form";
import { NativeSelect } from "@/components/form";
import { fmt, NumberField, Result, Section } from "@/components/planning/fields";
import { NumberParam, OptionField, Toggle } from "@/components/planning/plan-ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { evaluateFloor, type FloorDistributor, type FloorRoom, floorPipes, floorSpacings, type FloorSystemData, insulationThicknesses, type LinkedRoom } from "@/lib/heating/floor";
import { cn } from "@/lib/utils";

import { deleteHeatingSystem, saveHeatingSystem } from "../../actions";

const newId = () => crypto.randomUUID();

export type CalcRooms = { id: string; name: string; rooms: { id: string; label: string; linked: LinkedRoom }[] };

const manualRoom = (): FloorRoom => ({
  id: newId(),
  calcId: null,
  roomId: null,
  name: "",
  load: null,
  area: null,
  roomTemp: 20,
  covering: 0.1,
  edgeArea: null,
  gain: null,
  belowTemp: null,
  supplyLength: null,
  rings: null,
  spacingOverride: null,
  bath: false,
});

export function FloorEditor({
  id,
  projectId,
  initialName,
  initialData,
  calcs,
  editable,
}: {
  id: string;
  projectId: string;
  initialName: string;
  initialData: FloorSystemData;
  /** Heat load calculations with their heated rooms (Qh without floor loss). */
  calcs: CalcRooms[];
  editable: boolean;
}) {
  const t = useTranslations("floorHeating");
  const tForms = useTranslations("forms");
  const [name, setName] = useState(initialName);
  const [data, setData] = useState(initialData);
  const [saved, setSaved] = useState({ name: initialName, data: initialData });
  const [pending, startTransition] = useTransition();
  const dirty = name !== saved.name || data !== saved.data;
  const lookup = useMemo(() => {
    const map = new Map(calcs.flatMap((c) => c.rooms.map((r) => [`${c.id}:${r.id}`, r.linked] as const)));
    return (room: FloorRoom) => (room.calcId && room.roomId ? (map.get(`${room.calcId}:${room.roomId}`) ?? null) : null);
  }, [calcs]);
  const result = useMemo(() => evaluateFloor(data, lookup), [data, lookup]);
  const set = <K extends keyof FloorSystemData>(key: K, value: FloorSystemData[K]) => setData((d) => ({ ...d, [key]: value }));
  const setDistributor = (distId: string, patch: Partial<FloorDistributor>) => set("distributors", data.distributors.map((d) => (d.id === distId ? { ...d, ...patch } : d)));
  const used = new Set(data.distributors.flatMap((d) => d.rooms.map((r) => `${r.calcId}:${r.roomId}`)));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = () =>
    startTransition(async () => {
      const response = await saveHeatingSystem(id, projectId, name, data);
      if (response.error) toast.error(tForms(response.error as FormMessageKey));
      else {
        setSaved({ name, data });
        toast.success(tForms("saved"));
      }
    });

  const addLinked = (dist: FloorDistributor, calcId: string) => {
    const calc = calcs.find((c) => c.id === calcId);
    if (!calc) return;
    const rooms = calc.rooms
      .filter((r) => !used.has(`${calc.id}:${r.id}`))
      .map((r) => ({ ...manualRoom(), calcId: calc.id, roomId: r.id, roomTemp: null, bath: /bad|dusche|wc|douche|bagno|doccia/i.test(r.label) }));
    setDistributor(dist.id, { rooms: [...dist.rooms, ...rooms] });
  };
  const linkedCalcs = calcs.filter((c) => data.calcIds.includes(c.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-md space-y-1">
          <label htmlFor="fh-name" className="text-xs text-muted-foreground">
            {t("name")}
          </label>
          <Input id="fh-name" value={name} maxLength={200} disabled={!editable} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/pdf/floor-heating/${id}`}
            target="_blank"
            rel="noopener"
            className={buttonVariants({ variant: "outline" })}
            onClick={(e) => {
              if (dirty) {
                e.preventDefault();
                toast.error(t("saveFirst"));
              }
            }}
          >
            <FileText />
            {t("pdf")}
          </a>
          {editable && (
            <>
              <ConfirmButton
                variant="outline"
                label={t("delete")}
                trigger={<Trash2 />}
                title={t("deleteTitle")}
                text={t("deleteText", { name })}
                confirmLabel={t("delete")}
                onConfirm={() => deleteHeatingSystem(id, projectId)}
              />
              <Button onClick={save} disabled={!dirty || pending || !name.trim()}>
                <Save />
                {dirty ? t("save") : t("saved")}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Result label={t("result.flowReturn")} value={result.flow === null ? "" : `${fmt(result.flow, 0)} / ${fmt(result.ret, 0)}`} unit="°C" />
        <Result label={t("result.mean")} value={fmt(result.mean, 1)} unit="°C" hint={result.decisiveRoomId ? t("result.decisive", { room: findRoomName(data, result, result.decisiveRoomId) }) : undefined} />
        <Result label={t("result.total")} value={fmt(result.total)} unit="W" tone="ok" />
        <Result label={t("result.massFlow")} value={fmt(result.massFlow, 0)} unit="kg/h" />
        <Result label={t("result.downward")} value={fmt(result.downward)} unit="W" hint={t("result.downwardHint")} />
        <Result label={t("result.rings")} value={fmt(result.distributors.reduce((s, d) => s + d.rings, 0))} />
      </div>

      <Section title={t("settings")} description={t("settingsHint")}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <NumberParam label={t("spread")} value={data.spread} decimals={1} editable={editable} onChange={(v) => set("spread", v ?? 10)} />
          <OptionField label={t("designSpacing")} value={String(data.designSpacing)} options={floorSpacings.map(String)} optionLabel={(v) => `${v} cm`} editable={editable} onChange={(v) => set("designSpacing", Number(v))} hint={t("designSpacingHint")} />
          <NumberParam label={t("flowOverride")} value={data.flowOverride} decimals={0} editable={editable} onChange={(v) => set("flowOverride", v)} hint={t("flowOverrideHint")} />
          <OptionField label={t("pipe")} value={data.pipe} options={floorPipes} optionLabel={(v) => v} editable={editable} onChange={(v) => set("pipe", v)} />
          <OptionField label={t("insulation")} value={String(data.insulation)} options={insulationThicknesses.map(String)} optionLabel={(v) => `${v} mm (λ 0.04)`} editable={editable} onChange={(v) => set("insulation", Number(v))} hint={t("insulationHint")} />
          <NumberParam label={t("maxRingLength")} value={data.maxRingLength} editable={editable} onChange={(v) => set("maxRingLength", v ?? 120)} hint={t("maxRingLengthHint")} />
          <NumberParam label={t("valveLoss")} value={data.valveLoss} editable={editable} onChange={(v) => set("valveLoss", v)} hint={t("valveLossHint")} />
        </div>
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-sm font-medium">{t("calcs")}</legend>
          {calcs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noCalcs")}</p>
          ) : (
            calcs.map((c) => (
              <Toggle
                key={c.id}
                label={`${c.name} (${t("roomsCount", { count: c.rooms.length })})`}
                checked={data.calcIds.includes(c.id)}
                editable={editable}
                onChange={(on) => set("calcIds", on ? [...data.calcIds, c.id] : data.calcIds.filter((x) => x !== c.id))}
              />
            ))
          )}
        </fieldset>
      </Section>

      {data.distributors.map((dist, di) => {
        const dr = result.distributors[di];
        return (
          <section key={dist.id} className="rounded-xl border">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
              <div className="flex items-center gap-2">
                <input
                  className="h-8 w-40 rounded border border-input bg-transparent px-2 font-semibold"
                  value={dist.name}
                  maxLength={80}
                  disabled={!editable}
                  aria-label={t("distributor")}
                  onChange={(e) => setDistributor(dist.id, { name: e.target.value })}
                />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t("distributorSummary", { rings: fmt(dr.rings), total: fmt(dr.total), massFlow: fmt(dr.massFlow, 0), pressure: fmt(dr.maxPressure / 1000, 1) })}
                </span>
              </div>
              {editable && (
                <div className="flex flex-wrap items-center gap-2">
                  {linkedCalcs.length > 0 && (
                    <NativeSelect
                      value=""
                      className="h-8 w-56 text-xs"
                      aria-label={t("addFromCalc")}
                      onChange={(e) => {
                        if (e.target.value) addLinked(dist, e.target.value);
                      }}
                    >
                      <option value="">{t("addFromCalc")}</option>
                      {linkedCalcs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setDistributor(dist.id, { rooms: [...dist.rooms, manualRoom()] })}>
                    <Plus />
                    {t("addRoom")}
                  </Button>
                  {data.distributors.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => set("distributors", data.distributors.filter((d) => d.id !== dist.id))} aria-label={t("removeDistributor")} title={t("removeDistributor")}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
              )}
            </header>
            {dist.rooms.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">{t("noRooms")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1500px] text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b text-left">
                      <th className="px-2 py-1.5 font-medium">{t("col.room")}</th>
                      <th className="px-1 text-right font-medium">Qh [W]</th>
                      <th className="px-1 text-right font-medium">A [m²]</th>
                      <th className="px-1 text-right font-medium">θ [°C]</th>
                      <th className="px-1 text-right font-medium" title={t("col.coveringHint")}>
                        Rλ
                      </th>
                      <th className="px-1 text-right font-medium">A_R [m²]</th>
                      <th className="px-1 text-right font-medium">Q_D [W]</th>
                      <th className="px-1 text-right font-medium">tu [°C]</th>
                      <th className="px-1 text-right font-medium">L2 [m]</th>
                      <th className="px-1 text-right font-medium">{t("col.rings")}</th>
                      <th className="px-1 font-medium">{t("col.spacing")}</th>
                      <th className="px-1 font-medium">{t("col.bath")}</th>
                      <th className="px-1 text-right font-medium">q_h</th>
                      <th className="px-1 text-right font-medium">Δθ</th>
                      <th className="px-1 text-right font-medium">q_A</th>
                      <th className="px-1 text-right font-medium">s [cm]</th>
                      <th className="px-1 text-right font-medium">q_eff</th>
                      <th className="px-1 text-right font-medium">Q_Boden</th>
                      <th className="px-1 text-right font-medium">Q_tot [W]</th>
                      <th className="px-1 text-right font-medium">m [kg/h]</th>
                      <th className="px-1 text-right font-medium">L [m]</th>
                      <th className="px-1 text-right font-medium">R [Pa/m]</th>
                      <th className="px-1 text-right font-medium">Δp [kPa]</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {dist.rooms.map((room, ri) => {
                      const r = dr.rooms[ri];
                      const link = lookup(room);
                      const setRoom = (patch: Partial<FloorRoom>) => setDistributor(dist.id, { rooms: dist.rooms.map((x) => (x.id === room.id ? { ...x, ...patch } : x)) });
                      const field = (key: "load" | "area" | "roomTemp" | "covering" | "edgeArea" | "gain" | "belowTemp" | "supplyLength", decimals: number, placeholder?: number | null, negative = false) => (
                        <NumberField value={room[key]} decimals={decimals} label={key} disabled={!editable} negative={negative} placeholder={placeholder === null || placeholder === undefined ? undefined : fmt(placeholder, decimals)} onChange={(v) => setRoom({ [key]: v })} className="w-14" />
                      );
                      return (
                        <tr key={room.id} className={cn("border-b last:border-0", result.decisiveRoomId === room.id && "bg-brand/5")}>
                          <td className="px-2 py-0.5">
                            <input
                              className="h-7 w-40 rounded border border-input bg-transparent px-1.5"
                              value={room.name}
                              placeholder={link?.name ?? ""}
                              maxLength={120}
                              disabled={!editable}
                              aria-label={t("col.room")}
                              onChange={(e) => setRoom({ name: e.target.value })}
                            />
                          </td>
                          <td className="px-1">{field("load", 0, link?.load)}</td>
                          <td className="px-1">{field("area", 1, link?.area)}</td>
                          <td className="px-1">{field("roomTemp", 1, link?.roomTemp)}</td>
                          <td className="px-1">{field("covering", 3)}</td>
                          <td className="px-1">{field("edgeArea", 1)}</td>
                          <td className="px-1">{field("gain", 0)}</td>
                          <td className="px-1">{field("belowTemp", 1, link?.belowTemp, true)}</td>
                          <td className="px-1">{field("supplyLength", 1)}</td>
                          <td className="px-1">
                            <NumberField value={room.rings} decimals={0} label={t("col.rings")} disabled={!editable} placeholder={fmt(r.rings)} onChange={(v) => setRoom({ rings: v === null ? null : Math.max(Math.round(v), 1) })} className="w-10" />
                          </td>
                          <td className="px-1">
                            <NativeSelect value={room.spacingOverride === null ? "" : String(room.spacingOverride)} disabled={!editable} className="h-7 w-16 text-xs" aria-label={t("col.spacing")} onChange={(e) => setRoom({ spacingOverride: e.target.value ? Number(e.target.value) : null })}>
                              <option value="">{t("auto")}</option>
                              {floorSpacings.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </NativeSelect>
                          </td>
                          <td className="px-1 text-center">
                            <input type="checkbox" checked={room.bath} disabled={!editable} aria-label={t("col.bath")} onChange={(e) => setRoom({ bath: e.target.checked })} />
                          </td>
                          <td className="px-1 text-right tabular-nums">{fmt(r.specific, 1)}</td>
                          <td className="px-1 text-right tabular-nums">{fmt(r.dTheta, 1)}</td>
                          <td className="px-1 text-right tabular-nums">{fmt(r.innerSpecific, 1)}</td>
                          <td className="px-1 text-right font-medium tabular-nums">{fmt(r.spacing, 1)}</td>
                          <td className="px-1 text-right tabular-nums">{fmt(r.installed, 1)}</td>
                          <td className="px-1 text-right tabular-nums">{fmt(r.downward)}</td>
                          <td className="px-1 text-right font-medium tabular-nums">{fmt(r.total)}</td>
                          <td className="px-1 text-right tabular-nums">{fmt(r.massFlow, 1)}</td>
                          <td className="px-1 text-right tabular-nums" title={t("col.lengthHint", { room: fmt(r.roomPipe, 1), ring: fmt(r.ringLength, 1) })}>
                            {fmt(r.pipeLength, 1)}
                          </td>
                          <td className="px-1 text-right tabular-nums">{fmt(r.gradient, 0)}</td>
                          <td className="px-1 text-right tabular-nums">
                            {r.warnings.length ? (
                              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400" title={r.warnings.map((w) => t(`warnings.${w}`)).join("\n")}>
                                <TriangleAlert className="size-3.5" />
                                {fmt(r.pressure / 1000, 1)}
                              </span>
                            ) : (
                              fmt(r.pressure / 1000, 1)
                            )}
                          </td>
                          <td className="pr-1 text-right">
                            {editable && (
                              <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={t("removeRoom")} title={t("removeRoom")} onClick={() => setDistributor(dist.id, { rooms: dist.rooms.filter((x) => x.id !== room.id) })}>
                                <Trash2 className="size-3.5" />
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
          </section>
        );
      })}
      {editable && (
        <Button variant="outline" onClick={() => set("distributors", [...data.distributors, { id: newId(), name: `V${data.distributors.length + 1}`, rooms: [] }])}>
          <ListPlus />
          {t("addDistributor")}
        </Button>
      )}

      <Section title={t("notes")}>
        <textarea
          className="min-h-24 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm outline-none focus:border-ring"
          value={data.notes}
          maxLength={20000}
          disabled={!editable}
          aria-label={t("notes")}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Section>
      <p className="text-xs text-muted-foreground">{t("sourceHint")}</p>
    </div>
  );
}

function findRoomName(data: FloorSystemData, result: ReturnType<typeof evaluateFloor>, roomId: string) {
  for (const [i, d] of data.distributors.entries()) {
    const k = d.rooms.findIndex((r) => r.id === roomId);
    if (k >= 0) return result.distributors[i].rooms[k].name || "–";
  }
  return "–";
}
