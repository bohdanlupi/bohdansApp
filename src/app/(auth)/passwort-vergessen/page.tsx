"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormMessage, SubmitButton } from "@/components/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialFormState } from "@/lib/form-state";

import { requestPasswordReset } from "../actions";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const [state, action] = useActionState(requestPasswordReset, initialFormState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("forgotTitle")}</CardTitle>
        <CardDescription>{t("forgotDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <FormMessage state={state} />
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </div>
          <SubmitButton className="w-full" size="lg">
            {t("sendResetLink")}
          </SubmitButton>
          <p className="text-center text-sm">
            <Link href="/login" className="text-muted-foreground underline-offset-4 hover:underline">
              {t("backToLogin")}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
