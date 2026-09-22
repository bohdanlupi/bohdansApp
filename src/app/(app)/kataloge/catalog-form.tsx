"use client";

import { Plus, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";

import { FormMessage, NativeSelect, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trades } from "@/lib/address-options";
import { initialFormState } from "@/lib/form-state";
import type { Catalog } from "@/lib/supabase/types";

import { createCatalog, updateCatalog } from "./actions";

/** "New catalogue" button (without `catalog`) or "settings" button, each opening a form dialog. */
export function CatalogFormDialog({ catalog }: { catalog?: Catalog }) {
  const t = useTranslations("catalogs");
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={catalog ? "outline" : "default"} />}>
        {catalog ? <Settings2 /> : <Plus />}
        {catalog ? t("settings") : t("new")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {open && <CatalogForm catalog={catalog} onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CatalogForm({ catalog, onSaved }: { catalog?: Catalog; onSaved: () => void }) {
  const t = useTranslations();
  const tc = useTranslations("catalogs");
  const [state, action] = useActionState(catalog ? updateCatalog : createCatalog, initialFormState);

  useEffect(() => {
    if (state.success) onSaved();
  }, [state, onSaved]);

  return (
    <form action={action} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{catalog ? tc("settings") : tc("new")}</DialogTitle>
      </DialogHeader>
      {catalog && <input type="hidden" name="id" value={catalog.id} />}
      <FormMessage state={state.error ? state : initialFormState} />

      <div className="space-y-2">
        <Label htmlFor="catalog-name">{tc("fields.name")}</Label>
        <Input id="catalog-name" name="name" defaultValue={catalog?.name} required autoFocus={!catalog} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="catalog-trade">{tc("fields.trade")}</Label>
        <NativeSelect id="catalog-trade" name="trade" defaultValue={catalog?.trade ?? ""}>
          <option value="" />
          {trades.map((tr) => (
            <option key={tr} value={tr}>
              {t(`options.trades.${tr}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="catalog-description">{tc("fields.description")}</Label>
        <Textarea id="catalog-description" name="description" defaultValue={catalog?.description ?? ""} rows={3} />
      </div>
      {catalog && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={catalog.active} />
          {tc("fields.active")}
        </label>
      )}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{t("common.cancel")}</DialogClose>
        <SubmitButton>{catalog ? t("common.save") : tc("create")}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
