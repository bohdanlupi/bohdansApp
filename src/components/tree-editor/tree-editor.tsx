"use client";

import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FolderPlus,
  ListPlus,
  Pilcrow,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/confirm-button";
import type { FormMessageKey } from "@/components/form";
import { Button } from "@/components/ui/button";
import { pickText, type I18nText } from "@/lib/i18n-text";
import { formatMoney, formatQty } from "@/lib/number-input";
import type { AppLanguage } from "@/lib/supabase/types";
import {
  childrenMap,
  flatten,
  groupTotals,
  insertionPoint,
  isPosition,
  positionTotal,
  type NodeKind,
  type TreeNode,
} from "@/lib/tree";
import { cn } from "@/lib/utils";

import { addTreeNode, deleteTreeNode, moveTreeNode, type TreeScope } from "@/lib/tree-actions";
import { CatalogPicker } from "./catalog-picker";
import { NodeDetail } from "./node-detail";

export type EditorNode = TreeNode & {
  short_text: I18nText;
  long_text: I18nText;
  unit: string | null;
  unit_price: number | null;
  quantity?: number | null;
  is_optional?: boolean;
  is_lump_sum?: boolean;
  price_date?: string | null;
};

export type Measurement = {
  id: string;
  lv_node_id: string;
  description: string | null;
  count: number;
  factor_a: number | null;
  factor_b: number | null;
  factor_c: number | null;
  result: number | null;
  sort: number;
};

type DropTarget = { id: string; where: "before" | "after" | "inside" };

