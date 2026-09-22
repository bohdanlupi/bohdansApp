"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormMessage, SubmitButton } from "@/components/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialFormState } from "@/lib/form-state";

import { setPassword } from "../actions";

// Reached via the invite / recovery link (session is set by /auth/confirm).
export default function SetPasswordPage() {
  const t = useTranslations("auth");
  const [state, action] = useActionState(setPassword, initialFormState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("setPasswordTitle")}</CardTitle>
        <CardDescription>{t("setPasswordDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <FormMessage state={state} />
          <div className="space-y-2">
            <Label htmlFor="password">{t("newPassword")}</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">{t("confirmPassword")}</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
          </div>
          <SubmitButton className="w-full" size="lg">
            {t("savePassword")}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
