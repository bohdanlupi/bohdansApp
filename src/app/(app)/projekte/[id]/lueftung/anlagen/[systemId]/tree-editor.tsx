"use client";

import { ArrowDown, ArrowUp, CornerDownRight, Plus, Trash2, Ungroup } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { NativeSelect } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { findNode, mapTree, type NetNode, newNode, type NodeResult, type NodeType, type RoomFlow, type SystemData, type SystemResult } from "@/lib/kwl/network";
import {
  bendAngles,
  bendFor,
  bendZeta,
  coverCurve,
  coverProducts,
  curveGroup,
  findProduct,
  measuredCoverPrefix,
  measuredCovers,
  type Product,
  productCurve,
  productGroup,
  products,
} from "@/lib/kwl/products";
import { ductMaterials, type DuctMaterial } from "@/lib/kwl/pressure";
import { airColors } from "@/lib/kwl/schema-layout";
import { cn } from "@/lib/utils";

import { fmt, NumberField } from "@/components/planning/fields";

type ListKey = "outdoor" | "supply" | "extract" | "exhaust";
const lists: ListKey[] = ["outdoor", "supply", "extract", "exhaust"];
const nodeTypes: NodeType[] = ["duct", "bend", "tee", "distributor", "component", "terminal"];
/** Products that fit a node type (fittings by their role). */
function productOptions(type: NodeType): Product[] {
  switch (type) {
    case "duct":
      return products.filter((p) => p.kind === "duct");
    case "bend":
      return products.filter((p) => p.kind === "fitting" && p.fitting === "bend");
    case "tee":
      return products.filter((p) => p.kind === "fitting" && p.fitting === "tee");
    case "distributor":
      return products.filter((p) => p.kind === "distributor");
    case "terminal":
      return products.filter((p) => p.kind === "terminal" || p.kind === "grille" || p.kind === "valve");
    default:
      return products.filter(
        (p) => !["device", "duct", "distributor"].includes(p.kind) && !(p.kind === "fitting" && (p.fitting === "bend" || p.fitting === "tee")),
      );
  }
}

