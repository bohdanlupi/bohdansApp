"use client";

import { ArrowDown, ArrowUp, CornerDownRight, Flame, Grid3x3, Plus, Save, Square, Trash2, Ungroup } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { type FormMessageKey, NativeSelect } from "@/components/form";
import { fmt, Notice, NumberField, Result, Section } from "@/components/planning/fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  type DistributionData,
  type DistributionResult,
  type DistributionSettings,
  type DistributionWarning,
  evaluateDistribution,
  findHeatNode,
  findHeatPipe,
  type GroupInfo,
  type HeatNode,
  heatPipeText,
  mapHeatTree,
  newHeatNode,
  pipesOf,
  type SectionResult,
} from "@/lib/heating/distribution";
import { type CalcOption, type FloorOption, groupInfos, inputLookups } from "@/lib/heating/distribution-inputs";
import { layoutDistribution } from "@/lib/heating/distribution-layout";
import { distributionMaterial, distributionSections } from "@/lib/heating/distribution-material";
import type { HeatingGroup } from "@/lib/heating/plant-schema";
import type { SchemaPlan } from "@/lib/kwl/schema-plan";
import { insulationStyle } from "@/lib/sanitary/pipes";
import { cn } from "@/lib/utils";

import { SchemaPrintButton } from "../../../lueftung/anlagen/[systemId]/schema-print-dialog";
import type { LvWithChapters } from "../../../lueftung/anlagen/[systemId]/quantities-panel";
import { insertDistributionMaterial, saveHeatingDistribution, saveHeatingDistributionPlan } from "../../actions";
import { ChapterMaterial } from "../../chapter-material";
import { DistributionSchemaView } from "./schema-view";


type Patch = Partial<HeatNode>;

