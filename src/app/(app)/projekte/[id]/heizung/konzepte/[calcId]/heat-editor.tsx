"use client";

import { ChevronDown, ChevronRight, Copy, CopyPlus, FileText, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/confirm-button";
import type { FormMessageKey } from "@/components/form";
import { NativeSelect } from "@/components/form";
import { fmt, NumberField, Result, Section } from "@/components/planning/fields";
import { OptionField } from "@/components/planning/plan-ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adjacencies,
  type Construction,
  emissionSystems,
  evaluateHeatLoad,
  f1Table4,
  type HeatLoadData,
  type HeatRoom,
  type HeatSite,
  nMinTable,
  orientations,
  type RoomElement,
  ventilationConcepts,
} from "@/lib/heating/heat-load";
import { cn } from "@/lib/utils";

import { deleteHeatCalc, duplicateHeatCalc, saveHeatCalc } from "../../actions";

const newId = () => crypto.randomUUID();

const emptyElement = (): RoomElement => ({
  id: newId(),
  constructionId: null,
  orientation: "",
  adjacency: "outside",
  width: null,
  length: null,
  count: null,
  deduction: null,
  areaOverride: null,
  neighbourMode: "temperature",
  neighbourTemp: null,
  neighbourRoomId: null,
  table4: "side1",
  table4HighAirChange: false,
  height: null,
  heatedSurface: false,
});

/** Next room number: increments the trailing digits of the last number (E09 → E10). */
function nextNumber(rooms: HeatRoom[]): string {
  const last = rooms.at(-1)?.number ?? "";
  const match = /^(.*?)(\d+)$/.exec(last);
  if (!match) return rooms.length ? "" : "001";
  return match[1] + String(Number(match[2]) + 1).padStart(match[2].length, "0");
}

const inputCls = "h-7 w-full rounded border border-input bg-transparent px-1.5 outline-none focus:border-ring disabled:opacity-60";

