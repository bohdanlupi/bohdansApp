"use client";

import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormMessage, SubmitButton } from "@/components/form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialFormState } from "@/lib/form-state";
import type { FirmSettings } from "@/lib/supabase/types";

import type messages from "../../../../messages/de-CH.json";

import { updateFirmSettings } from "./actions";

type Field = {
  name: keyof FirmSettings & keyof (typeof messages)["settings"]["firm"]["fields"];
  type?: string;
  step?: string;
  span?: boolean;
};

const sections: { key: keyof (typeof messages)["settings"]["firm"]["sections"]; fields: Field[] }[] = [
  {
    key: "address",
    fields: [
      { name: "name", span: true },
      { name: "street", span: true },
      { name: "zip" },
      { name: "city" },
      { name: "phone" },
      { name: "email", type: "email" },
      { name: "website" },
      { name: "managing_director" },
    ],
  },
  {
    key: "banking",
    fields: [{ name: "uid_number" }, { name: "bank_name" }, { name: "iban" }, { name: "bic" }],
  },
  {
    key: "defaults",
    fields: [
      { name: "vat_rate", type: "number", step: "0.01" },
      { name: "offer_validity_days", type: "number" },
      { name: "payment_terms_days", type: "number" },
    ],
  },
];

export function FirmForm({ firm, editable }: { firm: FirmSettings; editable: boolean }) {
  const t = useTranslations("settings.firm");
  const [state, action] = useActionState(updateFirmSettings, initialFormState);

  return (
    <form action={action} className="space-y-6">
      {!editable && <p className="text-sm text-muted-foreground">{t("readOnly")}</p>}
      <FormMessage state={state} />
      <fieldset disabled={!editable} className="space-y-6">
        {sections.map((section) => (
          <Card key={section.key}>
            <CardHeader>
              <CardTitle>{t(`sections.${section.key}`)}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {section.fields.map((field) => (
                <div key={field.name} className={field.span ? "space-y-2 sm:col-span-2" : "space-y-2"}>
                  <Label htmlFor={field.name}>{t(`fields.${field.name}`)}</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type={field.type ?? "text"}
                    step={field.step}
                    defaultValue={String(firm[field.name] ?? "")}
                    required={field.name === "name"}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </fieldset>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.letterhead")}</CardTitle>
          <CardDescription>{t("letterheadHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/api/pdf/briefkopf"
            target="_blank"
            rel="noopener"
            className={buttonVariants({ variant: "outline" })}
          >
            <FileText />
            {t("letterheadPreview")}
          </a>
        </CardContent>
      </Card>

      {editable && <SubmitButton>{t("save")}</SubmitButton>}
    </form>
  );
}
