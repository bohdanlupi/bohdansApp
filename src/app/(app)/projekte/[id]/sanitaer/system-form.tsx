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

import { createSanitarySystem } from "./actions";

export function NewSanitarySystemDialog({ projectId, defaultName }: { projectId: string; defaultName: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        {t("sanitary.new")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">{open && <NewForm projectId={projectId} defaultName={defaultName} />}</DialogContent>
    </Dialog>
  );
}

function NewForm({ projectId, defaultName }: { projectId: string; defaultName: string }) {
  const t = useTranslations();
  const [state, action] = useActionState(createSanitarySystem, initialFormState);
  return (
    <form action={action} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("sanitary.new")}</DialogTitle>
      </DialogHeader>
      <input type="hidden" name="project_id" value={projectId} />
      <FormMessage state={state} />
      <div className="space-y-2">
        <Label htmlFor="sanitary-name">{t("sanitary.name")}</Label>
        <Input id="sanitary-name" name="name" defaultValue={defaultName} required maxLength={200} autoFocus />
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{t("common.cancel")}</DialogClose>
        <SubmitButton>{t("sanitary.create")}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
