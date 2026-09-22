"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/form";
import type { FormMessageKey } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { pickText, type I18nText } from "@/lib/i18n-text";
import { formatMoney } from "@/lib/number-input";
import type { AppLanguage } from "@/lib/supabase/types";
import { descendants, flatten, isPosition } from "@/lib/tree";
import { getCatalogNodes, insertFromCatalog } from "@/lib/tree-actions";
import { cn } from "@/lib/utils";

type CatalogNode = Awaited<ReturnType<typeof getCatalogNodes>>[number];

export function CatalogPicker({
  open,
  onOpenChange,
  catalogs,
  language,
  lvId,
  target,
  onInserted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogs: { id: string; name: string }[];
  language: AppLanguage;
  lvId: string;
  target: { parentId: string | null; beforeId: string | null };
  onInserted: (id?: string) => void;
}) {
  const t = useTranslations("tree.catalogPicker");
  const tForms = useTranslations("forms");
  const [catalogId, setCatalogId] = useState(catalogs[0]?.id ?? "");
  const [nodes, setNodes] = useState<CatalogNode[] | null>(null);
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, startLoading] = useTransition();
  const [inserting, startInserting] = useTransition();

  useEffect(() => {
    if (!open || !catalogId) return;
    startLoading(async () => {
      setNodes(await getCatalogNodes(catalogId));
      setChecked(new Set());
    });
  }, [open, catalogId]);

  const text = (n: CatalogNode) => pickText(n.short_text as I18nText, language).value;

  const rows = useMemo(() => {
    if (!nodes) return [];
    const all = flatten(nodes);
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return all;
    // Keep matches and their ancestors so the structure stays readable.
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const keep = new Set<string>();
    for (const n of nodes) {
      const haystack = `${n.number ?? ""} ${text(n)}`.toLowerCase();
      if (!words.every((w) => haystack.includes(w))) continue;
      for (let p: CatalogNode | undefined = n; p; p = p.parent_id ? byId.get(p.parent_id) : undefined) keep.add(p.id);
    }
    return all.filter(({ node }) => keep.has(node.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `text` only depends on language
  }, [nodes, query, language]);

  const toggle = (node: CatalogNode) =>
    setChecked((current) => {
      const next = new Set(current);
      const ids = [node.id, ...descendants(nodes ?? [], node.id).map((d) => d.id)];
      if (next.has(node.id)) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });

  const insert = () =>
    startInserting(async () => {
      const result = await insertFromCatalog(lvId, [...checked], target.parentId, target.beforeId);
      if (result.error) {
        toast.error(tForms(result.error as FormMessageKey));
        return;
      }
      onInserted(result.id);
      onOpenChange(false);
    });

  const count = nodes?.filter((n) => checked.has(n.id) && isPosition(n.kind)).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>

        {catalogs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("noCatalogs")}</p>
        ) : (
          <>
            <div className="flex gap-2">
              <NativeSelect value={catalogId} onChange={(e) => setCatalogId(e.target.value)} aria-label={t("catalog")} className="w-64">
                {catalogs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
            </div>
            <div className="h-[55vh] overflow-auto rounded-lg border py-1 text-sm">
              {loading || !nodes ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                rows.map(({ node, depth }) => (
                  <label
                    key={node.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 py-1 pr-3 hover:bg-muted/60",
                      node.kind === "group" && "font-semibold",
                      node.kind === "text" && "text-muted-foreground",
                    )}
                    style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
                  >
                    <input type="checkbox" checked={checked.has(node.id)} onChange={() => toggle(node)} />
                    <span className="w-20 shrink-0 font-mono text-xs tabular-nums">{node.number}</span>
                    <span className="min-w-0 flex-1 truncate">{text(node)}</span>
                    {isPosition(node.kind) && (
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {node.unit} {node.unit_price !== null && formatMoney(node.unit_price)}
                      </span>
                    )}
                  </label>
                ))
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t("cancel")}</DialogClose>
          <Button onClick={insert} disabled={!checked.size || inserting}>
            {t("insert", { count })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
