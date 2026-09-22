"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormMessage, NativeSelect, SubmitButton } from "@/components/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialFormState } from "@/lib/form-state";
import type { Profile } from "@/lib/supabase/types";

import { setPassword } from "../../../(auth)/actions";
import { updateOwnProfile } from "../actions";

export function ProfileForm({ profile }: { profile: Profile }) {
  const t = useTranslations();
  const [state, action] = useActionState(updateOwnProfile, initialFormState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.profile.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <FormMessage state={state} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="full_name">{t("settings.users.fullName")}</Label>
              <Input id="full_name" name="full_name" defaultValue={profile.full_name ?? ""} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" value={profile.email} disabled readOnly />
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">{t("common.language")}</Label>
              <NativeSelect id="language" name="language" defaultValue={profile.language}>
                <option value="de">{t("languages.de")}</option>
                <option value="fr">{t("languages.fr")}</option>
                <option value="it">{t("languages.it")}</option>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label>{t("settings.users.role")}</Label>
              <Input value={t(`roles.${profile.role}`)} disabled readOnly />
            </div>
          </div>
          <SubmitButton>{t("common.save")}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function PasswordForm() {
  const t = useTranslations("auth");
  const [state, action] = useActionState(setPassword, initialFormState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("changePassword")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="stay" value="1" />
          <FormMessage state={state} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="password">{t("newPassword")}</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">{t("confirmPassword")}</Label>
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
            </div>
          </div>
          <SubmitButton>{t("savePassword")}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
