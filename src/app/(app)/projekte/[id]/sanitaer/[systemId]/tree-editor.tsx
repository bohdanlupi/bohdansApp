"use client";

import { ArrowDown, ArrowUp, CornerDownRight, Plus, ShowerHead, Trash2, Ungroup } from "lucide-react";
import { useTranslations } from "next-intl";

import { NativeSelect } from "@/components/form";
import { fmt, NumberField } from "@/components/planning/fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { consumerLu, findNode, mapTree, newNode, type PipeResult, type SanNode, type SystemResult } from "@/lib/sanitary/network";
import { findSize, type PipeSize, rarReturnSizes, supplySizes } from "@/lib/sanitary/pipes";
import { mediumColors, sizeText } from "@/lib/sanitary/schema";
import { applianceKeys } from "@/lib/sanitary/w3";
import { cn } from "@/lib/utils";

/** Siblings array (and index) of a node. */
function siblingsOf(roots: SanNode[], id: string): { parent: SanNode | null; index: number } | null {
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

/** New pipe below a parent: same pipe system, circulation and storey as the parent; Strang after a Strang. */
const childPipe = (parent: SanNode | null): SanNode =>
  newNode("pipe", parent ? { system: parent.system, circulation: parent.circulation, riser: parent.riser, floor: parent.riser ? "" : parent.floor } : {});

export function TreeEditor({
  network,
  result,
  selected,
  editable,
  onSelect,
  onChange,
  top,
}: {
  network: SanNode[];
  result: SystemResult;
  selected: string | null;
  editable: boolean;
  onSelect: (id: string | null) => void;
  onChange: (fn: (roots: SanNode[]) => SanNode[]) => void;
  /** Shown above the Verteilung list, left of the element panel (the Prinzipschema). */
  top?: React.ReactNode;
}) {
  const t = useTranslations("sanitary.tree");
  const node = selected ? findNode(network, selected) : null;

  const patch = (id: string, p: Partial<SanNode>) => onChange((roots) => mapTree(roots, (n) => (n.id === id ? { ...n, ...p } : n)));
  const addChild = (id: string | null, child: SanNode) => {
    if (id === null) onChange((roots) => [...roots, child]);
    else onChange((roots) => mapTree(roots, (n) => (n.id === id ? { ...n, children: [...n.children, child] } : n)));
    onSelect(child.id);
  };
  const insertAfter = (id: string) => {
    const current = findNode(network, id);
    if (!current || current.type !== "pipe") return;
    const child = childPipe(current);
    onChange((roots) => mapTree(roots, (n) => (n.id === id ? { ...n, children: [{ ...child, children: n.children }] } : n)));
    onSelect(child.id);
  };
  const removeElement = (id: string) => {
    onChange((roots) => {
      const pos = siblingsOf(roots, id);
      const target = findNode(roots, id);
      if (!pos || !target) return roots;
      const splice = (arr: SanNode[]) => [...arr.slice(0, pos.index), ...target.children, ...arr.slice(pos.index + 1)];
      if (!pos.parent) return splice(roots);
      return mapTree(roots, (n) => (n.id === pos.parent!.id ? { ...n, children: splice(n.children) } : n));
    });
    onSelect(null);
  };
  const removeBranch = (id: string) => {
    onChange((roots) => mapTree(roots, (n) => (n.id === id ? null : n)));
    onSelect(null);
  };
  const move = (id: string, delta: number) =>
    onChange((roots) => {
      const pos = siblingsOf(roots, id);
      if (!pos) return roots;
      const reorder = (arr: SanNode[]) => {
        const j = pos.index + delta;
        if (j < 0 || j >= arr.length) return arr;
        const next = [...arr];
        [next[pos.index], next[j]] = [next[j], next[pos.index]];
        return next;
      };
      if (!pos.parent) return reorder(roots);
      return mapTree(roots, (n) => (n.id === pos.parent!.id ? { ...n, children: reorder(n.children) } : n));
    });

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="min-w-0 space-y-4">
        {top}
        <section className="rounded-xl border">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
            <h3 className="text-sm font-semibold">{t("title")}</h3>
            <span className="flex gap-3 text-xs text-muted-foreground">
              {(["pwc", "pwh", "pwhc"] as const).map((m) => (
                <span key={m} className="flex items-center gap-1">
                  <span className="inline-block h-1 w-4 rounded" style={{ backgroundColor: mediumColors[m] }} />
                  {m.toUpperCase().replace("PWHC", "PWH-C")}
                </span>
              ))}
            </span>
          </header>
          <div className="flex border-b px-3 py-1 text-[11px] text-muted-foreground">
            <span className="flex-1">{t("element")}</span>
            <span className="w-24 text-right">{t("sizes")}</span>
            <span className="w-16 text-right">LU</span>
            <span className="w-16 text-right">{t("circulation")}</span>
          </div>
          <ul className="py-1 text-sm">
            {network.length === 0 && <li className="px-3 py-1.5 text-muted-foreground">{t("empty")}</li>}
            {network.map((n) => (
              <Row key={n.id} node={n} depth={0} result={result} selected={selected} onSelect={onSelect} />
            ))}
          </ul>
          {editable && (
            <div className="border-t px-3 py-1.5">
              <Button variant="ghost" size="sm" onClick={() => addChild(null, newNode("pipe", { label: "" }))}>
                <Plus />
                {t("addRoot")}
              </Button>
            </div>
          )}
        </section>
      </div>

      <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start">
        {node ? (
          <NodePanel
            key={node.id}
            node={node}
            result={result.pipes.get(node.id)}
            editable={editable}
            onPatch={(p) => patch(node.id, p)}
            actions={
              editable && (
                <div className="flex flex-wrap gap-1.5">
                  {node.type === "pipe" && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => addChild(node.id, childPipe(node))}>
                        <Plus />
                        {t("addPipe")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => addChild(node.id, newNode("consumer", { floor: node.floor }))}>
                        <ShowerHead />
                        {t("addConsumer")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => insertAfter(node.id)} title={t("insertAfterHint")}>
                        <CornerDownRight />
                        {t("insertAfter")}
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="icon-sm" aria-label={t("up")} onClick={() => move(node.id, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={t("down")} onClick={() => move(node.id, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeElement(node.id)} title={t("removeElementHint")}>
                    <Ungroup />
                    {t("removeElement")}
                  </Button>
                  {node.children.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => removeBranch(node.id)}>
                      <Trash2 />
                      {t("removeBranch")}
                    </Button>
                  )}
                </div>
              )
            }
          />
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{t("selectHint")}</p>
        )}
      </aside>
    </div>
  );
}

function Row({ node, depth, result, selected, onSelect }: { node: SanNode; depth: number; result: SystemResult; selected: string | null; onSelect: (id: string) => void }) {
  const t = useTranslations("sanitary");
  const r = result.pipes.get(node.id);
  const lu = node.type === "consumer" ? consumerLu(node.appliances) : r?.lu;
  const kind = node.type === "consumer" ? t("tree.consumer") : node.riser ? t("tree.riser") : r?.role === "floor" ? t("tree.floorPipe") : t("tree.distPipe");
  const strang = r?.strang ? ` ${r.strang}` : "";
  const title = [node.label, node.floor].filter(Boolean).join(" · ");
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
          <span className="w-24 text-right text-xs tabular-nums">{r ? [r.pwc, r.pwh, r.pwhc].map((s) => (s ? sizeText(s.size) : null)).filter(Boolean).join("/") : ""}</span>
          <span className="w-16 text-right text-xs tabular-nums">{lu ? `${lu.cold}/${lu.warm}` : ""}</span>
          <span className="w-16 text-right text-xs tabular-nums">{r?.circ ? `${fmt(r.circ.flow)} l/h` : ""}</span>
        </button>
      </li>
      {node.children.map((c) => (
        <Row key={c.id} node={c} depth={depth + 1} result={result} selected={selected} onSelect={onSelect} />
      ))}
    </>
  );
}

