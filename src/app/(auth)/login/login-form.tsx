"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormMessage, SubmitButton } from "@/components/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialFormState } from "@/lib/form-state";

import { signIn } from "../actions";

export function LoginForm({ next, linkError }: { next?: string; linkError?: string }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState(signIn, initialFormState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("loginTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          {next && <input type="hidden" name="next" value={next} />}
          {linkError && !state.error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {linkError}
            </p>
          )}
          <FormMessage state={state} />
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <SubmitButton className="w-full" size="lg">
            {t("login")}
          </SubmitButton>
          <p className="text-center text-sm">
            <Link href="/passwort-vergessen" className="text-muted-foreground underline-offset-4 hover:underline">
              {t("forgotPassword")}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