/** Options grouped by manufacturer · family, in data order. */
function groupedOptions(list: Product[]) {
  const groups = new Map<string, Product[]>();
  for (const p of list) {
    const g = productGroup(p);
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  return [...groups.entries()];
}

/** The list a node lives in. */
function listOf(data: SystemData, id: string): ListKey | null {
  for (const key of lists) if (findNode(data[key], id)) return key;
  return null;
}

/** Siblings array (and index) of a node. */
function siblingsOf(roots: NetNode[], id: string): { parent: NetNode | null; index: number } | null {
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

export function TreeEditor({
  data,
  rooms,
  result,
  selected,
  editable,
  onSelect,
  onChange,
}: {
  data: SystemData;
  rooms: RoomFlow[];
  result: SystemResult;
  selected: string | null;
  editable: boolean;
  onSelect: (id: string | null) => void;
  onChange: (change: (data: SystemData) => SystemData) => void;
}) {
  const t = useTranslations("kwlSystem");
  const [newType, setNewType] = useState<NodeType>("duct");
  const selectedList = selected ? listOf(data, selected) : null;
  const selectedNode = selected && selectedList ? findNode(data[selectedList], selected) : null;
  const resultOf = (id: string): NodeResult | undefined =>
    result.supply.nodes.get(id) ?? result.extract.nodes.get(id) ?? result.outdoor.nodes.get(id) ?? result.exhaust.nodes.get(id);

  const setList = (key: ListKey, fn: (roots: NetNode[]) => NetNode[]) => onChange((d) => ({ ...d, [key]: fn(d[key]) }));
  const patchNode = (id: string, patch: Partial<NetNode>) => {
    const key = listOf(data, id);
    if (key) setList(key, (roots) => mapTree(roots, (n) => (n.id === id ? { ...n, ...patch } : n)));
  };
  const isChain = (key: ListKey) => key === "outdoor" || key === "exhaust";

  const append = (key: ListKey) => {
    const node = newNode(isChain(key) ? (newType === "terminal" || newType === "tee" || newType === "distributor" ? "component" : newType) : newType);
    setList(key, (roots) => [...roots, node]);
    onSelect(node.id);
  };
  const insertAfter = (id: string) => {
    const key = listOf(data, id)!;
    const node = newNode(newType === "terminal" && isChain(key) ? "component" : newType);
    if (isChain(key)) {
      setList(key, (roots) => {
        const i = roots.findIndex((n) => n.id === id);
        return [...roots.slice(0, i + 1), node, ...roots.slice(i + 1)];
      });
    } else {
      // Series: the new element takes over the children of the selected one.
      setList(key, (roots) => mapTree(roots, (n) => (n.id === id ? { ...n, children: [{ ...node, children: n.children }] } : n)));
    }
    onSelect(node.id);
  };
  const addBranch = (id: string) => {
    const key = listOf(data, id)!;
    const node = newNode(newType);
    setList(key, (roots) => mapTree(roots, (n) => (n.id === id ? { ...n, children: [...n.children, node] } : n)));
    onSelect(node.id);
  };
  const removeElement = (id: string) => {
    const key = listOf(data, id)!;
    setList(key, (roots) => {
      const pos = siblingsOf(roots, id);
      if (!pos) return roots;
      const node = findNode(roots, id)!;
      const splice = (arr: NetNode[]) => [...arr.slice(0, pos.index), ...node.children, ...arr.slice(pos.index + 1)];
      if (!pos.parent) return splice(roots);
      return mapTree(roots, (n) => (n.id === pos.parent!.id ? { ...n, children: splice(n.children) } : n));
    });
    onSelect(null);
  };
  const removeBranch = (id: string) => {
    const key = listOf(data, id)!;
    setList(key, (roots) => mapTree(roots, (n) => (n.id === id ? null : n)));
    onSelect(null);
  };
  const move = (id: string, delta: number) => {
    const key = listOf(data, id)!;
    setList(key, (roots) => {
      const pos = siblingsOf(roots, id);
      if (!pos) return roots;
      const reorder = (arr: NetNode[]) => {
        const next = [...arr];
        const j = pos.index + delta;
        if (j < 0 || j >= next.length) return arr;
        [next[pos.index], next[j]] = [next[j], next[pos.index]];
        return next;
      };
      if (!pos.parent) return reorder(roots);
      return mapTree(roots, (n) => (n.id === pos.parent!.id ? { ...n, children: reorder(n.children) } : n));
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-3">
        {lists.map((key) => (
          <section key={key} className="rounded-xl border">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <span className="inline-block h-1 w-5 rounded" style={{ backgroundColor: airColors[key] }} />
                {t(`lists.${key}`)}
              </h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {key === "outdoor" || key === "exhaust"
                  ? `${fmt(result[key].flow)} m³/h · ${fmt(result[key].total, 1) || "0"} Pa`
                  : `${fmt(result[key].flow)} m³/h · ${t("criticalShort")} ${fmt(result[key].critical, 1) || "0"} Pa`}
              </span>
            </header>
            <ul className="py-1 text-sm">
              {data[key].length === 0 && <li className="px-3 py-1.5 text-muted-foreground">{t("noElements")}</li>}
              {data[key].map((n) => (
                <TreeRow key={n.id} node={n} depth={0} selected={selected} resultOf={resultOf} rooms={rooms} onSelect={onSelect} />
              ))}
            </ul>
            {editable && (
              <div className="border-t px-3 py-1.5">
                <Button variant="ghost" size="sm" onClick={() => append(key)}>
                  <Plus />
                  {t("append", { type: t(`types.${newType}`) })}
                </Button>
              </div>
            )}
          </section>
        ))}
      </div>

      <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start">
        {editable && (
          <div className="space-y-1.5 rounded-xl border p-3">
            <Label htmlFor="new-type">{t("newType")}</Label>
            <NativeSelect id="new-type" value={newType} onChange={(e) => setNewType(e.target.value as NodeType)}>
              {nodeTypes.map((type) => (
                <option key={type} value={type}>
                  {t(`types.${type}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        {selectedNode && selectedList ? (
          <NodePanel
            key={selectedNode.id}
            node={selectedNode}
            list={selectedList}
            result={resultOf(selectedNode.id)}
            rooms={rooms}
            editable={editable}
            onPatch={(patch) => patchNode(selectedNode.id, patch)}
            actions={
              editable && (
                <div className="flex flex-wrap gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => insertAfter(selectedNode.id)} title={t("insertAfterHint")}>
                    <CornerDownRight />
                    {t("insertAfter")}
                  </Button>
                  {!isChain(selectedList) && (
                    <Button variant="outline" size="sm" onClick={() => addBranch(selectedNode.id)} title={t("addBranchHint")}>
                      <Plus />
                      {t("addBranch")}
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-sm" aria-label={t("up")} onClick={() => move(selectedNode.id, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={t("down")} onClick={() => move(selectedNode.id, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeElement(selectedNode.id)} title={t("removeElementHint")}>
                    <Ungroup />
                    {t("removeElement")}
                  </Button>
                  {selectedNode.children.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => removeBranch(selectedNode.id)}>
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

function TreeRow({
  node,
  depth,
  selected,
  resultOf,
  rooms,
  onSelect,
}: {
  node: NetNode;
  depth: number;
  selected: string | null;
  resultOf: (id: string) => NodeResult | undefined;
  rooms: RoomFlow[];
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("kwlSystem");
  const r = resultOf(node.id);
  const product = findProduct(node.product);
  const room = node.type === "terminal" ? rooms.find((x) => x.calcId === node.calcId && x.roomId === node.roomId) : null;
  const tooFast = r?.velocity != null && r.velocityLimit != null && r.velocity > r.velocityLimit;
  const title = [node.label, product?.name, room?.name].filter(Boolean).join(" · ") || t(`types.${node.type}`);

  return (
    <>
      <li>
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className={cn("flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-muted/50", selected === node.id && "bg-brand/10")}
          style={{ paddingLeft: `${0.75 + depth * 1.1}rem` }}
        >
          <span className="w-20 shrink-0 text-xs text-muted-foreground">{t(`types.${node.type}`)}</span>
          <span className="min-w-0 flex-1 truncate">
            {title}
            {node.type === "duct" && node.length ? ` · ${fmt(node.length, 1)} m${node.count > 1 ? ` · ${node.count}×` : ""}` : ""}
          </span>
          {r?.source === "none" && node.type !== "tee" && <span className="text-xs text-amber-700 dark:text-amber-400">{t("noData")}</span>}
          <span className="w-16 text-right text-xs tabular-nums">{fmt(r?.flow)}</span>
          <span className={cn("w-14 text-right text-xs tabular-nums", tooFast && "text-destructive")}>{r?.velocity != null ? `${fmt(r.velocity, 1)} m/s` : ""}</span>
          <span className="w-14 text-right text-xs tabular-nums">{r ? `${fmt(r.dp, 1) || "0"} Pa` : ""}</span>
        </button>
      </li>
      {node.children.map((c) => (
        <TreeRow key={c.id} node={c} depth={depth + 1} selected={selected} resultOf={resultOf} rooms={rooms} onSelect={onSelect} />
      ))}
    </>
  );
}

function NodePanel({
  node,
  list,
  result,
  rooms,
  editable,
  onPatch,
  actions,
}: {
  node: NetNode;
  list: ListKey;
  result: NodeResult | undefined;
  rooms: RoomFlow[];
  editable: boolean;
  onPatch: (patch: Partial<NetNode>) => void;
  actions: React.ReactNode;
}) {
  const t = useTranslations("kwlSystem");
  const product = findProduct(node.product);
  const options = groupedOptions(productOptions(node.type));
  const side = list === "supply" || list === "outdoor" ? "supply" : "extract";
  const numberField = (key: keyof NetNode, label: string, decimals = 1, placeholder?: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <NumberField
        value={node[key] as number | null}
        decimals={decimals}
        label={label}
        placeholder={placeholder}
        disabled={!editable}
        onChange={(v) => onPatch({ [key]: v } as Partial<NetNode>)}
        className="h-8 rounded-lg"
      />
    </div>
  );

  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{t(`types.${node.type}`)}</h3>
        <span className="text-xs text-muted-foreground">{t(`lists.${list}`)}</span>
      </div>
      {actions}
      <div className="space-y-1">
        <Label htmlFor="node-label" className="text-xs">
          {t("label")}
        </Label>
        <input
          id="node-label"
          defaultValue={node.label}
          maxLength={120}
          disabled={!editable}
          onBlur={(e) => e.target.value !== node.label && onPatch({ label: e.target.value })}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring"
        />
      </div>

      {node.type === "terminal" && <TerminalFields node={node} side={side} editable={editable} onPatch={onPatch} result={result} />}

      {node.type !== "terminal" && (
      <div className="space-y-1">
        <Label htmlFor="node-product" className="text-xs">
          {t("product")}
        </Label>
        <NativeSelect
          id="node-product"
          value={node.product ?? ""}
          disabled={!editable}
          onChange={(e) => onPatch({ product: e.target.value || null, curve: null })}
        >
          <option value="">{node.type === "duct" || node.type === "bend" ? t("customDuct") : t("manualValue")}</option>
          {options.map(([group, list]) => (
            <optgroup key={group} label={group}>
              {list.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </NativeSelect>
        {product?.source && (
          <p className="text-xs text-muted-foreground">
            {t("sourceRef", { file: product.source.file, page: product.source.page ?? "–" })}
          </p>
        )}
      </div>
      )}

      {node.type !== "terminal" && product && product.curves.length > 1 && (
        <div className="space-y-1">
          <Label htmlFor="node-curve" className="text-xs">
            {t("curve")}
          </Label>
          <NativeSelect id="node-curve" value={productCurve(product, node.curve, side)?.label} disabled={!editable} onChange={(e) => onPatch({ curve: e.target.value })}>
            {product.curves.map((c) => (
              <option key={c.label} value={c.label}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      {(node.type === "duct" || node.type === "bend") && (
        <div className="grid grid-cols-2 gap-2">
          {node.type === "duct" && numberField("length", t("length"), 2)}
          <div className="space-y-1">
            <Label className="text-xs">{t("count")}</Label>
            <NumberField
              value={node.count}
              decimals={0}
              label={t("count")}
              disabled={!editable}
              onChange={(v) => onPatch({ count: Math.min(50, Math.max(1, Math.round(v ?? 1))) })}
              className="h-8 rounded-lg"
            />
          </div>
          {numberField("zeta", t("zeta"), 2)}
          {!product && (
            <>
              {numberField("diameter", t("diameter"), 0)}
              <div className="space-y-1">
                <Label className="text-xs">{t("material")}</Label>
                <NativeSelect value={node.material} disabled={!editable} onChange={(e) => onPatch({ material: e.target.value as DuctMaterial })}>
                  {(Object.keys(ductMaterials) as DuctMaterial[]).map((m) => (
                    <option key={m} value={m}>
                      {t(`materials.${m}`)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {numberField("width", t("width"), 0)}
              {numberField("height", t("height"), 0)}
            </>
          )}
        </div>
      )}

      {node.type === "duct" && <BendFields node={node} duct={product} editable={editable} onPatch={onPatch} />}

      {node.type !== "duct" && node.type !== "bend" && node.type !== "terminal" && !product && (
        <div className="grid grid-cols-2 gap-2">
          {numberField("dpRef", t("dpRef"), 1)}
          {numberField("qRef", t("qRef"), 0, result ? fmt(result.flow) : undefined)}
        </div>
      )}

      {node.type === "terminal" && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="node-room" className="text-xs">
              {t("room")}
            </Label>
            <NativeSelect
              id="node-room"
              value={node.calcId && node.roomId ? `${node.calcId}|${node.roomId}` : ""}
              disabled={!editable}
              onChange={(e) => {
                const [calcId, roomId] = e.target.value ? e.target.value.split("|") : [null, null];
                onPatch({ calcId, roomId });
              }}
            >
              <option value="">{t("noRoom")}</option>
              {rooms
                .filter((r) => r[side] > 0 || (r.calcId === node.calcId && r.roomId === node.roomId))
                .map((r) => (
                  <option key={`${r.calcId}|${r.roomId}`} value={`${r.calcId}|${r.roomId}`}>
                    {[r.floor, r.name].filter(Boolean).join(" · ")} ({fmt(r[side])} m³/h)
                  </option>
                ))}
            </NativeSelect>
          </div>
          {numberField("flow", t("fixedFlow"), 0)}
        </div>
      )}

      {result && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-2 text-sm">
          <dt className="text-muted-foreground">{t("flow")}</dt>
          <dd className="text-right tabular-nums">{fmt(result.flow)} m³/h</dd>
          {result.velocity != null && (
            <>
              <dt className="text-muted-foreground">{t("velocity")}</dt>
              <dd className={cn("text-right tabular-nums", result.velocityLimit != null && result.velocity > result.velocityLimit && "text-destructive")}>
                {fmt(result.velocity, 2)} m/s (≤ {fmt(result.velocityLimit, 1)})
              </dd>
            </>
          )}
          {result.r != null && (
            <>
              <dt className="text-muted-foreground">R</dt>
              <dd className="text-right tabular-nums">{fmt(result.r, 2)} Pa/m</dd>
            </>
          )}
          {result.bendsDp != null && (
            <>
              <dt className="text-muted-foreground">{t("bendsDp")}</dt>
              <dd className="text-right tabular-nums">{fmt(result.bendsDp, 1)} Pa</dd>
            </>
          )}
          {result.parts?.map((p, i) => (
            <PartRow key={i} label={p.role === "combined" ? t("partCombined", { name: p.label }) : p.role === "case" ? t("partCase", { name: p.label }) : t("partCover", { name: p.label })}>
              {p.dp === null ? (p.role === "case" ? t("partCaseNone") : t("noData")) : `${fmt(p.dp, 1) || "0"} Pa`}
            </PartRow>
          ))}
          <dt className="text-muted-foreground">{result.parts ? t("partTotal") : "Δp"}</dt>
          <dd className="text-right font-medium tabular-nums">{fmt(result.dp, 1) || "0"} Pa</dd>
          <dt className="text-muted-foreground">{t("cumulative")}</dt>
          <dd className="text-right tabular-nums">{fmt(result.cumulative, 1) || "0"} Pa</dd>
          <dt className="text-muted-foreground">{t("dataSource")}</dt>
          <dd className="text-right">{t(`sources.${result.source}`)}</dd>
        </dl>
      )}
    </div>
  );
}

function PartRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="col-span-2 text-xs text-muted-foreground">{label}</dt>
      <dd className="col-span-2 -mt-1 text-right text-xs tabular-nums">{children}</dd>
    </>
  );
}

/**
 * Terminal = Auslass (ComfoCase) + cover (grille / disc valve). Covers measured together with the case come from
 * the case datasheet; separate covers bring their own curve (setting), the Auslass then gets a manual allowance.
 */
function TerminalFields({
  node,
  side,
  result,
  editable,
  onPatch,
}: {
  node: NetNode;
  side: "supply" | "extract";
  result: NodeResult | undefined;
  editable: boolean;
  onPatch: (patch: Partial<NetNode>) => void;
}) {
  const t = useTranslations("kwlSystem");
  const casing = findProduct(node.product);
  const cases = groupedOptions(products.filter((p) => p.kind === "terminal"));
  const measured = measuredCovers(casing);
  const { fitting, others } = coverProducts(casing);
  const measuredGroup = node.cover?.startsWith(measuredCoverPrefix) ? node.cover.slice(measuredCoverPrefix.length) : null;
  const coverProduct = measuredGroup ? null : findProduct(node.cover);
  const groupCurves = measuredGroup && casing ? casing.curves.filter((c) => curveGroup(c.label) === measuredGroup) : [];
  const groupCurve = groupCurves.find((c) => c.label === node.curve) ?? groupCurves.find((c) => c.use === side) ?? groupCurves[0];
  const shortLabel = (label: string) => (measuredGroup && label.startsWith(measuredGroup) ? label.slice(measuredGroup.length).replace(/^,\s*/, "") || label : label);
  const number = (key: "dpRef" | "qRef", label: string, decimals: number, placeholder?: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <NumberField value={node[key]} decimals={decimals} label={label} placeholder={placeholder} disabled={!editable} onChange={(v) => onPatch({ [key]: v })} className="h-8 rounded-lg" />
    </div>
  );

  const changeCase = (key: string | null) => {
    const next = findProduct(key);
    // A measured cover only exists with its case; a separate cover stays.
    const keep = node.cover && !node.cover.startsWith(measuredCoverPrefix) ? { cover: node.cover, coverCurve: node.coverCurve } : { cover: null, coverCurve: null };
    const curve = productCurve(next, null, side);
    const measuredDefault = !keep.cover && curve ? { cover: measuredCoverPrefix + curveGroup(curve.label), curve: curve.label } : { curve: null };
    onPatch({ product: key, ...keep, ...measuredDefault });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="node-case" className="text-xs">
          {t("case")}
        </Label>
        <NativeSelect id="node-case" value={node.product ?? ""} disabled={!editable} onChange={(e) => changeCase(e.target.value || null)}>
          <option value="">{t("noCase")}</option>
          {cases.map(([group, list]) => (
            <optgroup key={group} label={group}>
              {list.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </NativeSelect>
        {casing?.source && <p className="text-xs text-muted-foreground">{t("sourceRef", { file: casing.source.file, page: casing.source.page ?? "–" })}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="node-cover" className="text-xs">
          {t("cover")}
        </Label>
        <NativeSelect
          id="node-cover"
          value={node.cover ?? ""}
          disabled={!editable}
          onChange={(e) => onPatch({ cover: e.target.value || null, curve: null, coverCurve: null })}
        >
          <option value="">{t("noCover")}</option>
          {casing && measured.length > 0 && (
            <optgroup label={t("measuredWith", { name: casing.name })}>
              {measured.map((g) => (
                <option key={g} value={measuredCoverPrefix + g}>
                  {g}
                </option>
              ))}
            </optgroup>
          )}
          {fitting.length > 0 && (
            <optgroup label={t("fittingCovers")}>
              {fitting.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
          {groupedOptions(others).map(([group, list]) => (
            <optgroup key={group} label={group}>
              {list.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </NativeSelect>
        {coverProduct?.source && <p className="text-xs text-muted-foreground">{t("sourceRef", { file: coverProduct.source.file, page: coverProduct.source.page ?? "–" })}</p>}
      </div>

      {groupCurves.length > 1 && (
        <div className="space-y-1">
          <Label htmlFor="node-curve" className="text-xs">
            {t("coverCurve")}
          </Label>
          <NativeSelect id="node-curve" value={groupCurve?.label} disabled={!editable} onChange={(e) => onPatch({ curve: e.target.value })}>
            {groupCurves.map((c) => (
              <option key={c.label} value={c.label}>
                {shortLabel(c.label)}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      {coverProduct && coverProduct.curves.length > 1 && (
        <div className="space-y-1">
          <Label htmlFor="node-cover-curve" className="text-xs">
            {t("coverCurve")}
          </Label>
          <NativeSelect id="node-cover-curve" value={coverCurve(coverProduct, node.coverCurve, side, result?.flow ?? 0)?.label} disabled={!editable} onChange={(e) => onPatch({ coverCurve: e.target.value })}>
            {coverProduct.curves.map((c) => (
              <option key={c.label} value={c.label}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      {/* Without a cover: the case curve as before; neither case nor cover: manual value. */}
      {!node.cover && casing && casing.curves.length > 1 && (
        <div className="space-y-1">
          <Label htmlFor="node-curve" className="text-xs">
            {t("curve")}
          </Label>
          <NativeSelect id="node-curve" value={productCurve(casing, node.curve, side)?.label} disabled={!editable} onChange={(e) => onPatch({ curve: e.target.value })}>
            {casing.curves.map((c) => (
              <option key={c.label} value={c.label}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      {coverProduct && casing && (
        <div className="space-y-1">
          <div className="grid grid-cols-2 gap-2">
            {number("dpRef", t("caseAllowance"), 1)}
            {number("qRef", t("qRef"), 0, result ? fmt(result.flow) : undefined)}
          </div>
          <p className="text-xs text-muted-foreground">{t("caseAllowanceHint")}</p>
        </div>
      )}
      {measuredGroup && <p className="text-xs text-muted-foreground">{t("measuredHint")}</p>}
      {!node.cover && !casing && (
        <div className="grid grid-cols-2 gap-2">
          {number("dpRef", t("dpRef"), 1)}
          {number("qRef", t("qRef"), 0, result ? fmt(result.flow) : undefined)}
        </div>
      )}
    </div>
  );
}

/** Bends of a duct: number per angle (per duct); the fitting of the duct system is used for Δp and the LV. */
function BendFields({ node, duct, editable, onPatch }: { node: NetNode; duct: Product | null; editable: boolean; onPatch: (patch: Partial<NetNode>) => void }) {
  const t = useTranslations("kwlSystem");
  const used = bendAngles.filter((a) => node.bendCounts[a] > 0);
  return (
    <div className="space-y-1">
      <Label className="text-xs">{t("bends")}</Label>
      <div className="grid grid-cols-5 gap-1.5">
        {bendAngles.map((angle) => (
          <div key={angle} className="space-y-0.5">
            <span className="block text-center text-[11px] text-muted-foreground">{angle}°</span>
            <NumberField
              value={node.bendCounts[angle] || null}
              decimals={0}
              label={`${t("bends")} ${angle}°`}
              placeholder="0"
              disabled={!editable}
              onChange={(v) => onPatch({ bendCounts: { ...node.bendCounts, [angle]: Math.min(100, Math.max(0, Math.round(v ?? 0))) } })}
              className="h-8 rounded-lg px-1.5 text-center"
            />
          </div>
        ))}
      </div>
      {used.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {used.map((angle) => {
            const fitting = bendFor(duct, angle);
            return (
              <li key={angle}>
                {node.bendCounts[angle]} × {angle}°: {fitting ? fitting.name : t("bendReference", { zeta: fmt(bendZeta[angle], 2) })}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
