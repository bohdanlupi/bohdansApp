"use client";

import { Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import type { FormMessageKey } from "@/components/form";
import { NativeSelect } from "@/components/form";
import { fmt, NumberField, Result, Section } from "@/components/planning/fields";
import { OptionField } from "@/components/planning/plan-ui";
import { Button } from "@/components/ui/button";
import type { CalcOption } from "@/lib/heating/distribution-inputs";
import { drainCocks, radiatorSeries, thermostatHeads, ventValves } from "@/lib/heating/radiator-data";
import {
  evaluateRadiators,
  findModel,
  modelText,
  newRadiator,
  newRadiatorRoom,
  NO_HEAD,
  pipeSources,
  type Radiator,
  radiatorConnections,
  type RadiatorGroup,
  type RadiatorPlan,
  type RadiatorResult,
  type RadiatorRoom,
  valveDns,
  valveForms,
  valveSeries,
} from "@/lib/heating/radiators";
import { cn } from "@/lib/utils";

import { saveHeatingRadiators } from "../../actions";

const UNASSIGNED = "";

/** Model choice: series, then the model (grouped by columns / type). «value» null = the default model. */
function ModelPicker({ value, fallback, editable, label, onChange, compact }: { value: string | null; fallback?: string; editable: boolean; label: string; onChange: (code: string | null) => void; compact?: boolean }) {
  const t = useTranslations("radiators");
  const current = findModel(value ?? fallback);
  const [seriesKey, setSeriesKey] = useState(current?.series.key ?? radiatorSeries[0].key);
  const series = radiatorSeries.find((s) => s.key === seriesKey) ?? radiatorSeries[0];
  const groups = useMemo(() => {
    const map = new Map<string, typeof series.models>();
    for (const m of series.models) {
      const g = m.type ?? (m.columns ? t("columns", { n: m.columns }) : "");
      map.set(g, [...(map.get(g) ?? []), m]);
    }
    return [...map.entries()];
  }, [series, t]);
  const optionText = (m: (typeof series.models)[number]) => [m.code, `H ${fmt(m.height)}`, m.depth ? `T ${fmt(m.depth)}` : ""].filter(Boolean).join(" · ");
  return (
    <div className={cn("flex gap-1", compact ? "flex-row" : "flex-col sm:flex-row")}>
      <NativeSelect value={seriesKey} disabled={!editable} className={cn("h-7 text-xs", compact ? "w-28" : "w-48")} aria-label={t("series")} onChange={(e) => setSeriesKey(e.target.value as typeof seriesKey)}>
        {radiatorSeries.map((s) => (
          <option key={s.key} value={s.key}>
            {s.name.replace(/^Zehnder /, "")}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        value={value ?? ""}
        disabled={!editable}
        className={cn("h-7 text-xs", compact ? "w-44" : "w-60")}
        aria-label={label}
        onChange={(e) => onChange(e.target.value || null)}
      >
        {fallback !== undefined && <option value="">{t("standard", { value: modelText(findModel(fallback)) })}</option>}
        {groups.map(([g, models]) => (
          <optgroup key={g} label={g}>
            {models.map((m) => (
              <option key={m.code} value={m.code}>
                {optionText(m)}
              </option>
            ))}
          </optgroup>
        ))}
      </NativeSelect>
    </div>
  );
}

/** Select with «Standard (…)» for null and the options. */
function MaybeSelect<T extends string>({ value, options, optionLabel, fallback, label, editable, onChange, className }: { value: T | null; options: readonly T[]; optionLabel: (v: T) => string; fallback: string; label: string; editable: boolean; onChange: (v: T | null) => void; className?: string }) {
  return (
    <NativeSelect value={value ?? ""} disabled={!editable} className={cn("h-7 text-xs", className)} aria-label={label} onChange={(e) => onChange((e.target.value || null) as T | null)}>
      <option value="">{fallback}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {optionLabel(o)}
        </option>
      ))}
    </NativeSelect>
  );
}

export function RadiatorEditor({
  projectId,
  plant,
  initialData,
  calcs,
  editable,
}: {
  projectId: string;
  plant: { id: string; name: string; groups: (RadiatorGroup & { emitter: string | null })[] };
  initialData: RadiatorPlan;
  /** Heat load calculations with their heated rooms. */
  calcs: CalcOption[];
  editable: boolean;
}) {
  const t = useTranslations("radiators");
  const tForms = useTranslations("forms");
  const [data, setData] = useState(initialData);
  const [saved, setSaved] = useState(initialData);
  const [pending, startTransition] = useTransition();
  const dirty = data !== saved;
  const d = data.defaults;

  const lookup = useMemo(() => {
    const map = new Map(calcs.flatMap((c) => c.rooms.map((r) => [`${c.id}:${r.id}`, { name: r.label, floor: r.floor, load: r.load, roomTemp: r.roomTemp }] as const)));
    return (calcId: string, roomId: string) => map.get(`${calcId}:${roomId}`) ?? null;
  }, [calcs]);
  const result = useMemo(() => evaluateRadiators(data, plant.groups, lookup), [data, plant.groups, lookup]);
  const used = new Set(data.rooms.map((r) => `${r.calcId}:${r.roomId}`));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = () =>
    startTransition(async () => {
      const response = await saveHeatingRadiators(plant.id, projectId, data);
      if (response.error) toast.error(tForms(response.error as FormMessageKey));
      else {
        setSaved(data);
        toast.success(tForms("saved"));
      }
    });

  const setDefaults = (patch: Partial<RadiatorPlan["defaults"]>) => setData((x) => ({ ...x, defaults: { ...x.defaults, ...patch } }));
  const setRooms = (fn: (rooms: RadiatorRoom[]) => RadiatorRoom[]) => setData((x) => ({ ...x, rooms: fn(x.rooms) }));
  const setRoom = (id: string, patch: Partial<RadiatorRoom>) => setRooms((rooms) => rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const setRadiator = (room: RadiatorRoom, id: string, patch: Partial<Radiator>) => setRoom(room.id, { radiators: room.radiators.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const addFromCalc = (groupId: string | null, calcId: string) => {
    const calc = calcs.find((c) => c.id === calcId);
    if (!calc) return;
    const rooms = calc.rooms.filter((r) => !used.has(`${calc.id}:${r.id}`)).map((r) => newRadiatorRoom({ calcId: calc.id, roomId: r.id, groupId, name: r.label, floor: r.floor }));
    setRooms((list) => [...list, ...rooms]);
  };

  // Sections: the Heizgruppen of the Anlage, then rooms without a (valid) group.
  const groupIds = new Set(plant.groups.map((g) => g.id));
  const sections = [
    ...plant.groups.map((g) => ({ id: g.id, group: g as RadiatorGroup | null, rooms: data.rooms.filter((r) => r.groupId === g.id) })),
    { id: UNASSIGNED, group: null, rooms: data.rooms.filter((r) => !r.groupId || !groupIds.has(r.groupId)) },
  ].filter((s) => s.group || s.rooms.length);

  const totals = result.radiators.reduce((a, r) => ({ load: a.load + r.load, output: a.output + r.output, massFlow: a.massFlow + r.massFlow }), { load: 0, output: 0, massFlow: 0 });
  const formLabel = (f: string) => t(`forms.${f as (typeof valveForms)[number]}`);
  const headLabel = (n: string) => (n === NO_HEAD ? t("noHead") : (thermostatHeads.find((h) => h.number === n)?.text.replace(/^Oventrop /, "") ?? n));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
        {editable && (
          <Button onClick={save} disabled={!dirty || pending}>
            <Save />
            {dirty ? t("save") : t("saved")}
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Result label={t("result.count")} value={fmt(result.radiators.length)} />
        <Result label={t("result.load")} value={fmt(totals.load)} unit="W" />
        <Result label={t("result.output")} value={fmt(totals.output)} unit="W" tone={totals.output + 1 >= totals.load ? "ok" : "warn"} />
        <Result label={t("result.massFlow")} value={fmt(totals.massFlow, 0)} unit="kg/h" />
      </div>

      <Section title={t("defaults")} description={t("defaultsHint")} collapseKey="radiator-defaults">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">{t("model")}</span>
            <ModelPicker value={d.model} editable={editable} label={t("model")} onChange={(v) => v && setDefaults({ model: v })} />
          </div>
          <OptionField label={t("connection")} value={d.connection} options={radiatorConnections} optionLabel={(v) => t(`connections.${v}`)} editable={editable} onChange={(v) => setDefaults({ connection: v })} />
          <OptionField label={t("side")} value={d.side} options={["left", "right"] as const} optionLabel={(v) => t(`sides.${v}`)} editable={editable} onChange={(v) => setDefaults({ side: v })} />
          <OptionField label={t("pipeFrom")} value={d.pipeFrom} options={pipeSources} optionLabel={(v) => t(`pipeSources.${v}`)} editable={editable} onChange={(v) => setDefaults({ pipeFrom: v })} />
          <OptionField label={t("valveSeries")} value={d.valveSeries} options={valveSeries} optionLabel={(v) => t(`valveSeriesNames.${v}`)} editable={editable} onChange={(v) => setDefaults({ valveSeries: v })} />
          <OptionField label={t("dn")} value={String(d.dn)} options={valveDns.map(String)} optionLabel={(v) => `DN ${v}`} editable={editable} onChange={(v) => setDefaults({ dn: Number(v) as RadiatorPlan["defaults"]["dn"] })} />
          <OptionField label={t("head")} value={d.head} options={[...thermostatHeads.map((h) => h.number), NO_HEAD]} optionLabel={headLabel} editable={editable} onChange={(v) => setDefaults({ head: v })} />
          <OptionField label={t("drain")} value={d.drain} options={["return", "separate"] as const} optionLabel={(v) => t(`drains.${v}`)} editable={editable} onChange={(v) => setDefaults({ drain: v })} />
          <OptionField label={t("vent")} value={d.vent} options={ventValves.map((v) => v.number)} optionLabel={(n) => ventValves.find((v) => v.number === n)?.text ?? n} editable={editable} onChange={(v) => setDefaults({ vent: v })} />
          <OptionField label={t("drainCock")} value={d.drainCock} options={drainCocks.map((v) => v.number)} optionLabel={(n) => drainCocks.find((v) => v.number === n)?.text ?? n} editable={editable} onChange={(v) => setDefaults({ drainCock: v })} />
        </div>
        <p className="text-xs text-muted-foreground">{t("formsHint")}</p>
      </Section>

      {sections.map((s) => {
        const list = result.radiators.filter((r) => s.rooms.some((room) => room.id === r.roomId));
        const sum = list.reduce((a, r) => ({ load: a.load + r.load, output: a.output + r.output, massFlow: a.massFlow + r.massFlow }), { load: 0, output: 0, massFlow: 0 });
        return (
          <section key={s.id || "unassigned"} className="rounded-xl border">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-semibold">{s.group ? s.group.name : t("unassigned")}</h2>
                {s.group && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {s.group.supplyTemp !== null && s.group.returnTemp !== null ? t("groupTemps", { supply: fmt(s.group.supplyTemp), ret: fmt(s.group.returnTemp) }) : t("noTemps")}
                  </span>
                )}
                <span className="text-xs text-muted-foreground tabular-nums">{t("groupSummary", { count: list.length, load: fmt(sum.load), output: fmt(sum.output), massFlow: fmt(sum.massFlow, 0) })}</span>
              </div>
              {editable && s.group && (
                <div className="flex flex-wrap items-center gap-2">
                  {calcs.length > 0 && (
                    <NativeSelect value="" className="h-8 w-56 text-xs" aria-label={t("addFromCalc")} onChange={(e) => e.target.value && addFromCalc(s.group!.id, e.target.value)}>
                      <option value="">{t("addFromCalc")}</option>
                      {calcs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {t("calcOption", { name: c.name, count: c.rooms.filter((r) => !used.has(`${c.id}:${r.id}`)).length })}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setRooms((rooms) => [...rooms, newRadiatorRoom({ groupId: s.group!.id })])}>
                    <Plus />
                    {t("addRoom")}
                  </Button>
                </div>
              )}
            </header>
            {s.rooms.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">{t("noRooms")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1600px] text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b text-left">
                      <th className="px-2 py-1.5 font-medium">{t("col.room")}</th>
                      <th className="px-1 text-right font-medium">Qh [W]</th>
                      <th className="px-1 text-right font-medium">θi [°C]</th>
                      <th className="px-1 text-right font-medium">{t("col.share")}</th>
                      <th className="px-1 font-medium">{t("col.model")}</th>
                      <th className="px-1 text-right font-medium">{t("col.size")}</th>
                      <th className="px-1 text-right font-medium">L [mm]</th>
                      <th className="px-1 text-right font-medium">Φ [W]</th>
                      <th className="px-1 text-right font-medium">{t("col.coverage")}</th>
                      <th className="px-1 font-medium">{t("col.connection")}</th>
                      <th className="px-1 font-medium">{t("col.side")}</th>
                      <th className="px-1 font-medium">{t("col.pipeFrom")}</th>
                      <th className="px-1 font-medium">{t("col.vlForm")}</th>
                      <th className="px-1 font-medium">{t("col.rlForm")}</th>
                      <th className="px-1 font-medium">{t("col.drain")}</th>
                      <th className="px-1 font-medium" title={t("col.factorHint")}>
                        f
                      </th>
                      <th className="px-1 text-center font-medium">{t("col.vent")}</th>
                      <th className="px-1 text-right font-medium">m [kg/h]</th>
                      <th className="w-14" />
                    </tr>
                  </thead>
                  <tbody>
                    {s.rooms.map((room) => {
                      const link = room.calcId && room.roomId ? lookup(room.calcId, room.roomId) : null;
                      return (
                        <RoomRows
                          key={room.id}
                          room={room}
                          link={link}
                          results={room.radiators.map((r) => result.byId.get(r.id)!)}
                          groups={plant.groups}
                          editable={editable}
                          formLabel={formLabel}
                          setRoom={(patch) => setRoom(room.id, patch)}
                          setRadiator={(id, patch) => setRadiator(room, id, patch)}
                          removeRoom={() => setRooms((rooms) => rooms.filter((r) => r.id !== room.id))}
                          defaults={d}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      <Section title={t("notes")}>
        <textarea
          className="min-h-24 w-full rounded-md border border-input bg-field px-2 py-1.5 text-sm outline-none focus:border-ring"
          value={data.notes}
          maxLength={20000}
          disabled={!editable}
          aria-label={t("notes")}
          onChange={(e) => setData((x) => ({ ...x, notes: e.target.value }))}
        />
      </Section>
      <p className="text-xs text-muted-foreground">{t("sourceHint")}</p>
    </div>
  );
}

function RoomRows({
  room,
  link,
  results,
  groups,
  editable,
  formLabel,
  setRoom,
  setRadiator,
  removeRoom,
  defaults,
}: {
  room: RadiatorRoom;
  link: { name: string; floor: string; load: number; roomTemp: number } | null;
  results: RadiatorResult[];
  groups: RadiatorGroup[];
  editable: boolean;
  formLabel: (f: string) => string;
  setRoom: (patch: Partial<RadiatorRoom>) => void;
  setRadiator: (id: string, patch: Partial<Radiator>) => void;
  removeRoom: () => void;
  defaults: RadiatorPlan["defaults"];
}) {
  const t = useTranslations("radiators");
  const output = results.reduce((s, r) => s + r.output, 0);
  const load = room.load ?? link?.load ?? 0;
  return (
    <>
      <tr className="border-t bg-muted/40">
        <td className="px-2 py-1" colSpan={1}>
          <div className="flex items-center gap-1">
            <input
              className="h-7 w-44 rounded border border-input bg-field px-1.5 font-medium"
              value={room.name}
              placeholder={link?.name ?? t("col.room")}
              maxLength={120}
              disabled={!editable}
              aria-label={t("col.room")}
              onChange={(e) => setRoom({ name: e.target.value })}
            />
            <input
              className="h-7 w-12 rounded border border-input bg-field px-1.5"
              value={room.floor}
              placeholder={link?.floor ?? t("floor")}
              maxLength={20}
              disabled={!editable}
              aria-label={t("floor")}
              title={t("floor")}
              onChange={(e) => setRoom({ floor: e.target.value })}
            />
          </div>
        </td>
        <td className="px-1">
          <NumberField value={room.load} decimals={0} label="Qh" disabled={!editable} placeholder={link ? fmt(link.load) : undefined} onChange={(v) => setRoom({ load: v })} className="w-16" />
        </td>
        <td className="px-1">
          <NumberField value={room.roomTemp} decimals={1} label="θi" disabled={!editable} placeholder={link ? fmt(link.roomTemp, 1) : undefined} onChange={(v) => setRoom({ roomTemp: v })} className="w-12" />
        </td>
        <td className="px-1 text-muted-foreground" colSpan={4}>
          {groups.length > 1 && (
            <NativeSelect value={room.groupId ?? ""} disabled={!editable} className="h-7 w-40 text-xs" aria-label={t("group")} onChange={(e) => setRoom({ groupId: e.target.value || null })}>
              <option value="">{t("unassigned")}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </td>
        <td className="px-1 text-right font-medium tabular-nums">{fmt(output)}</td>
        <td className={cn("px-1 text-right tabular-nums", load > 0 && output + 1 < load && "text-amber-700 dark:text-amber-400")}>{load > 0 ? `${fmt((output / load) * 100)} %` : ""}</td>
        <td colSpan={9} />
        <td className="pr-1 text-right whitespace-nowrap">
          {editable && (
            <>
              <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={t("addRadiator")} title={t("addRadiator")} onClick={() => setRoom({ radiators: [...room.radiators, newRadiator()] })}>
                <Plus className="size-3.5" />
              </button>
              <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={t("removeRoom")} title={t("removeRoom")} onClick={removeRoom}>
                <Trash2 className="size-3.5" />
              </button>
            </>
          )}
        </td>
      </tr>
      {room.radiators.map((rad, i) => {
        const r = results[i];
        const set = (patch: Partial<Radiator>) => setRadiator(rad.id, patch);
        const unitLabel = r.ref?.series.unit === "length" ? "mm" : r.ref?.series.unit === "element" ? t("elements") : "";
        const articles = [r.radiatorArticle, r.vlValve, r.valveBlock, r.head, r.rlValve, r.ventValve, r.drainCock].filter(Boolean) as { number: string; text: string }[];
        const bottom = r.connection === "bottom";
        return (
          <tr key={rad.id} className="border-b last:border-0 align-top">
            <td className="py-1 pr-1 pl-6">
              <input
                className="h-7 w-full max-w-52 rounded border border-input bg-field px-1.5"
                value={rad.label}
                placeholder={r.label}
                maxLength={80}
                disabled={!editable}
                aria-label={t("col.label")}
                onChange={(e) => set({ label: e.target.value })}
              />
              <ul className="mt-1 space-y-0.5 text-[11px] leading-tight text-muted-foreground">
                {articles.map((a) => (
                  <li key={a.number} className="whitespace-nowrap">
                    {a.number} · {a.text}
                  </li>
                ))}
              </ul>
            </td>
            <td className="px-1 py-1 text-right tabular-nums">{fmt(r.load)}</td>
            <td />
            <td className="px-1 py-1">
              <NumberField value={rad.share === null ? null : rad.share * 100} decimals={0} label={t("col.share")} disabled={!editable || room.radiators.length < 2} placeholder={fmt(r.share * 100)} onChange={(v) => set({ share: v === null ? null : Math.min(Math.max(v, 0), 100) / 100 })} className="w-12" />
            </td>
            <td className="px-1 py-1">
              <ModelPicker value={rad.model} fallback={defaults.model} editable={editable} label={t("col.model")} onChange={(v) => set({ model: v, size: null })} compact />
            </td>
            <td className="px-1 py-1">
              {r.ref?.series.unit === "fixed" ? (
                <span className="tabular-nums">1</span>
              ) : (
                <NumberField value={rad.size} decimals={0} label={t("col.size")} disabled={!editable} placeholder={r.size !== null ? fmt(r.size) : undefined} onChange={(v) => set({ size: v === null ? null : Math.max(Math.round(v), 1) })} className="w-14" />
              )}
              {unitLabel && <span className="block text-right text-[10px] text-muted-foreground">{unitLabel}</span>}
            </td>
            <td className="px-1 py-1 text-right tabular-nums">{fmt(r.length)}</td>
            <td className="px-1 py-1 text-right font-medium tabular-nums">{fmt(r.output)}</td>
            <td className={cn("px-1 py-1 text-right tabular-nums", r.coverage !== null && r.coverage < 0.999 && "text-amber-700 dark:text-amber-400")}>
              {r.warnings.filter((w) => w !== "factor").length ? (
                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400" title={r.warnings.map((w) => t(`warnings.${w}`)).join("\n")}>
                  <TriangleAlert className="size-3.5" />
                  {r.coverage === null ? "" : `${fmt(r.coverage * 100)} %`}
                </span>
              ) : r.coverage === null ? (
                ""
              ) : (
                `${fmt(r.coverage * 100)} %`
              )}
            </td>
            <td className="px-1 py-1">
              <MaybeSelect value={rad.connection} options={radiatorConnections} optionLabel={(v) => t(`connections.${v}`)} fallback={t("standard", { value: t(`connections.${defaults.connection}`) })} label={t("col.connection")} editable={editable} onChange={(v) => set({ connection: v })} className="w-32" />
            </td>
            <td className="px-1 py-1">
              <MaybeSelect value={rad.side} options={["left", "right"] as const} optionLabel={(v) => t(`sides.${v}`)} fallback={t("standard", { value: t(`sides.${defaults.side}`) })} label={t("col.side")} editable={editable} onChange={(v) => set({ side: v })} className="w-28" />
            </td>
            <td className="px-1 py-1">
              <MaybeSelect value={rad.pipeFrom} options={pipeSources} optionLabel={(v) => t(`pipeSources.${v}`)} fallback={t("standard", { value: t(`pipeSources.${defaults.pipeFrom}`) })} label={t("col.pipeFrom")} editable={editable} onChange={(v) => set({ pipeFrom: v })} className="w-28" />
            </td>
            <td className="px-1 py-1">
              {bottom ? (
                <span className="text-muted-foreground">{t("valveInsert")}</span>
              ) : (
                <MaybeSelect value={rad.vlForm} options={valveForms} optionLabel={formLabel} fallback={t("auto", { value: formLabel(r.vlForm) })} label={t("col.vlForm")} editable={editable} onChange={(v) => set({ vlForm: v })} className="w-32" />
              )}
            </td>
            <td className="px-1 py-1">
              <MaybeSelect value={rad.rlForm} options={["eck", "durchgang"] as const} optionLabel={formLabel} fallback={t("auto", { value: formLabel(r.rlForm) })} label={t("col.rlForm")} editable={editable} onChange={(v) => set({ rlForm: v })} className="w-28" />
            </td>
            <td className="px-1 py-1">
              {bottom ? (
                <span className="text-muted-foreground">{t("drains.separate")}</span>
              ) : (
                <MaybeSelect value={rad.drain} options={["return", "separate"] as const} optionLabel={(v) => t(`drains.${v}`)} fallback={t("standard", { value: t(`drains.${defaults.drain}`) })} label={t("col.drain")} editable={editable} onChange={(v) => set({ drain: v })} className="w-32" />
              )}
            </td>
            <td className="px-1 py-1">
              <NumberField value={rad.connFactor} decimals={2} label={t("col.factorHint")} disabled={!editable} placeholder="1.00" onChange={(v) => set({ connFactor: v === null ? null : Math.min(Math.max(v, 0.5), 1.2) })} className="w-12" />
            </td>
            <td className="px-1 py-1 text-center">
              <input type="checkbox" checked={rad.vent} disabled={!editable} aria-label={t("col.vent")} onChange={(e) => set({ vent: e.target.checked })} />
            </td>
            <td className="px-1 py-1 text-right tabular-nums">{fmt(r.massFlow, 1)}</td>
            <td className="pr-1 py-1 text-right">
              {editable && room.radiators.length > 1 && (
                <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={t("removeRadiator")} title={t("removeRadiator")} onClick={() => setRoom({ radiators: room.radiators.filter((x) => x.id !== rad.id) })}>
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}