export function DistributionEditor({
  projectId,
  plant,
  initialData,
  schemaPlan,
  rooms,
  floors,
  outsideTemp,
  lvs,
  editable,
}: {
  projectId: string;
  plant: { id: string; name: string; groups: HeatingGroup[] };
  initialData: DistributionData;
  schemaPlan: SchemaPlan;
  rooms: CalcOption[];
  floors: FloorOption[];
  /** Norm-Aussentemperatur of the site [°C]. */
  outsideTemp: number | null;
  /** LVs of the project with their chapters, for inserting the Materialauszug. */
  lvs: LvWithChapters[];
  editable: boolean;
}) {
  const t = useTranslations("heatingDistribution");
  const tg = useTranslations("heatingPlan.generation");
  const tForms = useTranslations("forms");
  const [data, setData] = useState(initialData);
  const [saved, setSaved] = useState(initialData);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = data !== saved;

  const groups: GroupInfo[] = useMemo(() => groupInfos(plant.groups, tg("schema.group")), [plant.groups, tg]);
  const [groupId, setGroupId] = useState<string | null>(groups[0]?.id ?? null);
  const lookups = useMemo(() => inputLookups(rooms, floors), [rooms, floors]);
  const result = useMemo(() => evaluateDistribution(data, groups, lookups.room, lookups.floor, outsideTemp), [data, groups, lookups, outsideTemp]);
  const circuitName = (g: { group: GroupInfo }) => {
    const pg = plant.groups.find((x) => x.id === g.group.id);
    return pg ? tg(`circuits.${pg.circuit}`) : "";
  };
  const material = useMemo(() => distributionSections(distributionMaterial(data, result)), [data, result]);
  const schema = useMemo(
    () => layoutDistribution(data, result, { vl: "VL", rl: "RL", insulation: t("schemaText.insulation"), strang: t("schemaText.strang"), circuit: circuitName, head: t("schemaText.head"), rings: (n) => t("schemaText.rings", { n }) }),
    [data, result], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = () =>
    startTransition(async () => {
      const res = await saveHeatingDistribution(plant.id, projectId, data);
      if (res.error) toast.error(tForms(res.error as FormMessageKey));
      else {
        setSaved(data);
        toast.success(tForms("saved"));
      }
    });
  const setSettings = (p: Partial<DistributionSettings>) => setData((d) => ({ ...d, settings: { ...d.settings, ...p } }));
  const network = groupId ? (data.networks[groupId] ?? []) : [];
  const setNetwork = (fn: (roots: HeatNode[]) => HeatNode[]) => groupId && setData((d) => ({ ...d, networks: { ...d.networks, [groupId]: fn(d.networks[groupId] ?? []) } }));
  // Selecting an element in the schema also switches to its group.
  const select = (id: string | null) => {
    setSelected(id);
    if (!id) return;
    const owner = Object.entries(data.networks).find(([, roots]) => findHeatNode(roots, id));
    if (owner) setGroupId(owner[0]);
  };

  if (!groups.length) return <Notice tone="info">{t("noGroups")}</Notice>;
  const hasNetwork = Object.values(data.networks).some((n) => n.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <SchemaPrintButton
          systemId={plant.id}
          projectId={projectId}
          plan={schemaPlan}
          editable={editable}
          dirty={dirty}
          url={`/api/pdf/heating-distribution/${plant.id}`}
          save={saveHeatingDistributionPlan}
        />
        {editable && (
          <Button onClick={save} disabled={!dirty || pending}>
            <Save />
            {dirty ? t("save") : t("saved")}
          </Button>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SettingsForm settings={data.settings} outsideTemp={outsideTemp} editable={editable} onChange={setSettings} />
        <ResultsPanel data={data} result={result} onSelect={select} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-4">
          {hasNetwork && (
            <section className="min-w-0 space-y-2 rounded-xl border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">{t("schema")}</h2>
                <p className="text-xs text-muted-foreground">{t("schemaHint")}</p>
              </div>
              <DistributionSchemaView schema={schema} selected={selected} label={plant.name} onSelect={select} />
              {schema.insulated && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block h-2.5 w-6 rounded-sm border border-dotted" style={{ backgroundColor: insulationStyle.fill, borderColor: insulationStyle.edge }} />
                  {t("insulationBand")}
                </p>
              )}
            </section>
          )}
          <TreeList
            groups={groups}
            groupId={groupId}
            onGroup={(id) => {
              setGroupId(id);
              setSelected(null);
            }}
            network={network}
            result={result}
            selected={selected}
            editable={editable}
            onSelect={select}
            onChange={setNetwork}
            floors={floors.filter((f) => f.groupId === groupId)}
          />
        </div>
        <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start">
          <NodeEditor network={network} selected={selected} result={result} rooms={rooms} floors={floors} editable={editable} onSelect={select} onChange={setNetwork} />
        </aside>
      </div>

      {hasNetwork && (
        <Section title={t("material.title")} description={t("material.hint")} collapseKey="heating-distribution:material">
          <ChapterMaterial
            sections={material}
            lvs={lvs}
            plantName={plant.name}
            projectId={projectId}
            defaultTitle={t("material.lvGroup", { name: plant.name })}
            hint={t("material.listHint")}
            dirty={dirty}
            editable={editable}
            insert={(lvId, title, targets) => insertDistributionMaterial(plant.id, projectId, lvId, title, targets)}
          />
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

function siblingsOf(roots: HeatNode[], id: string): { parent: HeatNode | null; index: number } | null {
  const i = roots.findIndex((n) => n.id === id);
  if (i >= 0) return { parent: null, index: i };
  for (const n of roots) {
    const j = n.children.findIndex((c) => c.id === id);
    if (j >= 0) return { parent: n, index: j };
    const deeper = siblingsOf(n.children, id);
    if (deeper) return deeper;
  }
  return null;
}

/** New pipe below a parent: same system and surroundings; Strang after a Strang. */
const childPipe = (parent: HeatNode | null): HeatNode =>
  newHeatNode("pipe", parent ? { system: parent.system, ambient: parent.ambient, riser: parent.riser, floor: parent.riser ? "" : parent.floor } : {});

function TreeList({
  groups,
  groupId,
  onGroup,
  network,
  result,
  selected,
  editable,
  onSelect,
  onChange,
  floors,
}: {
  groups: GroupInfo[];
  groupId: string | null;
  onGroup: (id: string) => void;
  network: HeatNode[];
  result: DistributionResult;
  selected: string | null;
  editable: boolean;
  onSelect: (id: string | null) => void;
  onChange: (fn: (roots: HeatNode[]) => HeatNode[]) => void;
  /** FBH-Verteiler linked to this group. */
  floors: FloorOption[];
}) {
  const t = useTranslations("heatingDistribution");
  const usedFloors = new Set<string>();
  const collect = (list: HeatNode[]) => list.forEach((n) => (n.type === "floor" && n.distributorId && usedFloors.add(n.distributorId), collect(n.children)));
  collect(network);
  const missing = floors.filter((f) => !usedFloors.has(f.id));

  return (
    <section className="rounded-xl border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{t("tree.title")}</h3>
          <NativeSelect value={groupId ?? ""} onChange={(e) => onGroup(e.target.value)} className="h-8 w-56" aria-label={t("tree.group")}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <span className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-1 w-4 rounded bg-[#e3001b]" />
            VL
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-1 w-4 rounded border-t-2 border-dashed border-[#0057b8]" />
            RL
          </span>
        </span>
      </header>
      <div className="flex border-b px-3 py-1 text-[11px] text-muted-foreground">
        <span className="flex-1">{t("tree.element")}</span>
        <span className="w-24 text-right">{t("tree.size")}</span>
        <span className="w-20 text-right">{t("tree.power")}</span>
        <span className="w-20 text-right">Δp</span>
        <span className="w-16 text-right">{t("tree.temp")}</span>
      </div>
      <ul className="py-1 text-sm">
        {network.length === 0 && <li className="px-3 py-1.5 text-muted-foreground">{t("tree.empty")}</li>}
        {network.map((n) => (
          <Row key={n.id} node={n} depth={0} result={result} selected={selected} onSelect={onSelect} />
        ))}
      </ul>
      {editable && (
        <div className="flex flex-wrap gap-1.5 border-t px-3 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const n = newHeatNode("pipe");
              onChange((roots) => [...roots, n]);
              onSelect(n.id);
            }}
          >
            <Plus />
            {t("tree.addRoot")}
          </Button>
          {missing.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              title={t("tree.addFloorsHint")}
              onClick={() => {
                // A pipe from the group with the linked Verteiler not yet in the network.
                const pipe = newHeatNode("pipe", { children: missing.map((f) => newHeatNode("floor", { systemId: f.systemId, distributorId: f.id })) });
                onChange((roots) => [...roots, pipe]);
                onSelect(pipe.id);
              }}
            >
              <Grid3x3 />
              {t("tree.addFloors", { count: missing.length })}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ node, depth, result, selected, onSelect }: { node: HeatNode; depth: number; result: DistributionResult; selected: string | null; onSelect: (id: string) => void }) {
  const t = useTranslations("heatingDistribution");
  const s = result.sections.get(node.id);
  const term = result.terminals.get(node.id);
  const kind = node.type !== "pipe" ? t(`tree.kinds.${node.type}`) : node.riser ? t("tree.kinds.riser") : s?.role === "floor" ? t("tree.kinds.floorPipe") : t("tree.kinds.distPipe");
  const strang = s?.strang ? ` ${s.strang}` : "";
  const title = [term?.name || node.label, node.floor].filter(Boolean).join(" · ");
  return (
    <>
      <li>
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className={cn("flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-muted/50", selected === node.id && "bg-brand/10")}
          style={{ paddingLeft: `${0.75 + depth * 1.1}rem` }}
        >
          <span className="w-24 shrink-0 text-xs text-muted-foreground">
            {kind}
            {strang}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {title || "–"}
            {node.type === "pipe" && node.length ? ` · ${fmt(node.length, 1)} m` : ""}
          </span>
          <span className="w-24 text-right text-xs tabular-nums">{s ? heatPipeText(s.pipe) : ""}</span>
          <span className="w-20 text-right text-xs tabular-nums">{s ? `${fmt(s.power)} W` : term ? `${fmt(term.power)} W` : ""}</span>
          <span className="w-20 text-right text-xs tabular-nums">{s ? `${fmt(s.dp, 2)} kPa` : term ? `${fmt(term.dp, 1)} kPa` : ""}</span>
          <span className="w-16 text-right text-xs tabular-nums">{s ? `${fmt(s.tOut, 1)} °C` : term ? `${fmt(term.tArrive, 1)} °C` : ""}</span>
        </button>
      </li>
      {node.children.map((c) => (
        <Row key={c.id} node={c} depth={depth + 1} result={result} selected={selected} onSelect={onSelect} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Element panel
// ---------------------------------------------------------------------------

function NodeEditor({
  network,
  selected,
  result,
  rooms,
  floors,
  editable,
  onSelect,
  onChange,
}: {
  network: HeatNode[];
  selected: string | null;
  result: DistributionResult;
  rooms: CalcOption[];
  floors: FloorOption[];
  editable: boolean;
  onSelect: (id: string | null) => void;
  onChange: (fn: (roots: HeatNode[]) => HeatNode[]) => void;
}) {
  const t = useTranslations("heatingDistribution");
  const node = selected ? findHeatNode(network, selected) : null;
  if (!node) return <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{t("tree.selectHint")}</p>;

  const patch = (p: Patch) => onChange((roots) => mapHeatTree(roots, (n) => (n.id === node.id ? { ...n, ...p } : n)));
  const addChild = (child: HeatNode) => {
    onChange((roots) => mapHeatTree(roots, (n) => (n.id === node.id ? { ...n, children: [...n.children, child] } : n)));
    onSelect(child.id);
  };
  const insertAfter = () => {
    const child = childPipe(node);
    onChange((roots) => mapHeatTree(roots, (n) => (n.id === node.id ? { ...n, children: [{ ...child, children: n.children }] } : n)));
    onSelect(child.id);
  };
  const removeElement = () => {
    onChange((roots) => {
      const pos = siblingsOf(roots, node.id);
      if (!pos) return roots;
      const splice = (arr: HeatNode[]) => [...arr.slice(0, pos.index), ...node.children, ...arr.slice(pos.index + 1)];
      if (!pos.parent) return splice(roots);
      return mapHeatTree(roots, (n) => (n.id === pos.parent!.id ? { ...n, children: splice(n.children) } : n));
    });
    onSelect(null);
  };
  const removeBranch = () => {
    onChange((roots) => mapHeatTree(roots, (n) => (n.id === node.id ? null : n)));
    onSelect(null);
  };
  const move = (delta: number) =>
    onChange((roots) => {
      const pos = siblingsOf(roots, node.id);
      if (!pos) return roots;
      const reorder = (arr: HeatNode[]) => {
        const j = pos.index + delta;
        if (j < 0 || j >= arr.length) return arr;
        const next = [...arr];
        [next[pos.index], next[j]] = [next[j], next[pos.index]];
        return next;
      };
      if (!pos.parent) return reorder(roots);
      return mapHeatTree(roots, (n) => (n.id === pos.parent!.id ? { ...n, children: reorder(n.children) } : n));
    });

  const s = result.sections.get(node.id);
  const term = result.terminals.get(node.id);
  const text = (key: "label" | "floor", label: string, max: number, placeholder?: string) => (
    <div className="space-y-1">
      <Label htmlFor={`hn-${key}`} className="text-xs">
        {label}
      </Label>
      <input
        id={`hn-${key}`}
        key={`${node.id}-${key}-${node[key]}`}
        defaultValue={node[key]}
        maxLength={max}
        placeholder={placeholder}
        disabled={!editable}
        onBlur={(e) => e.target.value !== node[key] && patch({ [key]: e.target.value.trim() })}
        className="h-8 w-full rounded-lg border border-input bg-field px-2.5 text-sm outline-none focus:border-ring"
      />
    </div>
  );
  const number = (key: "length" | "power" | "dp" | "insulation", label: string, decimals: number, placeholder?: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <NumberField value={node[key]} decimals={decimals} label={label} placeholder={placeholder} disabled={!editable} onChange={(v) => patch({ [key]: v })} className="h-8 rounded-lg" />
    </div>
  );
  const check = (key: "riser" | "shutoff" | "regValve" | "meterSet" | "heatMeter", label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={node[key]} disabled={!editable} onChange={(e) => patch({ [key]: e.target.checked })} className="size-4 accent-brand" />
      {label}
    </label>
  );

  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{t(`tree.kinds.${node.type === "pipe" ? "pipe" : node.type}`)}</h3>
        {s?.strang && <span className="text-xs text-muted-foreground">{t("tree.strangNo", { n: s.strang })}</span>}
      </div>
      {editable && (
        <div className="flex flex-wrap gap-1.5">
          {node.type === "pipe" && (
            <>
              <Button variant="outline" size="sm" onClick={() => addChild(childPipe(node))}>
                <Plus />
                {t("tree.addPipe")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => addChild(newHeatNode("radiator", { floor: node.floor }))}>
                <Flame />
                {t("tree.addRadiator")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => addChild(newHeatNode("floor", { floor: node.floor }))}>
                <Grid3x3 />
                {t("tree.addFloor")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => addChild(newHeatNode("consumer", { floor: node.floor }))}>
                <Square />
                {t("tree.addConsumer")}
              </Button>
              <Button variant="outline" size="sm" onClick={insertAfter} title={t("tree.insertAfterHint")}>
                <CornerDownRight />
                {t("tree.insertAfter")}
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon-sm" aria-label={t("tree.up")} onClick={() => move(-1)}>
            <ArrowUp />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={t("tree.down")} onClick={() => move(1)}>
            <ArrowDown />
          </Button>
          <Button variant="ghost" size="sm" onClick={removeElement} title={t("tree.removeElementHint")}>
            <Ungroup />
            {t("tree.removeElement")}
          </Button>
          {node.children.length > 0 && (
            <Button variant="ghost" size="sm" onClick={removeBranch}>
              <Trash2 />
              {t("tree.removeBranch")}
            </Button>
          )}
        </div>
      )}

      {node.type === "pipe" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {text("label", t("node.label"), 120)}
            {text("floor", t("node.floor"), 20, "EG, 1.OG …")}
            {number("length", t("node.length"), 2)}
            <div className="space-y-1">
              <Label htmlFor="hn-role" className="text-xs">
                {t("node.role")}
              </Label>
              <NativeSelect id="hn-role" value={node.role} disabled={!editable} onChange={(e) => patch({ role: e.target.value as HeatNode["role"] })}>
                {(["auto", "distribution", "floor"] as const).map((r) => (
                  <option key={r} value={r}>
                    {t(`node.roles.${r}`)}
                    {r === "auto" && s ? ` (${t(`node.roles.${s.role}`)})` : ""}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="hn-system" className="text-xs">
                {t("node.system")}
              </Label>
              <NativeSelect id="hn-system" value={node.system} disabled={!editable} onChange={(e) => patch({ system: e.target.value as HeatNode["system"], size: null })}>
                <option value="therm">Optipress-Therm</option>
                <option value="flowpress">Optiflex-Flowpress</option>
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="hn-size" className="text-xs">
                {t("node.size")}
              </Label>
              <NativeSelect id="hn-size" value={findHeatPipe(node.size)?.system === node.system ? node.size! : ""} disabled={!editable} onChange={(e) => patch({ size: e.target.value || null })}>
                <option value="">
                  {t("node.auto")}
                  {s && s.pipeSource !== "manual" ? ` (${heatPipeText(s.pipe)})` : ""}
                </option>
                {pipesOf(node.system).map((p) => (
                  <option key={p.key} value={p.key}>
                    {heatPipeText(p)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {(["bends90", "bends45"] as const).map((key) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{t(`node.${key}`)}</Label>
                <NumberField
                  value={node[key] || null}
                  decimals={0}
                  label={t(`node.${key}`)}
                  placeholder="0"
                  disabled={!editable}
                  onChange={(v) => patch({ [key]: Math.min(999, Math.max(0, Math.round(v ?? 0))) })}
                  className="h-8 rounded-lg"
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="hn-ambient" className="text-xs">
                {t("node.ambient")}
              </Label>
              <NativeSelect id="hn-ambient" value={node.ambient} disabled={!editable} onChange={(e) => patch({ ambient: e.target.value as HeatNode["ambient"] })}>
                {(["heated", "unheated", "outside"] as const).map((a) => (
                  <option key={a} value={a}>
                    {t(`node.ambients.${a}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {number("insulation", t("node.insulation"), 0, s ? (s.insVl === s.insRl ? `${s.insVl}` : `${s.insVl} / ${s.insRl}`) : "")}
          </div>
          <p className="text-xs text-muted-foreground">{t("node.bendsHint")}</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {check("riser", t("node.riser"))}
            {check("shutoff", t("node.shutoff"))}
            {node.riser && s?.strang && check("regValve", t("node.regValve"))}
          </div>
          {s && <SectionDetails result={s} />}
        </>
      )}

      {node.type === "radiator" && (
        <>
          <div className="space-y-1">
            <Label htmlFor="hn-room" className="text-xs">
              {t("node.room")}
            </Label>
            <NativeSelect
              id="hn-room"
              value={node.calcId && node.roomId ? `${node.calcId}:${node.roomId}` : ""}
              disabled={!editable}
              onChange={(e) => {
                const [calcId, roomId] = e.target.value.split(":");
                const room = rooms.find((c) => c.id === calcId)?.rooms.find((r) => r.id === roomId);
                patch(e.target.value ? { calcId, roomId, floor: room?.floor || node.floor } : { calcId: null, roomId: null });
              }}
            >
              <option value="">{t("node.noRoom")}</option>
              {rooms.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {c.rooms.map((r) => (
                    <option key={r.id} value={`${c.id}:${r.id}`}>
                      {[r.floor, r.label].filter(Boolean).join(" · ")} ({fmt(r.load)} W)
                    </option>
                  ))}
                </optgroup>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {text("label", t("node.label"), 120)}
            {text("floor", t("node.floor"), 20, "EG, 1.OG …")}
            {number("power", t("node.powerOverride"), 0, term ? fmt(term.power) : "")}
            {number("dp", t("node.valveDp"), 1)}
          </div>
          {term && <TerminalDetails term={term} />}
        </>
      )}

      {node.type === "floor" && (
        <>
          <div className="space-y-1">
            <Label htmlFor="hn-floorsys" className="text-xs">
              {t("node.distributor")}
            </Label>
            <NativeSelect
              id="hn-floorsys"
              value={node.systemId && node.distributorId ? `${node.systemId}:${node.distributorId}` : ""}
              disabled={!editable}
              onChange={(e) => {
                const [systemId, distributorId] = e.target.value.split(":");
                patch(e.target.value ? { systemId, distributorId } : { systemId: null, distributorId: null });
              }}
            >
              <option value="">{t("node.noDistributor")}</option>
              {floors.map((f) => (
                <option key={`${f.systemId}:${f.id}`} value={`${f.systemId}:${f.id}`}>
                  {f.systemName} · {f.name} ({fmt(f.total)} W)
                </option>
              ))}
            </NativeSelect>
            {floors.length === 0 && <p className="text-xs text-muted-foreground">{t("node.noFloors")}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {text("label", t("node.label"), 120)}
            {text("floor", t("node.floor"), 20, "EG, 1.OG …")}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {check("shutoff", t("node.shutoff"))}
            {check("meterSet", t("node.meterSet"))}
            {check("heatMeter", t("node.heatMeter"))}
          </div>
          {term && <TerminalDetails term={term} />}
        </>
      )}

      {node.type === "consumer" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {text("label", t("node.label"), 120)}
            {text("floor", t("node.floor"), 20, "EG, 1.OG …")}
            {number("power", t("node.power"), 0)}
            {number("dp", t("node.dp"), 1)}
          </div>
          {term && <TerminalDetails term={term} />}
        </>
      )}
    </div>
  );
}

function SectionDetails({ result }: { result: SectionResult }) {
  const t = useTranslations("heatingDistribution.details");
  const line = (label: string, value: string, tone?: "bad") => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right tabular-nums", tone === "bad" && "text-destructive")}>{value}</dd>
    </>
  );
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t pt-2 text-xs">
      {line(t("power"), `${fmt(result.power)} W · ${fmt(result.massFlow)} kg/h`)}
      {line(t(result.pipeSource === "manual" ? "sizeManual" : "sizeAuto"), `${heatPipeText(result.pipe)} · ${fmt(result.velocity, 2)} m/s`, result.velocity > result.limit ? "bad" : undefined)}
      {line("R VL / RL", `${fmt(result.rVl, 0)} / ${fmt(result.rRl, 0)} Pa/m`)}
      {line(t(result.bends ? "dpBends" : "dpAllowance"), `${fmt(result.dp, 2)} kPa`)}
      {line(t("cumulative"), `${fmt(result.cumulative, 2)} kPa`)}
      {line(t(`insulation.${result.insSource}`), result.insVl === result.insRl ? `${result.insVl} mm` : `VL ${result.insVl} · RL ${result.insRl} mm`)}
      {line(t("loss"), `${fmt(result.loss, 0)} W`)}
      {line(t("temps"), `${fmt(result.tIn, 2)} → ${fmt(result.tOut, 2)} °C`)}
    </dl>
  );
}

function TerminalDetails({ term }: { term: DistributionResult["terminals"] extends Map<string, infer R> ? R : never }) {
  const t = useTranslations("heatingDistribution.details");
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t pt-2 text-xs">
      <dt className="text-muted-foreground">{t("power")}</dt>
      <dd className="text-right tabular-nums">
        {fmt(term.power)} W · {fmt(term.massFlow)} kg/h
      </dd>
      <dt className="text-muted-foreground">{t("terminalDp")}</dt>
      <dd className="text-right tabular-nums">{fmt(term.dp, 1)} kPa</dd>
      <dt className="text-muted-foreground">{t("path")}</dt>
      <dd className="text-right tabular-nums">{fmt(term.path, 2)} kPa</dd>
      <dt className="text-muted-foreground">{t("throttle")}</dt>
      <dd className="text-right tabular-nums">{term.throttle > 0.005 ? `${fmt(term.throttle, 2)} kPa` : t("critical")}</dd>
      <dt className="text-muted-foreground">{t("arrive")}</dt>
      <dd className="text-right tabular-nums">{fmt(term.tArrive, 2)} °C</dd>
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Settings and results
// ---------------------------------------------------------------------------

function SettingsForm({ settings, outsideTemp, editable, onChange }: { settings: DistributionSettings; outsideTemp: number | null; editable: boolean; onChange: (p: Partial<DistributionSettings>) => void }) {
  const t = useTranslations("heatingDistribution.settings");
  const number = (key: "tHeated" | "tUnheated" | "lambda" | "zeta90" | "zeta45" | "valveDp", label: string, decimals: number) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <NumberField value={settings[key]} decimals={decimals} label={label} disabled={!editable} onChange={(v) => v !== null && onChange({ [key]: v })} className="h-8 rounded-lg" />
    </div>
  );
  return (
    <Section title={t("title")} description={t("description")}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {number("tHeated", t("tHeated"), 1)}
        {number("tUnheated", t("tUnheated"), 1)}
        <div className="space-y-1">
          <Label className="text-xs">{t("tOutside")}</Label>
          <NumberField
            value={settings.tOutside}
            decimals={1}
            label={t("tOutside")}
            placeholder={outsideTemp !== null ? fmt(outsideTemp, 1) : "–8"}
            disabled={!editable}
            onChange={(v) => onChange({ tOutside: v })}
            className="h-8 rounded-lg"
          />
        </div>
        {number("lambda", t("lambda"), 3)}
        <div className="space-y-1">
          <Label className="text-xs">{t("allowance")}</Label>
          <NumberField
            value={Math.round(settings.allowance * 1000) / 10}
            decimals={0}
            label={t("allowance")}
            disabled={!editable}
            onChange={(v) => v !== null && onChange({ allowance: v / 100 })}
            className="h-8 rounded-lg"
          />
        </div>
        {number("valveDp", t("valveDp"), 1)}
        {number("zeta90", t("zeta90"), 2)}
        {number("zeta45", t("zeta45"), 2)}
      </div>
      <p className="text-xs text-muted-foreground">{t("insulationHint")}</p>
    </Section>
  );
}

function ResultsPanel({ data, result, onSelect }: { data: DistributionData; result: DistributionResult; onSelect: (id: string) => void }) {
  const t = useTranslations("heatingDistribution.results");
  const tw = useTranslations("heatingDistribution.warnings");
  const all = Object.values(data.networks);
  const labelOf = (id: string) => {
    for (const roots of all) {
      const n = findHeatNode(roots, id);
      if (n) return result.terminals.get(id)?.name || n.label || [n.floor, n.length ? `${fmt(n.length, 1)} m` : ""].filter(Boolean).join(" · ") || "–";
    }
    return "–";
  };
  const warning = (w: DistributionWarning) => {
    switch (w.kind) {
      case "fast":
        return tw("fast", { element: labelOf(w.id), v: fmt(w.velocity, 2), limit: fmt(w.limit, 1) });
      case "cooling":
        return tw("cooling", { element: labelOf(w.id), drop: fmt(w.drop, 1) });
      case "temps":
        return tw("temps", { group: result.groups.find((g) => g.group.id === w.groupId)?.group.name ?? "" });
      default:
        return tw(w.kind, { element: labelOf(w.id) });
    }
  };
  const warnings = [...new Set(result.warnings.map(warning))];
  const groups = result.groups.filter((g) => (data.networks[g.group.id] ?? []).length);
  return (
    <Section title={t("title")}>
      {groups.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {groups.map((g) => (
        <div key={g.group.id} className="space-y-2">
          <h3 className="text-sm font-medium">
            {g.group.name} · {fmt(g.supplyTemp, 0)}/{fmt(g.returnTemp, 0)} °C
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Result label={t("power")} value={fmt(g.power / 1000, 1)} unit="kW" hint={g.group.power !== null ? t("powerHint", { power: fmt(g.group.power, 1) }) : undefined} />
            <Result label={t("massFlow")} value={fmt(g.massFlow, 0)} unit="kg/h" />
            <Result label={t("head")} value={fmt(g.critical, 1)} unit="kPa" hint={t("headHint", { m: fmt(g.critical / 9.81, 2) })} />
            <Result label={t("loss")} value={fmt(g.loss, 0)} unit="W" />
          </div>
          {g.terminals.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1 font-normal">{t("terminal")}</th>
                  <th className="py-1 text-right font-normal">{t("terminalPower")}</th>
                  <th className="py-1 text-right font-normal">Δp</th>
                  <th className="py-1 text-right font-normal">{t("throttle")}</th>
                  <th className="py-1 text-right font-normal">{t("arrive")}</th>
                </tr>
              </thead>
              <tbody>
                {g.terminals.map((tr) => (
                  <tr key={tr.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={() => onSelect(tr.id)}>
                    <td className="py-1">{tr.name || "–"}</td>
                    <td className="py-1 text-right tabular-nums">{fmt(tr.power)} W</td>
                    <td className="py-1 text-right tabular-nums">{fmt(tr.path, 1)} kPa</td>
                    <td className="py-1 text-right tabular-nums">{tr.throttle > 0.05 ? `${fmt(tr.throttle, 1)} kPa` : t("critical")}</td>
                    <td className="py-1 text-right tabular-nums">{fmt(tr.tArrive, 1)} °C</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      {warnings.length > 0 && (
        <Notice>
          <ul className="list-disc space-y-0.5 pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}
    </Section>
  );
}
