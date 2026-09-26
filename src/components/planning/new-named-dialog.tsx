"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { FormMessage, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type FormState, initialFormState } from "@/lib/form-state";

/** «New …» button with a dialog asking for a name; the action creates the record and redirects. */
export function NewNamedDialog({
  projectId,
  defaultName,
  action: create,
  labels,
}: {
  projectId: string;
  defaultName: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  labels: { button: string; name: string; hint?: string; create: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        {labels.button}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">{open && <NamedForm projectId={projectId} defaultName={defaultName} action={create} labels={labels} />}</DialogContent>
    </Dialog>
  );
}

function NamedForm({
  projectId,
  defaultName,
  action: create,
  labels,
}: {
  projectId: string;
  defaultName: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  labels: { button: string; name: string; hint?: string; create: string };
}) {
  const t = useTranslations("common");
  const [state, action] = useActionState(create, initialFormState);
  return (
    <form action={action} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{labels.button}</DialogTitle>
      </DialogHeader>
      <input type="hidden" name="project_id" value={projectId} />
      <FormMessage state={state} />
      <div className="space-y-2">
        <Label htmlFor="new-name">{labels.name}</Label>
        <Input id="new-name" name="name" defaultValue={defaultName} required maxLength={200} autoFocus />
        {labels.hint && <p className="text-xs text-muted-foreground">{labels.hint}</p>}
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
        <SubmitButton>{labels.create}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
