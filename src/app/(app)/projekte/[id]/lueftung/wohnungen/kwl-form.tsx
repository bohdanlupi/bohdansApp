"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { FormMessage, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialFormState } from "@/lib/form-state";

import { createKwlCalc } from "../actions";

/** "New KWL calculation" button with a dialog asking for the dwelling / unit name. */
export function NewKwlDialog({ projectId, defaultName }: { projectId: string; defaultName: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        {t("kwl.new")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">{open && <NewKwlForm projectId={projectId} defaultName={defaultName} />}</DialogContent>
    </Dialog>
  );
}

function NewKwlForm({ projectId, defaultName }: { projectId: string; defaultName: string }) {
  const t = useTranslations();
  const [state, action] = useActionState(createKwlCalc, initialFormState);

  return (
    <form action={action} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("kwl.new")}</DialogTitle>
      </DialogHeader>
      <input type="hidden" name="project_id" value={projectId} />
      <FormMessage state={state} />
      <div className="space-y-2">
        <Label htmlFor="kwl-new-name">{t("kwl.fields.name")}</Label>
        <Input id="kwl-new-name" name="name" defaultValue={defaultName} required maxLength={200} autoFocus />
        <p className="text-xs text-muted-foreground">{t("kwl.fields.nameHint")}</p>
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{t("common.cancel")}</DialogClose>
        <SubmitButton>{t("kwl.create")}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
