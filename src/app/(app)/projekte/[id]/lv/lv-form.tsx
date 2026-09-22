"use client";

import { Plus, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";

import { CostItemSelect } from "@/components/cost-item-select";
import { FormMessage, NativeSelect, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trades } from "@/lib/address-options";
import type { CostItemOption } from "@/lib/cost-plan";
import { initialFormState } from "@/lib/form-state";
import type { AppLanguage, Tables } from "@/lib/supabase/types";

import { createLv, updateLv } from "./actions";

type Lv = Tables<"lvs">;

/** "New LV" button (without `lv`) or "LV settings" button, each opening a form dialog. */
export function LvFormDialog({
  projectId,
  lv,
  defaults,
  costOptions,
}: {
  projectId: string;
  lv?: Lv;
  defaults?: { number: string; language: AppLanguage };
  costOptions: CostItemOption[];
}) {
  const tl = useTranslations("lvs");
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={lv ? "outline" : "default"} />}>
        {lv ? <Settings2 /> : <Plus />}
        {lv ? tl("settings") : tl("new")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {open && <LvForm projectId={projectId} lv={lv} defaults={defaults} costOptions={costOptions} onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function LvForm({
  projectId,
  lv,
  defaults,
  costOptions,
  onSaved,
}: {
  projectId: string;
  lv?: Lv;
  defaults?: { number: string; language: AppLanguage };
  costOptions: CostItemOption[];
  onSaved: () => void;
}) {
  const t = useTranslations();
  const tl = useTranslations("lvs");
  const [state, action] = useActionState(lv ? updateLv : createLv, initialFormState);

  useEffect(() => {
    if (state.success) onSaved();
  }, [state, onSaved]);

  return (
    <form action={action} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{lv ? tl("settings") : tl("new")}</DialogTitle>
      </DialogHeader>
      {lv && <input type="hidden" name="id" value={lv.id} />}
      <input type="hidden" name="project_id" value={projectId} />
      <FormMessage state={state.error ? state : initialFormState} />

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="lv-number">{tl("fields.number")}</Label>
          <Input id="lv-number" name="number" defaultValue={lv?.number ?? defaults?.number} required />
        </div>
        <div className="space-y-2 sm:col-span-3">
          <Label htmlFor="lv-title">{tl("fields.title")}</Label>
          <Input id="lv-title" name="title" defaultValue={lv?.title} required autoFocus={!lv} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="lv-trade">{tl("fields.trade")}</Label>
          <NativeSelect id="lv-trade" name="trade" defaultValue={lv?.trade ?? ""}>
            <option value="" />
            {trades.map((tr) => (
              <option key={tr} value={tr}>
                {t(`options.trades.${tr}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="lv-language">{tl("fields.language")}</Label>
          <NativeSelect id="lv-language" name="language" defaultValue={lv?.language ?? defaults?.language ?? "de"}>
            {(["de", "fr", "it"] as const).map((l) => (
              <option key={l} value={l}>
                {t(`languages.${l}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2 sm:col-span-4">
          <Label htmlFor="lv-cost-item">{tl("fields.costItem")}</Label>
          <CostItemSelect
            id="lv-cost-item"
            name="cost_plan_item_id"
            options={costOptions}
            emptyLabel={tl("noCostItem")}
            defaultValue={lv?.cost_plan_item_id ?? ""}
          />
        </div>
        {lv && (
          <>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="lv-status">{tl("fields.status")}</Label>
              <NativeSelect id="lv-status" name="status" defaultValue={lv.status}>
                {(["draft", "tendered", "awarded"] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`options.lvStatus.${s}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="lv-deadline">{tl("fields.submissionDeadline")}</Label>
              <Input id="lv-deadline" name="submission_deadline" type="date" defaultValue={lv.submission_deadline ?? ""} />
            </div>
            <div className="space-y-2 sm:col-span-4">
              <Label htmlFor="lv-description">{tl("fields.description")}</Label>
              <Textarea id="lv-description" name="description" defaultValue={lv.description ?? ""} rows={3} />
            </div>
          </>
        )}
      </div>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{t("common.cancel")}</DialogClose>
        <SubmitButton>{lv ? t("common.save") : tl("create")}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
