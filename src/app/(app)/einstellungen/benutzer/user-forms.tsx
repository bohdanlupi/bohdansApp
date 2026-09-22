"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";

import { FormMessage, NativeSelect, SubmitButton } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialFormState } from "@/lib/form-state";
import type { Profile } from "@/lib/supabase/database.types";

import { inviteUser, updateUser } from "../actions";

const roles = ["admin", "planer", "viewer"] as const;
const languages = ["de", "fr", "it"] as const;

export function InviteForm() {
  const t = useTranslations();
  const [state, action] = useActionState(inviteUser, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="invite-name">{t("settings.users.fullName")}</Label>
          <Input id="invite-name" name="full_name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-email">{t("auth.email")}</Label>
          <Input id="invite-email" name="email" type="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-role">{t("settings.users.role")}</Label>
          <NativeSelect id="invite-role" name="role" defaultValue="planer">
            {roles.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-language">{t("common.language")}</Label>
          <NativeSelect id="invite-language" name="language" defaultValue="de">
            {languages.map((l) => (
              <option key={l} value={l}>
                {t(`languages.${l}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("settings.users.roleHelp")}</p>
      <SubmitButton>{t("settings.users.sendInvite")}</SubmitButton>
    </form>
  );
}

export function UserRow({ user, editable, isSelf }: { user: Profile; editable: boolean; isSelf: boolean }) {
  const t = useTranslations();
  const [state, action] = useActionState(updateUser, initialFormState);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      <input type="hidden" name="id" value={user.id} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-medium">
          <span className="truncate">{user.full_name ?? user.email}</span>
          {isSelf && <Badge variant="secondary">{t("settings.users.you")}</Badge>}
          {!user.active && <Badge variant="destructive">{t("settings.users.inactive")}</Badge>}
        </div>
        <div className="truncate text-sm text-muted-foreground">{user.email}</div>
        {(state.error || state.success) && (
          <div className="mt-2">
            <FormMessage state={state} />
          </div>
        )}
      </div>
      {editable ? (
        <>
          <NativeSelect name="role" defaultValue={user.role} className="w-36" aria-label={t("settings.users.role")}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            name="active"
            defaultValue={String(user.active)}
            className="w-32"
            aria-label={t("settings.users.status")}
          >
            <option value="true">{t("settings.users.active")}</option>
            <option value="false">{t("settings.users.inactive")}</option>
          </NativeSelect>
          <SubmitButton variant="outline" size="sm">
            {t("common.save")}
          </SubmitButton>
        </>
      ) : (
        <Badge variant="outline">{t(`roles.${user.role}`)}</Badge>
      )}
    </form>
  );
}
