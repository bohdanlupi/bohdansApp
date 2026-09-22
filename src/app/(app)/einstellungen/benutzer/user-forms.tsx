"use client";

import { useTranslations } from "next-intl";
import { KeyRound } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { FormMessage, NativeSelect, SubmitButton } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialFormState } from "@/lib/form-state";
import type { Profile } from "@/lib/supabase/types";

import { createUser, setUserPassword, updateUser } from "../actions";

const roles = ["admin", "planer", "viewer"] as const;
const languages = ["de", "fr", "it"] as const;

export function CreateUserForm() {
  const t = useTranslations();
  const [state, action] = useActionState(createUser, initialFormState);
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
          <Label htmlFor="invite-password">{t("settings.users.initialPassword")}</Label>
          <Input id="invite-password" name="password" type="text" minLength={10} autoComplete="off" required />
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
      <p className="text-xs text-muted-foreground">{t("settings.users.passwordHelp")}</p>
      <p className="text-xs text-muted-foreground">{t("settings.users.roleHelp")}</p>
      <SubmitButton>{t("settings.users.create")}</SubmitButton>
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
          <PasswordDialog userId={user.id} name={user.full_name ?? user.email} />
        </>
      ) : (
        <Badge variant="outline">{t(`roles.${user.role}`)}</Badge>
      )}
    </form>
  );
}

function PasswordDialog({ userId, name }: { userId: string; name: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        title={t("settings.users.setPassword")}
        aria-label={t("settings.users.setPassword")}
      >
        <KeyRound />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>{open && <PasswordForm userId={userId} name={name} />}</DialogContent>
      </Dialog>
    </>
  );
}

function PasswordForm({ userId, name }: { userId: string; name: string }) {
  const t = useTranslations();
  const [state, action] = useActionState(setUserPassword, initialFormState);

  return (
    <form action={action} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("settings.users.setPasswordFor", { name })}</DialogTitle>
      </DialogHeader>
      <input type="hidden" name="id" value={userId} />
      <FormMessage state={state} />
      <div className="space-y-2">
        <Label htmlFor={`pw-${userId}`}>{t("auth.newPassword")}</Label>
        <Input id={`pw-${userId}`} name="password" type="text" minLength={10} autoComplete="off" required autoFocus />
        <p className="text-xs text-muted-foreground">{t("settings.users.passwordHelp")}</p>
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{t("common.cancel")}</DialogClose>
        {!state.success && <SubmitButton>{t("auth.savePassword")}</SubmitButton>}
      </DialogFooter>
    </form>
  );
}
