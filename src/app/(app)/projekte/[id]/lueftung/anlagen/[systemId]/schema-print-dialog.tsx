"use client";

import { Workflow } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { type FormMessageKey, NativeSelect } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Locale, localeToLanguage } from "@/i18n/config";
import { phases } from "@/lib/kwl/phases";
import type { SchemaPlan } from "@/lib/kwl/schema-plan";

import { saveSchemaPlan } from "../actions";

/**
 * «Prinzipschema PDF»: dialog for the title block (SIA phase, optionally a new revision with comment), then the plan
 * PDF in a new tab. Viewers get the PDF directly.
 */
export function SchemaPrintButton({
  systemId,
  projectId,
  plan,
  editable,
  dirty,
  url = `/api/pdf/kwl-schema/${systemId}`,
  save = saveSchemaPlan,
}: {
  systemId: string;
  projectId: string;
  plan: SchemaPlan;
  editable: boolean;
  /** Unsaved network changes: the PDF shows the saved state, so saving comes first. */
  dirty: boolean;
  /** PDF of the plan and the action storing the title block (defaults: the Lüftungsanlage). */
  url?: string;
  save?: typeof saveSchemaPlan;
}) {
  const t = useTranslations("kwlSystem");
  const tCommon = useTranslations("common");
  const tForms = useTranslations("forms");
  const language = localeToLanguage(useLocale() as Locale);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState(plan.phase ?? "");
  const [newRevision, setNewRevision] = useState(plan.revisions.length === 0);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  if (!editable) {
    return (
      <a href={url} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
        <Workflow />
        {t("schemaPdf")}
      </a>
    );
  }

  const print = () => {
    // Opened right away (inside the click), so pop-up blockers let it through; the PDF loads once saved.
    const tab = window.open("", "_blank");
    startTransition(async () => {
      const res = await save(systemId, projectId, { phase: phase || null, comment: newRevision ? comment.trim() : null });
      if (res.error) {
        tab?.close();
        toast.error(tForms(res.error as FormMessageKey));
        return;
      }
      if (tab) tab.location.href = url;
      else window.open(url, "_blank");
      setOpen(false);
      setComment("");
      setNewRevision(false);
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next && dirty) {
          toast.error(t("saveFirst"));
          return;
        }
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Workflow />
        {t("schemaPdf")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("schemaDialog.title")}</DialogTitle>
          <DialogDescription>{t("schemaDialog.text")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="schema-phase">{t("schemaDialog.phase")}</Label>
            <NativeSelect id="schema-phase" value={phase} onChange={(e) => setPhase(e.target.value)}>
              <option value="">{t("schemaDialog.noPhase")}</option>
              {phases.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} {p.title[language]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={newRevision} onChange={(e) => setNewRevision(e.target.checked)} className="size-4 accent-brand" />
              {t("schemaDialog.newRevision")}
            </label>
            {newRevision && (
              <div className="space-y-1.5">
                <Label htmlFor="schema-comment">{t("schemaDialog.comment")}</Label>
                <Input id="schema-comment" value={comment} maxLength={80} placeholder={t("schemaDialog.commentPlaceholder")} onChange={(e) => setComment(e.target.value)} />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t("schemaDialog.revisions")}</p>
            {plan.revisions.length ? (
              <ul className="max-h-32 overflow-y-auto rounded-lg border text-xs">
                {plan.revisions.map((r) => (
                  <li key={r.index} className="flex gap-3 border-b px-2 py-1 last:border-0">
                    <span className="w-6 font-medium">{r.index}</span>
                    <span className="w-10">{r.initials}</span>
                    <span className="w-20 tabular-nums">{r.date.split("-").reverse().join(".")}</span>
                    <span className="min-w-0 flex-1 truncate">{r.comment}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">{t("schemaDialog.none")}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>{tCommon("cancel")}</DialogClose>
          <Button type="button" onClick={print} disabled={pending}>
            {t("schemaDialog.print")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
