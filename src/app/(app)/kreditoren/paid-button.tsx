"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { setCreditorPaid } from "./actions";

/** Marks an open invoice as paid today, straight from the list. */
export function PaidButton({ id }: { id: string }) {
  const t = useTranslations("creditors");
  const tf = useTranslations("forms");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      className="relative z-10"
      onClick={() =>
        startTransition(async () => {
          const result = await setCreditorPaid(id, true);
          if (result.error) toast.error(tf("saveFailed"));
        })
      }
    >
      <Check className="size-4" />
      {t("markPaid")}
    </Button>
  );
}