export function HeatEditor({
  id,
  projectId,
  initialName,
  initialData,
  site,
  catalog,
  editable,
}: {
  id: string;
  projectId: string;
  initialName: string;
  initialData: HeatLoadData;
  site: HeatSite;
  catalog: Construction[];
  editable: boolean;
}) {
  const t = useTranslations("heatLoad");
  const tForms = useTranslations("forms");
  const [name, setName] = useState(initialName);
  const [data, setData] = useState(initialData);
  const [saved, setSaved] = useState({ name: initialName, data: initialData });
  const [open, setOpen] = useState<Set<string>>(() => new Set(initialData.rooms.slice(0, 1).map((r) => r.id)));
  const [pending, startTransition] = useTransition();
  const dirty = name !== saved.name || data !== saved.data;
  const result = useMemo(() => evaluateHeatLoad(data, site, catalog), [data, site, catalog]);
  const set = <K extends keyof HeatLoadData>(key: K, value: HeatLoadData[K]) => setData((d) => ({ ...d, [key]: value }));
  const setRoom = (roomId: string, patch: Partial<HeatRoom>) => set("rooms", data.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)));
  const toggle = (roomId: string) => setOpen((o) => new Set(o.has(roomId) ? [...o].filter((x) => x !== roomId) : [...o, roomId]));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = () =>
    startTransition(async () => {
      const response = await saveHeatCalc(id, projectId, name, data);
      if (response.error) toast.error(tForms(response.error as FormMessageKey));
      else {
        setSaved({ name, data });
        toast.success(tForms("saved"));
      }
    });

  const addRoom = () => {
    const last = data.rooms.at(-1);
    const room: HeatRoom = {
      id: newId(),
      number: nextNumber(data.rooms),
      name: "",
      floor: last?.floor ?? "EG",
      kind: "heated",
      thetaInt: last?.thetaInt ?? 20,
      area: null,
      height: last?.height ?? 2.5,
      volume: null,
      roomType: Object.keys(nMinTable[data.concept])[0],
      nMinOverride: null,
      standing: false,
      emission: last?.emission ?? "surface",
      gains: null,
      elements: [],
    };
    set("rooms", [...data.rooms, room]);
    setOpen((o) => new Set([...o, room.id]));
  };
  const duplicateRoom = (room: HeatRoom) => {
    const copy = { ...room, id: newId(), number: nextNumber(data.rooms), elements: room.elements.map((e) => ({ ...e, id: newId() })) };
    const index = data.rooms.findIndex((r) => r.id === room.id);
    set("rooms", [...data.rooms.slice(0, index + 1), copy, ...data.rooms.slice(index + 1)]);
  };

  const s = result.site;
  const warnings = result.rooms.flatMap((r) => r.elements.filter((e) => e.warning)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-md space-y-1">
          <label htmlFor="hl-name" className="text-xs text-muted-foreground">
            {t("name")}
          </label>
          <Input id="hl-name" value={name} maxLength={200} disabled={!editable} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/pdf/heat-load/${id}`}
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
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => (dirty ? toast.error(t("saveFirst")) : startTransition(async () => void (await duplicateHeatCalc(id, projectId))))}
              >
                <Copy />
                {t("duplicate")}
              </Button>
              <ConfirmButton
                variant="outline"
                label={t("delete")}
                trigger={<Trash2 />}
                title={t("deleteTitle")}
                text={t("deleteText", { name })}
                confirmLabel={t("delete")}
                onConfirm={() => deleteHeatCalc(id, projectId)}
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
        <Result label={t("result.thetaE0")} value={s.thetaE0 === null ? "" : fmt(s.thetaE0, 0)} unit="°C" hint={s.thetaE0 === null ? t("result.noStation") : undefined} tone={s.thetaE0 === null ? "warn" : undefined} />
        <Result label={t("result.phiT")} value={fmt(result.phiT)} unit="W" />
        <Result label={t("result.phiV", { fiz: fmt(result.fiz, 2) })} value={fmt(result.fiz * result.phiV)} unit="W" />
        <Result label={t("result.building")} value={fmt(result.building)} unit="W" tone="ok" />
        <Result label={t("result.specific")} value={fmt(result.specific, 1)} unit="W/m²" />
        <Result label={t("result.roomSum")} value={fmt(result.roomSum)} unit="W" hint={t("result.roomSumHint")} />
      </div>

      <Section title={t("settings")}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <OptionField
            label={t("concept")}
            value={data.concept}
            options={ventilationConcepts}
            optionLabel={(v) => t(`concepts.${v}`)}
            editable={editable}
            onChange={(concept) => setData((d) => ({ ...d, concept, rooms: d.rooms.map((r) => (r.roomType in nMinTable[concept] ? r : { ...r, roomType: Object.keys(nMinTable[concept])[0] })) }))}
            hint={t("conceptHint")}
          />
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="hl-fiz">
              {t("fiz")}
            </label>
            <NumberField id="hl-fiz" value={data.fiz} decimals={2} label={t("fiz")} disabled={!editable} placeholder={fmt(result.fiz, 2)} onChange={(v) => set("fiz", v)} className="h-8 rounded-lg" />
            <p className="text-xs text-muted-foreground">{t("fizHint", { min: fmt(result.fizRange[0], 1), max: fmt(result.fizRange[1], 1) })}</p>
          </div>
        </div>
        {catalog.length === 0 && <p className="text-sm text-amber-700 dark:text-amber-400">{t("noCatalog")}</p>}
      </Section>

      <section className="rounded-xl border">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
          <h2 className="font-semibold">{t("rooms")}</h2>
          <div className="flex items-center gap-3">
            {warnings > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                <TriangleAlert className="size-3.5" />
                {t("warningsCount", { count: warnings })}
              </span>
            )}
            {editable && (
              <Button size="sm" variant="outline" onClick={addRoom}>
                <Plus />
                {t("addRoom")}
              </Button>
            )}
          </div>
        </header>
        {data.rooms.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{t("noRooms")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="w-8" />
                  <th className="py-1.5 font-medium">{t("room.number")}</th>
                  <th className="px-1 font-medium">{t("room.name")}</th>
                  <th className="px-1 font-medium">{t("room.floor")}</th>
                  <th className="px-1 font-medium">{t("room.kind")}</th>
                  <th className="px-1 text-right font-medium">θ [°C]</th>
                  <th className="px-1 text-right font-medium">A [m²]</th>
                  <th className="px-1 text-right font-medium">h [m]</th>
                  <th className="px-1 font-medium">{t("room.type")}</th>
                  <th className="px-1 text-right font-medium">Φ_T</th>
                  <th className="px-1 text-right font-medium">Φ_V</th>
                  <th className="px-1 text-right font-medium">Φ_HL [W]</th>
                  <th className="px-1 text-right font-medium">W/m²</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {data.rooms.map((room, index) => {
                  const r = result.rooms[index];
                  const isOpen = open.has(room.id);
                  return (
                    <Fragment key={room.id}>
                      <tr className={cn("border-b", isOpen && "bg-muted/30")}>
                        <td className="pl-2">
                          <button type="button" className="rounded p-1 hover:bg-muted" aria-label={t("room.elements")} aria-expanded={isOpen} onClick={() => toggle(room.id)}>
                            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </button>
                        </td>
                        <td className="w-20 py-0.5 pr-1">
                          <input className={inputCls} value={room.number} maxLength={20} disabled={!editable} aria-label={t("room.number")} onChange={(e) => setRoom(room.id, { number: e.target.value })} />
                        </td>
                        <td className="px-1">
                          <input className={cn(inputCls, "min-w-40")} value={room.name} maxLength={120} disabled={!editable} aria-label={t("room.name")} onChange={(e) => setRoom(room.id, { name: e.target.value })} />
                        </td>
                        <td className="w-16 px-1">
                          <input className={inputCls} value={room.floor} maxLength={20} disabled={!editable} aria-label={t("room.floor")} onChange={(e) => setRoom(room.id, { floor: e.target.value })} />
                        </td>
                        <td className="px-1">
                          <NativeSelect value={room.kind} disabled={!editable} className="h-7 text-xs" aria-label={t("room.kind")} onChange={(e) => setRoom(room.id, { kind: e.target.value as HeatRoom["kind"] })}>
                            <option value="heated">{t("kinds.heated")}</option>
                            <option value="passive">{t("kinds.passive")}</option>
                          </NativeSelect>
                        </td>
                        <td className="w-16 px-1">
                          {room.kind === "heated" ? (
                            <NumberField value={room.thetaInt} decimals={1} label="θint" disabled={!editable} onChange={(v) => setRoom(room.id, { thetaInt: v })} />
                          ) : (
                            <span className="block text-right text-xs tabular-nums" title={t("room.passiveHint")}>
                              {fmt(r.passiveTemp, 1)}
                            </span>
                          )}
                        </td>
                        <td className="w-20 px-1">
                          <NumberField value={room.area} decimals={2} label="A" disabled={!editable} onChange={(v) => setRoom(room.id, { area: v })} />
                        </td>
                        <td className="w-16 px-1">
                          <NumberField value={room.height} decimals={2} label="h" disabled={!editable} onChange={(v) => setRoom(room.id, { height: v })} />
                        </td>
                        <td className="px-1">
                          {room.kind === "heated" && (
                            <NativeSelect value={room.roomType in nMinTable[data.concept] ? room.roomType : Object.keys(nMinTable[data.concept])[0]} disabled={!editable} className="h-7 max-w-56 text-xs" aria-label={t("room.type")} onChange={(e) => setRoom(room.id, { roomType: e.target.value })}>
                              {Object.keys(nMinTable[data.concept]).map((k) => (
                                <option key={k} value={k}>
                                  {t(`roomTypes.${k}` as never)} ({fmt(nMinTable[data.concept][k][site.airtight === "new" ? 0 : 1], 1)} h⁻¹)
                                </option>
                              ))}
                            </NativeSelect>
                          )}
                        </td>
                        <td className="px-1 text-right tabular-nums">{room.kind === "heated" ? fmt(r.phiTotal) : ""}</td>
                        <td className="px-1 text-right tabular-nums">{room.kind === "heated" ? fmt(r.phiV) : ""}</td>
                        <td className="px-1 text-right font-medium tabular-nums">{room.kind === "heated" ? fmt(r.phiHL) : ""}</td>
                        <td className="px-1 text-right tabular-nums">{fmt(r.specific, 1)}</td>
                        <td className="pr-2 text-right whitespace-nowrap">
                          {editable && (
                            <>
                              <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" title={t("room.duplicate")} aria-label={t("room.duplicate")} onClick={() => duplicateRoom(room)}>
                                <CopyPlus className="size-4" />
                              </button>
                              <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" title={t("room.remove")} aria-label={t("room.remove")} onClick={() => set("rooms", data.rooms.filter((x) => x.id !== room.id))}>
                                <Trash2 className="size-4" />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={14} className="px-4 py-3">
                            <RoomDetail
                              room={room}
                              rooms={data.rooms}
                              result={r}
                              catalog={catalog}
                              editable={editable}
                              onChange={(patch) => setRoom(room.id, patch)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
      <p className="text-xs text-muted-foreground">{t("normHint")}</p>
    </div>
  );
}

function RoomDetail({
  room,
  rooms,
  result,
  catalog,
  editable,
  onChange,
}: {
  room: HeatRoom;
  rooms: HeatRoom[];
  result: ReturnType<typeof evaluateHeatLoad>["rooms"][number];
  catalog: Construction[];
  editable: boolean;
  onChange: (patch: Partial<HeatRoom>) => void;
}) {
  const t = useTranslations("heatLoad");
  const setElement = (id: string, patch: Partial<RoomElement>) => onChange({ elements: room.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const others = rooms.filter((r) => r.id !== room.id);
  const high = (room.height ?? 0) >= 4;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4 text-sm">
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">{t("room.volume")}</span>
          <NumberField value={room.volume} decimals={1} label={t("room.volume")} disabled={!editable} placeholder={fmt((room.area ?? 0) * (room.height ?? 0), 1)} onChange={(v) => onChange({ volume: v })} className="w-24" />
        </label>
        {room.kind === "heated" && (
          <>
            <label className="space-y-1">
              <span className="block text-xs text-muted-foreground">{t("room.nMinOverride")}</span>
              <NumberField value={room.nMinOverride} decimals={2} label={t("room.nMinOverride")} disabled={!editable} placeholder={fmt(result.nMin, 2)} onChange={(v) => onChange({ nMinOverride: v })} className="w-20" />
            </label>
            <label className="space-y-1">
              <span className="block text-xs text-muted-foreground">{t("room.gains")}</span>
              <NumberField value={room.gains} decimals={0} label={t("room.gains")} disabled={!editable} onChange={(v) => onChange({ gains: v })} className="w-24" />
            </label>
          </>
        )}
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">{t("room.emission")}</span>
          <NativeSelect value={room.emission} disabled={!editable} className="h-7 text-xs" onChange={(e) => onChange({ emission: e.target.value as HeatRoom["emission"] })}>
            {Object.keys(emissionSystems).map((k) => (
              <option key={k} value={k}>
                {t(`emission.${k}` as never)}
              </option>
            ))}
          </NativeSelect>
        </label>
        {high && (
          <label className="flex items-center gap-2 pb-1 text-xs">
            <input type="checkbox" checked={room.standing} disabled={!editable} onChange={(e) => onChange({ standing: e.target.checked })} />
            {t("room.standing")}
          </label>
        )}
        <p className="pb-1 text-xs text-muted-foreground">
          {room.kind === "heated"
            ? t("room.summary", { hT: fmt(result.hT.outside + result.hT.unheated + result.hT.heated + result.hT.ground, 2), qv: fmt(result.qv, 1), nMin: fmt(result.nMin, 2) })
            : t("room.passiveHint")}
          {high && ` · ${t("room.high")}`}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full min-w-[1150px] text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b text-left">
              <th className="px-2 py-1 font-medium">{t("el.construction")}</th>
              <th className="px-1 font-medium">{t("el.orientation")}</th>
              <th className="px-1 font-medium">{t("el.adjacency")}</th>
              <th className="px-1 text-right font-medium">{t("el.width")}</th>
              <th className="px-1 text-right font-medium">{t("el.length")}</th>
              <th className="px-1 text-right font-medium">{t("el.count")}</th>
              <th className="px-1 text-right font-medium">{t("el.deduction")}</th>
              <th className="px-1 text-right font-medium">{t("el.area")}</th>
              <th className="px-1 font-medium">{t("el.neighbour")}</th>
              {high && <th className="px-1 text-right font-medium">{t("el.height")}</th>}
              <th className="px-1 font-medium" title={t("el.heatedSurfaceHint")}>
                {t("el.heatedSurface")}
              </th>
              <th className="px-1 text-right font-medium">f</th>
              <th className="px-1 text-right font-medium">H [W/K]</th>
              <th className="px-1 text-right font-medium">Φ [W]</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {room.elements.map((e, k) => {
              const er = result.elements[k];
              const c = catalog.find((x) => x.id === e.constructionId);
              const bridge = c?.kind === "linear" || c?.kind === "point";
              return (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="px-2 py-0.5">
                    <NativeSelect value={e.constructionId ?? ""} disabled={!editable} className="h-7 w-56 text-xs" aria-label={t("el.construction")} onChange={(ev) => setElement(e.id, { constructionId: ev.target.value || null })}>
                      <option value="">–</option>
                      {(["element", "ground", "linear", "point"] as const).map((kind) => {
                        const list = catalog.filter((x) => x.kind === kind);
                        return list.length ? (
                          <optgroup key={kind} label={t(`kinds.${kind}`)}>
                            {list.map((x) => (
                              <option key={x.id} value={x.id}>
                                {[x.code, x.name].filter(Boolean).join(" ")} {x.value !== null && kind !== "ground" ? `(${fmt(x.value, 3)})` : ""}
                              </option>
                            ))}
                          </optgroup>
                        ) : null;
                      })}
                    </NativeSelect>
                  </td>
                  <td className="px-1">
                    <NativeSelect value={e.orientation} disabled={!editable} className="h-7 w-16 text-xs" aria-label={t("el.orientation")} onChange={(ev) => setElement(e.id, { orientation: ev.target.value })}>
                      <option value="">–</option>
                      {orientations.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </NativeSelect>
                  </td>
                  <td className="px-1">
                    <NativeSelect
                      value={e.adjacency}
                      disabled={!editable}
                      className="h-7 w-32 text-xs"
                      aria-label={t("el.adjacency")}
                      onChange={(ev) => {
                        const adjacency = ev.target.value as RoomElement["adjacency"];
                        setElement(e.id, { adjacency, neighbourMode: adjacency === "heated" && e.neighbourMode === "table4" ? "temperature" : e.neighbourMode });
                      }}
                    >
                      {adjacencies.map((a) => (
                        <option key={a} value={a}>
                          {t(`adjacency.${a}`)}
                        </option>
                      ))}
                    </NativeSelect>
                  </td>
                  {(["width", "length", "count", "deduction", "areaOverride"] as const).map((key) => (
                    <td key={key} className="w-16 px-1">
                      {!(bridge && (key === "width" || key === "deduction" || key === "areaOverride")) && !(c?.kind === "point" && key === "length") && (
                        <NumberField
                          value={e[key]}
                          decimals={key === "count" ? 0 : 2}
                          label={t(`el.${key === "areaOverride" ? "area" : key}`)}
                          disabled={!editable}
                          placeholder={key === "areaOverride" && !bridge ? fmt(er?.quantity, 2) : key === "count" ? "1" : undefined}
                          onChange={(v) => setElement(e.id, { [key]: v })}
                        />
                      )}
                    </td>
                  ))}
                  <td className="px-1">
                    {(e.adjacency === "unheated" || e.adjacency === "heated") && (
                      <div className="flex items-center gap-1">
                        <NativeSelect value={e.neighbourMode} disabled={!editable} className="h-7 w-28 text-xs" aria-label={t("el.neighbour")} onChange={(ev) => setElement(e.id, { neighbourMode: ev.target.value as RoomElement["neighbourMode"] })}>
                          <option value="temperature">{t("neighbour.temperature")}</option>
                          <option value="room">{t("neighbour.room")}</option>
                          {e.adjacency === "unheated" && <option value="table4">{t("neighbour.table4")}</option>}
                        </NativeSelect>
                        {e.neighbourMode === "temperature" && (
                          <NumberField value={e.neighbourTemp} decimals={1} label={t("neighbour.temperature")} negative disabled={!editable} onChange={(v) => setElement(e.id, { neighbourTemp: v })} className="w-14" />
                        )}
                        {e.neighbourMode === "room" && (
                          <NativeSelect value={e.neighbourRoomId ?? ""} disabled={!editable} className="h-7 w-36 text-xs" aria-label={t("neighbour.room")} onChange={(ev) => setElement(e.id, { neighbourRoomId: ev.target.value || null })}>
                            <option value="">–</option>
                            {others.map((o) => (
                              <option key={o.id} value={o.id}>
                                {[o.number, o.name].filter(Boolean).join(" ")}
                              </option>
                            ))}
                          </NativeSelect>
                        )}
                        {e.neighbourMode === "table4" && (
                          <>
                            <NativeSelect value={e.table4} disabled={!editable} className="h-7 w-36 text-xs" aria-label={t("neighbour.table4")} onChange={(ev) => setElement(e.id, { table4: ev.target.value as RoomElement["table4"] })}>
                              {Object.keys(f1Table4).map((k) => (
                                <option key={k} value={k}>
                                  {t(`table4.${k}` as never)}
                                </option>
                              ))}
                            </NativeSelect>
                            <label className="flex items-center gap-1 whitespace-nowrap" title={t("neighbour.highAirChange")}>
                              <input type="checkbox" checked={e.table4HighAirChange} disabled={!editable} onChange={(ev) => setElement(e.id, { table4HighAirChange: ev.target.checked })} />
                              {"n > 0.5"}
                            </label>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                  {high && (
                    <td className="w-14 px-1">
                      <NumberField value={e.height} decimals={2} label={t("el.height")} disabled={!editable} onChange={(v) => setElement(e.id, { height: v })} />
                    </td>
                  )}
                  <td className="px-1 text-center">
                    <input type="checkbox" checked={e.heatedSurface} disabled={!editable} aria-label={t("el.heatedSurface")} onChange={(ev) => setElement(e.id, { heatedSurface: ev.target.checked })} />
                  </td>
                  <td className="px-1 text-right tabular-nums">{er?.f1 === null || er === undefined ? "" : fmt(er.f1 + er.f2, 3)}</td>
                  <td className="px-1 text-right tabular-nums">{fmt(er?.h, 2)}</td>
                  <td className="px-1 text-right tabular-nums">
                    {er?.warning ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400" title={t(`warnings.${er.warning}`)}>
                        <TriangleAlert className="size-3.5" />
                        {fmt(er.phi)}
                      </span>
                    ) : (
                      fmt(er?.phi)
                    )}
                  </td>
                  <td className="pr-1 text-right">
                    {editable && (
                      <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={t("el.remove")} title={t("el.remove")} onClick={() => onChange({ elements: room.elements.filter((x) => x.id !== e.id) })}>
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
      {editable && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onChange({ elements: [...room.elements, emptyElement()] })}>
            <Plus />
            {t("el.add")}
          </Button>
          {room.elements.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => onChange({ elements: [...room.elements, { ...room.elements.at(-1)!, id: newId() }] })}>
              <CopyPlus />
              {t("el.copyLast")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
