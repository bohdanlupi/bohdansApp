"use client";

import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { pickText, type I18nText } from "@/lib/i18n-text";
import { formatMoney } from "@/lib/number-input";
import type { AppLanguage } from "@/lib/supabase/types";
import { CATALOG_PAGE_SIZE, isPosition } from "@/lib/tree";
import { getCatalogChildren, searchCatalog, type CatalogBrowseNode, type CatalogSearchHit } from "@/lib/tree-actions";
import { cn } from "@/lib/utils";

type Level = { rows: CatalogBrowseNode[]; more: boolean };

const SEARCH_LIMIT = 200;

/**
 * Catalogue tree that loads one group at a time, plus a server-side search. Used read-only on the
 * catalogue page (select an entry → detail) and with checkboxes in the "insert from catalogue" dialog.
 * Render it with `key={catalogId}` so switching catalogues starts from a fresh state.
 */
export function CatalogBrowser({
  catalogId,
  language,
  checked,
  onToggle,
  selectedId,
  onSelect,
  toolbar,
  listClassName,
}: {
  catalogId: string;
  language: AppLanguage;
  /** Pick mode: checked entries (a checked group includes its whole subtree). */
  checked?: Set<string>;
  onToggle?: (id: string) => void;
  /** View mode: the selected entry. */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Controls shown left of the search field. */
  toolbar?: React.ReactNode;
  listClassName?: string;
}) {
  const t = useTranslations("catalogBrowser");
  const [levels, setLevels] = useState<Map<string, Level>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; hits: CatalogSearchHit[] } | null>(null);

  /** Loads (the next page of) the children of a group; "" is the top level. */
  const load = async (parentKey: string, offset = 0) => {
    setLoading((l) => new Set(l).add(parentKey));
    const page = await getCatalogChildren(catalogId, parentKey || null, offset);
    setLevels((prev) => {
      const next = new Map(prev);
      const before = offset ? (prev.get(parentKey)?.rows ?? []) : [];
      next.set(parentKey, { rows: [...before, ...page], more: page.length === CATALOG_PAGE_SIZE });
      return next;
    });
    setLoading((l) => {
      const next = new Set(l);
      next.delete(parentKey);
      return next;
    });
  };

  useEffect(() => {
    let active = true;
    getCatalogChildren(catalogId, null).then((page) => {
      if (active) setLevels((prev) => new Map(prev).set("", { rows: page, more: page.length === CATALOG_PAGE_SIZE }));
    });
    return () => {
      active = false;
    };
  }, [catalogId]);

  const q = query.trim();
  const hits = q && result?.query === q ? result.hits : null;
  const searching = Boolean(q) && result?.query !== q;

  useEffect(() => {
    if (!q) return;
    const timer = setTimeout(async () => setResult({ query: q, hits: await searchCatalog(catalogId, q) }), 300);
    return () => clearTimeout(timer);
  }, [q, catalogId]);

  const toggleExpanded = (id: string) => {
    setExpanded((e) => {
      const next = new Set(e);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!levels.has(id) && !loading.has(id)) void load(id);
  };

  const text = (node: { short_text: unknown }) => pickText(node.short_text as I18nText, language).value;
  const pick = Boolean(onToggle);

  const rowContent = (node: CatalogBrowseNode | CatalogSearchHit, implied: boolean) => (
    <>
      {pick && (
        <input
          type="checkbox"
          checked={implied || Boolean(checked?.has(node.id))}
          disabled={implied}
          onChange={() => onToggle?.(node.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={text(node)}
        />
      )}
      <span className="w-28 shrink-0 truncate font-mono text-xs tabular-nums" title={node.article_number ?? undefined}>
        {node.number ?? node.article_number}
      </span>
      <span className={cn("min-w-0 flex-1 truncate", node.kind === "text" && "text-muted-foreground")} title={text(node)}>
        {text(node) || "–"}
      </span>
      {isPosition(node.kind) && (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {node.unit} {node.unit_price !== null && formatMoney(node.unit_price)}
        </span>
      )}
    </>
  );

  const rowClass = (node: { id: string; kind: string }) =>
    cn(
      "flex cursor-pointer items-center gap-2 py-1 pr-3 hover:bg-muted/60",
      node.kind === "group" && "font-semibold",
      node.id === selectedId && "bg-brand/10 hover:bg-brand/15",
    );

  const renderLevel = (parentKey: string, depth: number, implied: boolean): React.ReactNode[] => {
    const level = levels.get(parentKey);
    const pad = { paddingLeft: `${0.5 + depth * 1.25}rem` };
    const out: React.ReactNode[] = [];
    for (const node of level?.rows ?? []) {
      const isGroup = node.kind === "group" && node.child_count > 0;
      const open = expanded.has(node.id);
      const Row = pick ? "label" : "div";
      out.push(
        <Row
          key={node.id}
          className={rowClass(node)}
          style={pad}
          onClick={pick ? undefined : () => {
            onSelect?.(node.id);
            if (isGroup && !open) toggleExpanded(node.id);
          }}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label={open ? t("collapse") : t("expand")}
            className={cn("size-4 shrink-0 text-muted-foreground", !isGroup && "invisible")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleExpanded(node.id);
            }}
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
          {rowContent(node, implied)}
        </Row>,
      );
      if (open) out.push(...renderLevel(node.id, depth + 1, implied || Boolean(checked?.has(node.id))));
    }
    if (loading.has(parentKey)) {
      out.push(
        <div key={`${parentKey}-loading`} className="flex items-center gap-2 py-1 text-muted-foreground" style={pad}>
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </div>,
      );
    } else if (level?.more) {
      out.push(
        <button
          key={`${parentKey}-more`}
          type="button"
          className="block py-1 text-left text-brand hover:underline"
          style={{ paddingLeft: `${2 + depth * 1.25}rem` }}
          onClick={() => void load(parentKey, level.rows.length)}
        >
          {t("showMore")}
        </button>,
      );
    }
    return out;
  };

  const root = levels.get("");

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {toolbar}
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
      </div>
      <div className={cn("overflow-auto rounded-lg border py-1 text-sm", listClassName)}>
        {hits !== null || searching ? (
          searching && hits === null ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : !hits?.length ? (
            <p className="px-4 py-10 text-center text-muted-foreground">{t("noResults")}</p>
          ) : (
            <>
              {hits.map((hit) => {
                const Row = pick ? "label" : "div";
                return (
                  <Row key={hit.id} className={cn(rowClass(hit), "pl-2")} onClick={pick ? undefined : () => onSelect?.(hit.id)}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">{rowContent(hit, false)}</div>
                      {hit.path && <div className={cn("truncate text-xs font-normal text-muted-foreground", pick ? "pl-36" : "pl-30")}>{hit.path}</div>}
                    </div>
                  </Row>
                );
              })}
              {hits.length >= SEARCH_LIMIT && <p className="px-4 py-2 text-xs text-muted-foreground">{t("tooManyHits", { count: SEARCH_LIMIT })}</p>}
            </>
          )
        ) : !root ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !root.rows.length ? (
          <p className="px-4 py-10 text-center text-muted-foreground">{t("empty")}</p>
        ) : (
          renderLevel("", 0, false)
        )}
      </div>
    </div>
  );
}
