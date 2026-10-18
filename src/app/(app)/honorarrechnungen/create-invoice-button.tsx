"use client";

import { ReceiptText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { createFeeInvoice } from "./actions";

/** Creates the next invoice of an accepted offer and opens it. */
export function CreateInvoiceButton({ offerId, offerNumber, variant = "default" }: { offerId: string; offerNumber: string; variant?: "default" | "outline" }) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await createFeeInvoice(offerId);
          if (result?.error) toast.error(t(`forms.${result.error}` as "forms.saveFailed"));
        })
      }
    >
      <ReceiptText />
      {t("feeInvoices.create", { number: offerNumber })}
    </Button>
  );
}
