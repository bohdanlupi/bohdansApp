"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CatalogBrowser } from "@/components/catalog-browser";
import { NativeSelect } from "@/components/form";
import type { FormMessageKey } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AppLanguage } from "@/lib/supabase/types";
import { insertFromCatalog } from "@/lib/tree-actions";

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
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [inserting, startInserting] = useTransition();

  const toggle = (id: string) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const changeCatalog = (id: string) => {
    setCatalogId(id);
    setChecked(new Set());
  };

  const insert = () =>
    startInserting(async () => {
      const result = await insertFromCatalog(lvId, [...checked], target.parentId, target.beforeId);
      if (result.error) {
        toast.error(tForms(result.error as FormMessageKey));
        return;
      }
      setChecked(new Set());
      onInserted(result.id);
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>

        {catalogs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("noCatalogs")}</p>
        ) : (
          open && (
            <CatalogBrowser
              key={catalogId}
              catalogId={catalogId}
              language={language}
              checked={checked}
              onToggle={toggle}
              listClassName="h-[55vh]"
              toolbar={
                <NativeSelect value={catalogId} onChange={(e) => changeCatalog(e.target.value)} aria-label={t("catalog")} className="w-72">
                  {catalogs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              }
            />
          )
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t("cancel")}</DialogClose>
          <Button onClick={insert} disabled={!checked.size || inserting}>
            {t("insert", { count: checked.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
