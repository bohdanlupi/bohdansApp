"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/confirm-button";
import { FormMessage, NativeSelect, SubmitButton, type FormMessageKey } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { I18nText } from "@/lib/i18n-text";
import { initialFormState } from "@/lib/form-state";

import { addCostItem, createTemplate, deleteCostItem, updateCostItemName } from "./actions";

export function AddItemForm({ templateId }: { templateId: string }) {
  const t = useTranslations();
  const [state, action] = useActionState(addCostItem, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      formRef.current?.querySelector<HTMLInputElement>("input[name=code]")?.focus();
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-2 rounded-xl border p-3">
      <input type="hidden" name="template_id" value={templateId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-24 space-y-1">
          <Label htmlFor="cp-code" className="text-xs">
            {t("settings.costPlans.code")}
          </Label>
          <Input id="cp-code" name="code" required />
        </div>
        {(["de", "fr", "it"] as const).map((l) => (
          <div key={l} className="min-w-40 flex-1 space-y-1">
            <Label htmlFor={`cp-${l}`} className="text-xs">
              {t(`languages.${l}`)}
            </Label>
            <Input id={`cp-${l}`} name={l} required={l === "de"} />
          </div>
        ))}
        <SubmitButton variant="outline">
          <Plus />
          {t("common.add")}
        </SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">{t("settings.costPlans.codeHint")}</p>
      {state.error && <FormMessage state={state} />}
    </form>
  );
}

export function CostItemRow({
  templateId,
  item,
  depth,
  editable,
}: {
  templateId: string;
  item: { id: string; code: string; name: I18nText };
  depth: number;
  editable: boolean;
}) {
  const t = useTranslations();
  const [name, setName] = useState({ de: item.name.de ?? "", fr: item.name.fr ?? "", it: item.name.it ?? "" });
  const [saved, setSaved] = useState(JSON.stringify(name));

  const save = async () => {
    if (JSON.stringify(name) === saved) return;
    const result = await updateCostItemName(item.id, name);
    if (result.error) toast.error(t(`forms.${result.error as FormMessageKey}`));
    else setSaved(JSON.stringify(name));
  };

  return (
    <tr className="border-b last:border-0">
      <td className="py-1 pl-4 font-mono text-xs tabular-nums" style={{ paddingLeft: `${1 + depth * 0.75}rem` }}>
        {item.code}
      </td>
      {(["de", "fr", "it"] as const).map((l) => (
        <td key={l} className="px-1 py-0.5">
          {editable ? (
            <input
              aria-label={`${item.code} ${t(`languages.${l}`)}`}
              value={name[l]}
              onChange={(e) => setName({ ...name, [l]: e.target.value })}
              onBlur={save}
              className={`h-7 w-full rounded border border-transparent bg-transparent px-1.5 outline-none hover:border-input focus:border-ring ${depth === 0 ? "font-semibold" : ""}`}
            />
          ) : (
            <span className="px-1.5">{name[l]}</span>
          )}
        </td>
      ))}
      <td className="pr-4 text-right">
        {editable && (
          <ConfirmButton
            variant="ghost"
            size="icon-sm"
            label={t("common.delete")}
            trigger={<Trash2 />}
            title={t("common.delete")}
            text={t("settings.costPlans.deleteItemConfirm", { code: item.code })}
            confirmLabel={t("common.delete")}
            onConfirm={() => deleteCostItem(item.id, templateId)}
          />
        )}
      </td>
    </tr>
  );
}

export function NewTemplateForm({ templates }: { templates: { id: string; name: string }[] }) {
  const t = useTranslations();
  const [state, action] = useActionState(createTemplate, initialFormState);

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <Plus />
        {t("settings.costPlans.newTemplate")}
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("settings.costPlans.newTemplate")}</DialogTitle>
          </DialogHeader>
          <FormMessage state={state} />
          <div className="space-y-2">
            <Label htmlFor="tpl-name">{t("settings.costPlans.templateName")}</Label>
            <Input id="tpl-name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-copy">{t("settings.costPlans.copyFrom")}</Label>
            <NativeSelect id="tpl-copy" name="copy_from" defaultValue="">
              <option value="">{t("settings.costPlans.empty")}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t("common.cancel")}</DialogClose>
            <SubmitButton>{t("common.add")}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
