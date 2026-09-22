"use client";

import { Mail, Phone, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";

import { CompanyPicker, type CompanyOption } from "@/components/company-picker";
import { ConfirmButton } from "@/components/confirm-button";
import { FormMessage, NativeSelect, SubmitButton } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { participantRoles, type ParticipantRole } from "@/lib/address-options";
import { initialFormState } from "@/lib/form-state";

import { addParticipant, getCompanyContacts, removeParticipant } from "../actions";

export type ParticipantView = {
  id: string;
  role: string;
  note: string | null;
  company: { id: string; name: string; city: string | null; phone: string | null; email: string | null };
  contact: {
    id: string;
    first_name: string | null;
    last_name: string;
    phone: string | null;
    mobile: string | null;
    email: string | null;
  } | null;
};

const isRole = (role: string): role is ParticipantRole => (participantRoles as readonly string[]).includes(role);

export function Participants({
  projectId,
  participants,
  companies,
  editable,
}: {
  projectId: string;
  participants: ParticipantView[];
  companies: CompanyOption[];
  editable: boolean;
}) {
  const t = useTranslations();
  const tp = useTranslations("projects.participants");
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tp("title")}</CardTitle>
        {editable && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus />
              {tp("add")}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {participants.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tp("empty")}</p>
        ) : (
          <ul className="divide-y">
            {participants.map((p) => {
              const person = p.contact ? [p.contact.first_name, p.contact.last_name].filter(Boolean).join(" ") : null;
              const phone = p.contact?.phone ?? p.contact?.mobile ?? p.company.phone;
              const email = p.contact?.email ?? p.company.email;
              return (
                <li key={p.id} className="flex gap-3 py-3 text-sm first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Badge variant="secondary">
                      {isRole(p.role) ? t(`options.participantRoles.${p.role}`) : p.role}
                    </Badge>
                    <div>
                      <Link href={`/adressen/${p.company.id}`} className="font-medium hover:underline">
                        {p.company.name}
                      </Link>
                      {p.company.city && <span className="text-muted-foreground">, {p.company.city}</span>}
                    </div>
                    {person && <div>{person}</div>}
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
                      {phone && (
                        <a href={`tel:${phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                          <Phone className="size-3.5" />
                          {phone}
                        </a>
                      )}
                      {email && (
                        <a href={`mailto:${email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                          <Mail className="size-3.5" />
                          {email}
                        </a>
                      )}
                    </div>
                    {p.note && <p className="text-muted-foreground">{p.note}</p>}
                  </div>
                  {editable && (
                    <ConfirmButton
                      variant="ghost"
                      size="icon-sm"
                      label={tp("remove")}
                      trigger={<Trash2 />}
                      title={tp("remove")}
                      text={tp("removeConfirm", { name: p.company.name })}
                      confirmLabel={tp("remove")}
                      onConfirm={() => removeParticipant(p.id, projectId)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {editable && (
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="sm:max-w-lg">
            {adding && <AddParticipantForm projectId={projectId} companies={companies} onSaved={() => setAdding(false)} />}
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

type ContactOption = Awaited<ReturnType<typeof getCompanyContacts>>[number];

function AddParticipantForm({
  projectId,
  companies,
  onSaved,
}: {
  projectId: string;
  companies: CompanyOption[];
  onSaved: () => void;
}) {
  const t = useTranslations();
  const tp = useTranslations("projects.participants");
  const [state, action] = useActionState(addParticipant, initialFormState);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (state.success) onSaved();
  }, [state, onSaved]);

  const selectCompany = async (id: string | null) => {
    setCompanyId(id);
    setContacts([]);
    if (id) setContacts(await getCompanyContacts(id));
  };

  return (
    <form action={action} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{tp("add")}</DialogTitle>
      </DialogHeader>
      <input type="hidden" name="project_id" value={projectId} />
      <FormMessage state={state.error ? state : initialFormState} />

      <div className="space-y-2">
        <Label htmlFor="participant-role">{tp("role")}</Label>
        <NativeSelect id="participant-role" name="role" defaultValue="client" required>
          {participantRoles.map((r) => (
            <option key={r} value={r}>
              {t(`options.participantRoles.${r}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="participant-company">{tp("company")}</Label>
        <CompanyPicker id="participant-company" name="company_id" options={companies} required onChange={selectCompany} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="participant-contact">{tp("contact")}</Label>
        <NativeSelect id="participant-contact" name="contact_id" key={companyId ?? "none"} disabled={!contacts.length}>
          <option value="">{tp("noContact")}</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {[c.first_name, c.last_name].filter(Boolean).join(" ")}
              {c.function ? ` (${c.function})` : ""}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="participant-note">{tp("note")}</Label>
        <Input id="participant-note" name="note" />
      </div>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{t("common.cancel")}</DialogClose>
        <SubmitButton>{t("common.add")}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