function NodePanel({
  node,
  result,
  editable,
  onPatch,
  actions,
}: {
  node: SanNode;
  result: PipeResult | undefined;
  editable: boolean;
  onPatch: (p: Partial<SanNode>) => void;
  actions: React.ReactNode;
}) {
  const t = useTranslations("sanitary");
  const text = (key: "label" | "floor", label: string, max: number, placeholder?: string) => (
    <div className="space-y-1">
      <Label htmlFor={`node-${key}`} className="text-xs">
        {label}
      </Label>
      <input
        id={`node-${key}`}
        defaultValue={node[key]}
        maxLength={max}
        placeholder={placeholder}
        disabled={!editable}
        onBlur={(e) => e.target.value !== node[key] && onPatch({ [key]: e.target.value.trim() })}
        className="h-8 w-full rounded-lg border border-input bg-field px-2.5 text-sm outline-none focus:border-ring"
      />
    </div>
  );
  const check = (key: "riser" | "pwc" | "pwh" | "meter" | "shutoff", label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={node[key]} disabled={!editable} onChange={(e) => onPatch({ [key]: e.target.checked })} className="size-4 accent-brand" />
      {label}
    </label>
  );

  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{node.type === "consumer" ? t("tree.consumer") : t("tree.pipe")}</h3>
        {result?.strang && <span className="text-xs text-muted-foreground">{t("tree.strangNo", { n: result.strang })}</span>}
      </div>
      {actions}
      <div className="grid grid-cols-2 gap-2">
        {text("label", t("node.label"), 120)}
        {text("floor", t("node.floor"), 20, "EG, 1.OG …")}
      </div>

      {node.type === "consumer" ? (
        <ConsumerFields node={node} editable={editable} onPatch={onPatch} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("node.length")}</Label>
              <NumberField value={node.length} decimals={2} label={t("node.length")} disabled={!editable} onChange={(v) => onPatch({ length: v })} className="h-8 rounded-lg" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="node-role" className="text-xs">
                {t("node.role")}
              </Label>
              <NativeSelect id="node-role" value={node.role} disabled={!editable} onChange={(e) => onPatch({ role: e.target.value as SanNode["role"] })}>
                {(["auto", "distribution", "floor"] as const).map((r) => (
                  <option key={r} value={r}>
                    {t(`node.roles.${r}`)}
                    {r === "auto" && result ? ` (${t(`node.roles.${result.role}`)})` : ""}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {check("riser", t("node.riser"))}
            {check("shutoff", t("node.shutoff"))}
            {check("pwc", "PWC")}
            {check("pwh", "PWH")}
            {check("meter", t("node.meter"))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="node-system" className="text-xs">
                {t("node.system")}
              </Label>
              <NativeSelect
                id="node-system"
                value={node.system}
                disabled={!editable}
                onChange={(e) => onPatch({ system: e.target.value as SanNode["system"], sizePwc: null, sizePwh: null })}
              >
                <option value="optipress">Optipress-Aquaplus</option>
                <option value="optiflex">Optiflex</option>
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="node-circ" className="text-xs">
                {t("node.circulation")}
              </Label>
              <NativeSelect
                id="node-circ"
                value={node.circulation}
                disabled={!editable || !node.pwh}
                onChange={(e) => onPatch({ circulation: e.target.value as SanNode["circulation"], sizePwhc: null })}
              >
                {(["none", "conventional", "rar"] as const).map((c) => (
                  <option key={c} value={c}>
                    {t(`node.circulations.${c}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {node.pwc && <SizeSelect label="PWC" value={node.sizePwc} options={supplySizes(node.system)} auto={result?.pwc?.size} editable={editable} onChange={(v) => onPatch({ sizePwc: v })} />}
            {node.pwh && <SizeSelect label="PWH" value={node.sizePwh} options={supplySizes(node.system)} auto={result?.pwh?.size} editable={editable} onChange={(v) => onPatch({ sizePwh: v })} />}
            {node.circulation !== "none" && node.pwh && (
              <SizeSelect
                label="PWH-C"
                value={node.sizePwhc}
                options={node.circulation === "rar" ? rarReturnSizes() : supplySizes("optipress")}
                auto={result?.pwhc?.size}
                editable={editable}
                onChange={(v) => onPatch({ sizePwhc: v })}
              />
            )}
          </div>
          {node.riser && result?.strang && node.circulation !== "none" && (
            <div className="space-y-1">
              <Label htmlFor="node-reg" className="text-xs">
                {t("node.regValve")}
              </Label>
              <NativeSelect id="node-reg" value={node.regValve} disabled={!editable} onChange={(e) => onPatch({ regValve: e.target.value as SanNode["regValve"] })}>
                <option value="thermal">{t("node.regValves.thermal")}</option>
                <option value="manual">{t("node.regValves.manual")}</option>
              </NativeSelect>
            </div>
          )}
          {result && <PipeDetails result={result} />}
        </>
      )}
    </div>
  );
}

function SizeSelect({
  label,
  value,
  options,
  auto,
  editable,
  onChange,
}: {
  label: string;
  value: string | null;
  options: PipeSize[];
  auto: PipeSize | undefined;
  editable: boolean;
  onChange: (v: string | null) => void;
}) {
  const t = useTranslations("sanitary.node");
  const current = findSize(value);
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <NativeSelect value={current && options.includes(current) ? current.key : ""} disabled={!editable} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">
          {t("auto")}
          {auto && !current ? ` (${auto.label})` : ""}
        </option>
        {options.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

function PipeDetails({ result }: { result: PipeResult }) {
  const t = useTranslations("sanitary");
  const line = (label: string, value: string, tone?: "bad") => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right tabular-nums", tone === "bad" && "text-destructive")}>{value}</dd>
    </>
  );
  const sized = (medium: "pwc" | "pwh") => {
    const s = result[medium];
    if (!s) return null;
    const source = s.source === "table" ? t("results.sources.table", { table: s.table ?? "" }) : t(`results.sources.${s.source}`);
    return (
      <>
        {line(`${medium.toUpperCase()} · ${source}`, `${s.size.label} · ${fmt(s.flow, 2)} l/s · ${fmt(s.velocity, 2)} m/s`, s.velocity > s.limit ? "bad" : undefined)}
      </>
    );
  };
  const ins = result.insulation;
  const insulation = [
    ins.pwc ? `PWC ${ins.pwc} mm` : "",
    ins.pwh ? `PWH ${ins.pwh} mm` : "",
    ins.pwhc ? `PWH-C ${ins.pwhc} mm` : "",
    ins.shared ? t("results.sharedInsulation", { mm: ins.shared.mm, size: ins.shared.size.label }) : "",
  ].filter(Boolean);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t pt-2 text-xs">
      {line("LU", `${result.lu.cold} / ${result.lu.warm}`)}
      {sized("pwc")}
      {sized("pwh")}
      {result.pwhc && line(`PWH-C · ${t(`results.sources.${result.pwhc.source}`)}`, `${result.pwhc.size.label} · ${fmt(result.pwhc.velocity, 2)} m/s`)}
      {result.circ && (
        <>
          {line(t("results.sectionLoss"), `${fmt(result.circ.heatLoss, 3)} kWh/d`)}
          {line(t("results.circFlow"), `${fmt(result.circ.flow, 1)} l/h`)}
          {line("R PWH / PWH-C", `${fmt(result.circ.rPwh, 2)} / ${fmt(result.circ.rPwhc, 2)} mbar/m`)}
          {line("Δp", `${fmt(result.circ.dp, 1)} mbar`)}
          {line(t("results.cumulative"), `${fmt(result.circ.cumulative, 1)} mbar`)}
        </>
      )}
      {line(t("results.insulation"), insulation.join(" · ") || "–")}
    </dl>
  );
}

function ConsumerFields({ node, editable, onPatch }: { node: SanNode; editable: boolean; onPatch: (p: Partial<SanNode>) => void }) {
  const t = useTranslations("sanitary");
  const lu = consumerLu(node.appliances);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("node.appliancesHint")}</p>
      <div className="grid grid-cols-[1fr_4.5rem] items-center gap-x-2 gap-y-1">
        {applianceKeys.map((k) => (
          <div key={k} className="contents">
            <span className="text-sm">{t(`appliances.${k}`)}</span>
            <NumberField
              value={node.appliances[k] ?? null}
              decimals={0}
              label={t(`appliances.${k}`)}
              placeholder="0"
              disabled={!editable}
              onChange={(v) => onPatch({ appliances: { ...node.appliances, [k]: Math.min(999, Math.max(0, Math.round(v ?? 0))) || undefined } })}
              className="h-8 rounded-lg"
            />
          </div>
        ))}
      </div>
      <p className="border-t pt-2 text-sm tabular-nums">
        {t("results.luTotal", { cold: lu.cold, warm: lu.warm })}
      </p>
    </div>
  );
}
