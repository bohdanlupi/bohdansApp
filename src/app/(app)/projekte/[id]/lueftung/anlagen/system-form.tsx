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

import { createSystem } from "./actions";

export function NewSystemDialog({ projectId, defaultName }: { projectId: string; defaultName: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        {t("kwlSystem.new")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">{open && <NewSystemForm projectId={projectId} defaultName={defaultName} />}</DialogContent>
    </Dialog>
  );
}

function NewSystemForm({ projectId, defaultName }: { projectId: string; defaultName: string }) {
  const t = useTranslations();
  const [state, action] = useActionState(createSystem, initialFormState);
  return (
    <form action={action} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("kwlSystem.new")}</DialogTitle>
      </DialogHeader>
      <input type="hidden" name="project_id" value={projectId} />
      <FormMessage state={state} />
      <div className="space-y-2">
        <Label htmlFor="system-name">{t("kwlSystem.name")}</Label>
        <Input id="system-name" name="name" defaultValue={defaultName} required maxLength={200} autoFocus />
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{t("common.cancel")}</DialogClose>
        <SubmitButton>{t("kwlSystem.create")}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