export function TreeEditor({
  scope,
  nodes,
  measurements = [],
  language,
  editable,
  catalogs = [],
}: {
  scope: TreeScope;
  nodes: EditorNode[];
  measurements?: Measurement[];
  /** Language the texts are shown in (LV: document language, catalogue: UI language). */
  language: AppLanguage;
  editable: boolean;
  /** LV only: catalogues for "insert from catalogue". */
  catalogs?: { id: string; name: string }[];
}) {
  const t = useTranslations("tree");
  const tForms = useTranslations("forms");
  const isLv = scope.type === "lv";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [pending, startTransition] = useTransition();

  const rows = useMemo(() => flatten(nodes), [nodes]);
  const children = useMemo(() => childrenMap(nodes), [nodes]);
  const totals = useMemo(() => groupTotals(nodes), [nodes]);
  const measuredIds = useMemo(() => new Set(measurements.map((m) => m.lv_node_id)), [measurements]);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const visible = useMemo(() => {
    const hidden = new Set<string>();
    return rows.filter(({ node }) => {
      if (node.parent_id && (hidden.has(node.parent_id) || collapsed.has(node.parent_id))) {
        hidden.add(node.id);
        return false;
      }
      return true;
    });
  }, [rows, collapsed]);

  const run = (action: () => Promise<{ error?: string; id?: string }>, select?: boolean) =>
    startTransition(async () => {
      const result = await action();
      if (result.error) toast.error(tForms(result.error as FormMessageKey));
      else if (select && result.id) setSelectedId(result.id);
    });

  const add = (kind: NodeKind, asChild = false) => {
    const { parentId, beforeId } = insertionPoint(nodes, selectedId, kind, asChild);
    if (parentId) setCollapsed((c) => new Set([...c].filter((id) => id !== parentId)));
    run(() => addTreeNode(scope, { kind, parentId, beforeId }), true);
  };

  const siblingsOf = (node: EditorNode) => children.get(node.parent_id ?? "") ?? [];

  const moveBy = (offset: -1 | 1) => {
    if (!selected) return;
    const siblings = siblingsOf(selected);
    const index = siblings.findIndex((n) => n.id === selected.id);
    const target = index + offset;
    if (target < 0 || target >= siblings.length) return;
    // Before the node two places down when moving down, before the previous one when moving up.
    const beforeId = offset === -1 ? siblings[target].id : (siblings[target + 1]?.id ?? null);
    run(() => moveTreeNode(scope, selected.id, selected.parent_id, beforeId));
  };

  const onDrop = () => {
    if (!dragId || !drop) return;
    const target = nodes.find((n) => n.id === drop.id);
    setDrop(null);
    setDragId(null);
    if (!target || target.id === dragId) return;
    if (drop.where === "inside") {
      run(() => moveTreeNode(scope, dragId, target.id, null));
      return;
    }
    const siblings = siblingsOf(target).filter((n) => n.id !== dragId);
    const index = siblings.findIndex((n) => n.id === target.id);
    const beforeId = drop.where === "before" ? target.id : (siblings[index + 1]?.id ?? null);
    run(() => moveTreeNode(scope, dragId, target.parent_id, beforeId));
  };

  const label = (node: EditorNode) => {
    const text = pickText(node.short_text, language);
    return { text: text.value || t(`untitled.${node.kind}`), missing: text.missing && Boolean(text.value), empty: !text.value };
  };

  const toolbarButton = (icon: React.ReactNode, text: string, onClick: () => void, disabled = false) => (
    <Button variant="outline" size="sm" onClick={onClick} disabled={pending || disabled} title={text} aria-label={text}>
      {icon}
      <span className="hidden xl:inline">{text}</span>
    </Button>
  );

  const siblings = selected ? siblingsOf(selected) : [];
  const selectedIndex = selected ? siblings.findIndex((n) => n.id === selected.id) : -1;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_26rem] 2xl:grid-cols-[minmax(0,1fr)_32rem]">
      <div className="min-w-0 rounded-xl border">
        {editable && (
          <div className="flex flex-wrap items-center gap-1.5 border-b p-2">
            {toolbarButton(<FolderPlus />, t("addGroup"), () => add("group"))}
            {toolbarButton(<ListPlus />, t("addSubgroup"), () => add("group", true), selected?.kind !== "group")}
            {toolbarButton(<FilePlus2 />, isLv ? t("addRPosition") : t("addPosition"), () => add(isLv ? "r_position" : "position"))}
            {toolbarButton(<Pilcrow />, t("addText"), () => add("text"))}
            {isLv && toolbarButton(<BookOpen />, t("fromCatalog"), () => setPickerOpen(true))}
            <div className="ml-auto flex gap-1.5">
              {toolbarButton(<ArrowUp />, t("moveUp"), () => moveBy(-1), selectedIndex <= 0)}
              {toolbarButton(<ArrowDown />, t("moveDown"), () => moveBy(1), selectedIndex === -1 || selectedIndex >= siblings.length - 1)}
              {selected && (
                <ConfirmButton
                  variant="outline"
                  size="sm"
                  label={t("delete")}
                  trigger={<Trash2 />}
                  title={t("delete")}
                  text={t("deleteConfirm", { name: `${selected.number ?? ""} ${label(selected).text}`.trim() })}
                  confirmLabel={t("delete")}
                  onConfirm={async () => {
                    const result = await deleteTreeNode(scope, selected.id);
                    if (!result.error) setSelectedId(null);
                    return result;
                  }}
                />
              )}
            </div>
          </div>
        )}

        {nodes.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">{editable ? t("empty") : t("emptyReadOnly")}</p>
        ) : (
          <div
            role="tree"
            tabIndex={0}
            className="max-h-[calc(100vh-15rem)] overflow-auto py-1 text-sm outline-none"
            onKeyDown={(e) => {
              if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
              e.preventDefault();
              const index = visible.findIndex(({ node }) => node.id === selectedId);
              const next = visible[Math.min(visible.length - 1, Math.max(0, index + (e.key === "ArrowDown" ? 1 : -1)))];
              if (next) setSelectedId(next.node.id);
            }}
          >
            {visible.map(({ node, depth }) => {
              const { text, missing, empty } = label(node);
              const isGroup = node.kind === "group";
              const hasChildren = (children.get(node.id)?.length ?? 0) > 0;
              const isCollapsed = collapsed.has(node.id);
              const dropHere = drop?.id === node.id ? drop.where : null;
              return (
                <div
                  key={node.id}
                  role="treeitem"
                  aria-selected={node.id === selectedId}
                  aria-expanded={isGroup && hasChildren ? !isCollapsed : undefined}
                  draggable={editable}
                  onDragStart={(e) => {
                    setDragId(node.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDrop(null);
                  }}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = (e.clientY - rect.top) / rect.height;
                    const where = isGroup && y > 0.35 && y < 0.75 ? "inside" : y < 0.5 ? "before" : "after";
                    if (dropHere !== where) setDrop({ id: node.id, where });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDrop();
                  }}
                  onClick={() => setSelectedId(node.id)}
                  className={cn(
                    "relative flex cursor-pointer items-center gap-2 py-1.5 pr-3 select-none hover:bg-muted/60",
                    node.id === selectedId && "bg-brand/10 hover:bg-brand/15",
                    isGroup && "font-semibold",
                    node.is_optional && "text-muted-foreground italic",
                    dragId === node.id && "opacity-40",
                    dropHere === "inside" && "ring-2 ring-brand ring-inset",
                  )}
                  style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
                >
                  {dropHere === "before" && <span className="absolute inset-x-0 top-0 h-0.5 bg-brand" />}
                  {dropHere === "after" && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand" />}
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={isCollapsed ? t("expand") : t("collapse")}
                    className={cn("size-4 shrink-0 text-muted-foreground", !(isGroup && hasChildren) && "invisible")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsed((c) => {
                        const next = new Set(c);
                        if (next.has(node.id)) next.delete(node.id);
                        else next.add(node.id);
                        return next;
                      });
                    }}
                  >
                    {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>
                  <span className="w-20 shrink-0 font-mono text-xs tabular-nums">
                    {node.kind === "r_position" && <span className="mr-0.5 text-brand">R</span>}
                    {node.number}
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate", empty && "text-muted-foreground italic", node.kind === "text" && "text-muted-foreground")}>
                    {text}
                    {missing && (
                      <span className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-500 align-middle" title={t("missingTranslation")} />
                    )}
                  </span>
                  {node.is_optional && <span className="shrink-0 rounded border px-1 text-[10px] not-italic">{t("optionalBadge")}</span>}
                  {isPosition(node.kind) && (
                    <span className="hidden shrink-0 text-right text-xs text-muted-foreground tabular-nums sm:block">
                      {isLv ? (
                        <>
                          {node.is_lump_sum ? t("lumpSumUnit") : `${formatQty(node.quantity)} ${node.unit ?? ""}`}
                          {measuredIds.has(node.id) && <span title={t("measurements.title")}> ∑</span>}
                        </>
                      ) : (
                        node.unit
                      )}
                    </span>
                  )}
                  <span className="w-28 shrink-0 text-right tabular-nums">
                    {isPosition(node.kind)
                      ? isLv
                        ? node.unit_price !== null && formatMoney(positionTotal(node))
                        : formatMoney(node.unit_price)
                      : isGroup && isLv && totals.get(node.id)
                        ? formatMoney(totals.get(node.id))
                        : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {isLv && nodes.length > 0 && (
          <div className="flex items-center justify-between border-t bg-muted/40 px-4 py-2.5 text-sm font-semibold">
            <span>{t("totalExclOptional")}</span>
            <span className="tabular-nums">CHF {formatMoney(totals.get("") ?? 0)}</span>
          </div>
        )}
      </div>

      <div className="lg:sticky lg:top-4">
        {selected ? (
          <NodeDetail
            key={selected.id}
            scope={scope}
            node={selected}
            language={language}
            editable={editable}
            measurements={measurements.filter((m) => m.lv_node_id === selected.id)}
          />
        ) : (
          <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
            {t("selectHint")}
          </p>
        )}
      </div>

      {isLv && editable && (
        <CatalogPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          catalogs={catalogs}
          language={language}
          lvId={scope.id}
          target={insertionPoint(nodes, selectedId, "position")}
          onInserted={(id) => setSelectedId(id ?? null)}
        />
      )}
    </div>
  );
}
