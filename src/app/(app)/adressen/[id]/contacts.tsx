"use client";

import { Mail, Pencil, Phone, Plus, Smartphone, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";

import { ConfirmButton } from "@/components/confirm-button";
import { FormMessage, NativeSelect, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { salutations } from "@/lib/address-options";
import { initialFormState } from "@/lib/form-state";
import type { Contact } from "@/lib/supabase/types";

import { deleteContact, saveContact } from "../actions";

export function contactName(c: Pick<Contact, "first_name" | "last_name">) {
  return [c.first_name, c.last_name].filter(Boolean).join(" ");
}

export function ContactList({
  companyId,
  contacts,
  editable,
}: {
  companyId: string;
  contacts: Contact[];
  editable: boolean;
}) {
  const t = useTranslations();
  // undefined: dialog closed, null: new contact, Contact: edit.
  const [editing, setEditing] = useState<Contact | null | undefined>(undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("addresses.contacts.title")}</CardTitle>
        {editable && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
              <Plus />
              {t("addresses.contacts.add")}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("addresses.contacts.empty")}</p>
        ) : (
          <ul className="divide-y">
            {contacts.map((c) => (
              <li key={c.id} className="flex gap-3 py-3 text-sm first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="font-medium">
                    {c.salutation && <span className="font-normal text-muted-foreground">{t(`options.salutations.${c.salutation as "mr" | "ms"}`)} </span>}
                    {contactName(c)}
                  </div>
                  {c.function && <div className="text-muted-foreground">{c.function}</div>}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                        <Phone className="size-3.5" />
                        {c.phone}
                      </a>
                    )}
                    {c.mobile && (
                      <a href={`tel:${c.mobile}`} className="inline-flex items-center gap-1 hover:text-foreground">
                        <Smartphone className="size-3.5" />
                        {c.mobile}
                      </a>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                        <Mail className="size-3.5" />
                        {c.email}
                      </a>
                    )}
                  </div>
                  {c.notes && <p className="whitespace-pre-line text-muted-foreground">{c.notes}</p>}
                </div>
                {editable && (
                  <div className="flex shrink-0 items-start gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(c)} aria-label={t("common.edit")}>
                      <Pencil />
                    </Button>
                    <ConfirmButton
                      variant="ghost"
                      size="icon-sm"
                      label={t("common.delete")}
                      trigger={<Trash2 />}
                      title={t("common.delete")}
                      text={t("addresses.contacts.deleteConfirm", { name: contactName(c) })}
                      confirmLabel={t("common.delete")}
                      onConfirm={() => deleteContact(c.id, companyId)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)}>
        <DialogContent className="sm:max-w-lg">
          {editing !== undefined && (
            <ContactForm
              key={editing?.id ?? "new"}
              companyId={companyId}
              contact={editing}
              onSaved={() => setEditing(undefined)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ContactForm({
  companyId,
  contact,
  onSaved,
}: {
  companyId: string;
  contact: Contact | null;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const tf = useTranslations("addresses.contacts");
  const [state, action] = useActionState(saveContact, initialFormState);

  useEffect(() => {
    if (state.success) onSaved();
  }, [state, onSaved]);

  const text = (name: "first_name" | "last_name" | "function" | "phone" | "mobile" | "email", type = "text") => (
    <div className="space-y-2">
      <Label htmlFor={`contact-${name}`}>{tf(`fields.${name}`)}</Label>
      <Input
        id={`contact-${name}`}
        name={name}
        type={type}
        defaultValue={contact?.[name] ?? ""}
        required={name === "last_name"}
      />
    </div>
  );

  return (
    <form action={action} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{contact ? tf("editTitle") : tf("newTitle")}</DialogTitle>
      </DialogHeader>
      <input type="hidden" name="id" value={contact?.id ?? ""} />
      <input type="hidden" name="company_id" value={companyId} />
      <FormMessage state={state.error ? state : initialFormState} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact-salutation">{tf("fields.salutation")}</Label>
          <NativeSelect id="contact-salutation" name="salutation" defaultValue={contact?.salutation ?? ""}>
            <option value="" />
            {salutations.map((s) => (
              <option key={s} value={s}>
                {t(`options.salutations.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-language">{tf("fields.language")}</Label>
          <NativeSelect id="contact-language" name="language" defaultValue={contact?.language ?? ""}>
            <option value="">{tf("languageDefault")}</option>
            {(["de", "fr", "it"] as const).map((l) => (
              <option key={l} value={l}>
                {t(`languages.${l}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        {text("first_name")}
        {text("last_name")}
        <div className="sm:col-span-2">{text("function")}</div>
        {text("phone", "tel")}
        {text("mobile", "tel")}
        <div className="sm:col-span-2">{text("email", "email")}</div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="contact-notes">{tf("fields.notes")}</Label>
          <Textarea id="contact-notes" name="notes" defaultValue={contact?.notes ?? ""} rows={2} />
        </div>
      </div>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{t("common.cancel")}</DialogClose>
        <SubmitButton>{t("common.save")}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
