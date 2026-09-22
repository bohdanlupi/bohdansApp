"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { FormMessageKey } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { FormState } from "@/lib/form-state";

/**
 * Button that asks for confirmation before running a (server) action, e.g. deleting a record.
 * Errors returned by the action are shown as a toast; a redirect in the action just navigates.
 */
export function ConfirmButton({
  label,
  title,
  text,
  confirmLabel,
  onConfirm,
  variant = "destructive",
  size,
  trigger,
}: {
  label?: string;
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => Promise<FormState | void>;
  variant?: "destructive" | "outline" | "ghost";
  size?: "default" | "sm" | "icon-sm";
  /** Custom trigger content (e.g. an icon); `label` is then used as its accessible name. */
  trigger?: React.ReactNode;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await onConfirm();
      if (result?.error) {
        toast.error(t(`forms.${result.error as FormMessageKey}`));
      } else {
        setOpen(false);
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant={variant} size={size} aria-label={trigger ? label : undefined} />}>
        {trigger ?? label}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{text}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t("common.cancel")}</DialogClose>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
