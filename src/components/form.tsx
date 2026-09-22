"use client";

import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/form-state";
import { cn } from "@/lib/utils";

import type messages from "../../messages/de-CH.json";

export type FormMessageKey = keyof (typeof messages)["forms"];

export function SubmitButton({ children, ...props }: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {children}
    </Button>
  );
}

/** Shows the translated error or success message of a form action. */
export function FormMessage({ state }: { state: FormState }) {
  const t = useTranslations("forms");
  if (!state.error && !state.success) return null;

  return (
    <p
      role={state.error ? "alert" : "status"}
      className={cn(
        "rounded-md px-3 py-2 text-sm",
        state.error ? "bg-destructive/10 text-destructive" : "bg-emerald-50 text-emerald-800",
      )}
    >
      {t((state.error ?? state.success) as FormMessageKey)}
    </p>
  );
}

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
