"use client";

import { ArrowDown, ArrowUp, ListPlus, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { NativeSelect } from "@/components/form";
import { Button } from "@/components/ui/button";
import { type AirFlowSummary, findRoomType, type KwlRoom, roomDistribution, type RoomRow, roomTypes } from "@/lib/kwl/calc";
import { airChangeFlow, baseAirChange, fourSteps } from "@/lib/kwl/sia3825";

import { fmt, NumberField, Notice, Result } from "../../fields";

/** Typical rooms of a dwelling, for a quick start. */
const typicalRooms = [
  { key: "living", type: "passage", area: 35 },
  { key: "kitchen", type: "kitchenOpen", area: 12 },
  { key: "room1", type: "room", area: 14 },
  { key: "room2", type: "room", area: 12 },
  { key: "room3", type: "room", area: 12 },
  { key: "bath", type: "bath", area: 7 },
  { key: "shower", type: "bath", area: 5 },
  { key: "storage", type: "shortUse", area: 4 },
] as const;

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

/** Next room number: increments the trailing digits of the last number (E009 → E010). */
function nextNumber(rooms: KwlRoom[]): string {
  const last = rooms.at(-1)?.number ?? "";
  const match = /^(.*?)(\d+)$/.exec(last);
  if (!match) return rooms.length ? "" : "001";
  return match[1] + String(Number(match[2]) + 1).padStart(match[2].length, "0");
}

/** Room with the default flows of its type (LUPI values). */
export function roomWithType(room: KwlRoom, type: KwlRoom["type"]): KwlRoom {
  const old = findRoomType(room.type);
  const next = findRoomType(type);
  const updated = { ...room, type };
  if (!next) return updated;
  const own = next.side === "supply" ? "supply" : "extract";
  const other = own === "supply" ? "extract" : "supply";
  updated[own] = next.lupi;
  // Clear the other side only when it still holds the previous type's default.
  if (old && old.side !== next.side && room[other] === old.lupi) updated[other] = null;
  return updated;
}

export function RoomsTab({
  rooms,
  rows,
  summary,
  partyFlow,
  height,
  demandControlled,
  editable,
  onChange,
  onHeightChange,
}: {
  rooms: KwlRoom[];
  rows: RoomRow[];
  summary: AirFlowSummary;
  partyFlow: number | null;
  height: number;
  demandControlled: boolean;
  editable: boolean;
  onChange: (rooms: KwlRoom[]) => void;
  onHeightChange: (height: number) => void;
}) {
  const t = useTranslations("kwl");
  const update = (index: number, room: KwlRoom) => onChange(rooms.map((r, i) => (i === index ? room : r)));
  const move = (index: number, delta: number) => {
    const next = [...rooms];
    const [room] = next.splice(index, 1);
    next.splice(index + delta, 0, room);
    onChange(next);
  };
  const add = () =>
    onChange([...rooms, { id: newId(), number: nextNumber(rooms), name: "", type: null, area: null, supply: null, extract: null }]);
  const addTypical = () => {
    const list: KwlRoom[] = [...rooms];
    for (const room of typicalRooms) {
      list.push(roomWithType({ id: newId(), number: nextNumber(list), name: t(`rooms.typical.${room.key}`), type: null, area: room.area, supply: null, extract: null }, room.type));
    }
    onChange(list);
  };

  const distribution = (flow: number | null, side: "supply" | "extract") => {
    if (!flow) return null;
    const d = roomDistribution(flow, side);
    return d ? `${d.terminal} · ${d.ducts}` : t("rooms.distributionLarge");
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th rowSpan={2} className="w-20 py-2 pl-3 text-left font-medium">{t("rooms.number")}</th>
              <th rowSpan={2} className="px-2 text-left font-medium">{t("rooms.name")}</th>
              <th rowSpan={2} className="w-52 px-2 text-left font-medium">{t("rooms.type")}</th>
              <th rowSpan={2} className="w-20 px-2 text-right font-medium">{t("rooms.area")}</th>
              <th colSpan={4} className="border-l px-2 pt-2 text-center font-medium">{t("supply")} [m³/h]</th>
              <th colSpan={4} className="border-l px-2 pt-2 text-center font-medium">{t("extract")} [m³/h]</th>
              <th rowSpan={2} className="w-20 pr-3" />
            </tr>
            <tr>
              {["", ""].map((_, i) => (
                <FlowHeads key={i} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="px-6 py-10 text-center text-muted-foreground">
                  {t("rooms.empty")}
                </td>
              </tr>
            )}
            {rows.map((row, index) => {
              const room = rooms[index];
              const supplyHint = distribution(row.supply, "supply");
              const extractHint = distribution(row.extract, "extract");
              return (
                <tr key={room.id} className="border-b align-top last:border-0">
                  <td className="py-1 pl-3">
                    <TextCell value={room.number} maxLength={20} label={t("rooms.number")} editable={editable} onChange={(number) => update(index, { ...room, number })} />
                  </td>
                  <td className="px-1 py-1">
                    <TextCell value={room.name} maxLength={120} label={t("rooms.name")} editable={editable} onChange={(name) => update(index, { ...room, name })} />
                    {(supplyHint || extractHint) && (
                      <p className="px-1.5 pt-0.5 text-xs text-muted-foreground">
                        {[supplyHint && `${t("supplyShort")}: ${supplyHint}`, extractHint && `${t("extractShort")}: ${extractHint}`].filter(Boolean).join(" | ")}
                      </p>
                    )}
                  </td>
                  <td className="px-1 py-1">
                    {editable ? (
                      <NativeSelect
                        aria-label={t("rooms.type")}
                        className="h-7"
                        value={room.type ?? ""}
                        onChange={(e) => update(index, roomWithType(room, (e.target.value || null) as KwlRoom["type"]))}
                      >
                        <option value="" />
                        {roomTypes.map((type) => (
                          <option key={type.key} value={type.key}>
                            {type.code} {t(`roomTypes.${type.key}`)}
                          </option>
                        ))}
                      </NativeSelect>
                    ) : (
                      <span className="px-1.5">{room.type && `${findRoomType(room.type)?.code} ${t(`roomTypes.${room.type}`)}`}</span>
                    )}
                  </td>
                  <td className="px-1 py-1">
                    <NumberField value={room.area} label={t("rooms.area")} disabled={!editable} onChange={(area) => update(index, { ...room, area })} />
                  </td>
                  <Computed value={row.recommendedSupply} border />
                  <Computed value={row.minSupply} />
                  <td className="px-1 py-1">
                    <NumberField value={room.supply} decimals={0} label={`${t("supply")} ${t("rooms.used")}`} disabled={!editable} onChange={(supply) => update(index, { ...room, supply })} className="font-medium" />
                  </td>
                  <Computed value={row.partySupply} />
                  <Computed value={row.recommendedExtract} border />
                  <Computed value={row.minExtract} />
                  <td className="px-1 py-1">
                    <NumberField value={room.extract} decimals={0} label={`${t("extract")} ${t("rooms.used")}`} disabled={!editable} onChange={(extract) => update(index, { ...room, extract })} className="font-medium" />
                  </td>
                  <Computed value={row.partyExtract} />
                  <td className="py-1 pr-2">
                    {editable && (
                      <div className="flex justify-end">
                        <Button variant="ghost" size="icon-sm" aria-label={t("rooms.up")} disabled={index === 0} onClick={() => move(index, -1)}>
                          <ArrowUp />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={t("rooms.down")} disabled={index === rooms.length - 1} onClick={() => move(index, 1)}>
                          <ArrowDown />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={t("rooms.remove")} onClick={() => onChange(rooms.filter((_, i) => i !== index))}>
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 font-semibold">
            <tr>
              <td colSpan={3} className="py-2 pl-3">{t("rooms.total")}</td>
              <td className="px-2 text-right tabular-nums">{fmt(summary.area, 1)}</td>
              <td className="border-l px-2 text-right tabular-nums">{fmt(summary.recommendedSupply)}</td>
              <td className="px-2 text-right tabular-nums">{fmt(summary.minSupply)}</td>
              <td className="px-2 text-right tabular-nums">{fmt(summary.supply)}</td>
              <td className="px-2 text-right tabular-nums">{fmt(partyFlow)}</td>
              <td className="border-l px-2 text-right tabular-nums">{fmt(summary.recommendedExtract)}</td>
              <td className="px-2 text-right tabular-nums">{fmt(summary.minExtract)}</td>
              <td className="px-2 text-right tabular-nums">{fmt(summary.extract)}</td>
              <td className="px-2 text-right tabular-nums">{fmt(partyFlow)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {editable && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={add}>
            <Plus />
            {t("rooms.add")}
          </Button>
          <Button variant="ghost" onClick={addTypical}>
            <ListPlus />
            {t("rooms.addTypical")}
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Result label={t("summary.minimum")} value={fmt(summary.minSupply)} unit="m³/h" hint={t("summary.minimumHint")} />
        <Result
          label={t("summary.nominal")}
          value={`${fmt(summary.supply)} / ${fmt(summary.extract)}`}
          unit="m³/h"
          hint={t("summary.nominalHint", { supply: fmt(summary.recommendedSupply), extract: fmt(summary.recommendedExtract) })}
          tone={summary.imbalance === 0 ? undefined : "warn"}
        />
        <Result label={t("summary.party")} value={fmt(partyFlow)} unit="m³/h" hint={t("summary.partyHint")} />
        <Result label={t("summary.area")} value={fmt(summary.area, 1)} unit="m²" />
      </div>

      {summary.imbalance !== 0 && (summary.supply > 0 || summary.extract > 0) && (
        <Notice>
          {t("summary.imbalance", {
            side: summary.imbalance > 0 ? t("extract") : t("supply"),
            difference: fmt(Math.abs(summary.imbalance)),
            target: fmt(Math.max(summary.supply, summary.extract)),
          })}
        </Notice>
      )}
      {(summary.supply < summary.recommendedSupply || summary.extract < summary.recommendedExtract) && (
        <Notice>{t("summary.belowNorm")}</Notice>
      )}
      <NormCheck rows={rows} rooms={rooms} summary={summary} height={height} demandControlled={demandControlled} editable={editable} onHeightChange={onHeightChange} />
      <Notice tone="info">{t("rooms.lupiHint")}</Notice>
    </div>
  );
}

function FlowHeads() {
  const t = useTranslations("kwl.rooms");
  return (
    <>
      <th className="w-16 border-l px-2 pb-2 text-right font-normal">{t("recommended")}</th>
      <th className="w-16 px-2 pb-2 text-right font-normal">{t("minimum")}</th>
      <th className="w-20 px-2 pb-2 text-right font-medium">{t("used")}</th>
      <th className="w-16 px-2 pb-2 text-right font-normal">{t("party")}</th>
    </>
  );
}

function Computed({ value, border }: { value: number | null; border?: boolean }) {
  return <td className={`px-2 py-2 text-right text-muted-foreground tabular-nums ${border ? "border-l" : ""}`}>{value ? fmt(value) : ""}</td>;
}

function TextCell({
  value,
  label,
  maxLength,
  editable,
  onChange,
}: {
  value: string;
  label: string;
  maxLength: number;
  editable: boolean;
  onChange: (value: string) => void;
}) {
  if (!editable) return <span className="block px-1.5 py-1">{value}</span>;
  return (
    <input
      aria-label={label}
      defaultValue={value}
      maxLength={maxLength}
      onBlur={(e) => e.target.value !== value && onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="h-7 w-full rounded border border-input bg-transparent px-1.5 outline-none focus:border-ring"
    />
  );
}

/** SIA 382/5 5.4.3 (four steps) and 5.2.3 (base ventilation) for this dwelling. */
function NormCheck({
  rows,
  rooms,
  summary,
  height,
  demandControlled,
  editable,
  onHeightChange,
}: {
  rows: RoomRow[];
  rooms: KwlRoom[];
  summary: AirFlowSummary;
  height: number;
  demandControlled: boolean;
  editable: boolean;
  onHeightChange: (height: number) => void;
}) {
  const t = useTranslations("kwl.norm");
  const steps = fourSteps(rooms, demandControlled);
  const base = airChangeFlow(summary.area, height, baseAirChange);
  const lowRooms = rows.filter((r) => (r.supply ?? 0) > 0 && r.area && (r.minSupply ?? 0) < airChangeFlow(r.area, height, baseAirChange));
  const flowsOk = summary.supply >= steps.governing && summary.extract >= steps.governing;

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          {t("height")}
          <NumberField value={height} decimals={2} label={t("height")} disabled={!editable} onChange={(v) => v !== null && v >= 1.5 && onHeightChange(v)} className="h-8 w-20 rounded-lg" />
          m
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Result label={t("step1")} value={fmt(steps.supplyMin)} unit="m³/h" hint={t("step1Hint", { rooms: steps.supplyRooms })} />
        <Result label={t("step2")} value={fmt(steps.extractMin)} unit="m³/h" hint={demandControlled ? t("step2Demand") : t("step2Hint")} />
        <Result
          label={t("step3")}
          value={fmt(steps.governing)}
          unit="m³/h"
          tone={flowsOk ? "ok" : "bad"}
          hint={steps.supplyPerRoom === null ? undefined : t("step4", { flow: fmt(steps.supplyPerRoom) })}
        />
        <Result label={t("base")} value={fmt(base)} unit="m³/h" tone={summary.minSupply >= base && lowRooms.length === 0 ? "ok" : "bad"} hint={t("baseHint", { minimum: fmt(summary.minSupply) })} />
      </div>
      {!flowsOk && <Notice>{t("flowsLow", { flow: fmt(steps.governing) })}</Notice>}
      {lowRooms.length > 0 && <Notice>{t("baseLow", { rooms: lowRooms.map((r) => r.name || r.number).join(", ") })}</Notice>}
    </section>
  );
}
