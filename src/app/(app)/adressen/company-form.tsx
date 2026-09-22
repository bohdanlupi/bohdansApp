"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormMessage, NativeSelect, SubmitButton } from "@/components/form";
import { OptionChips } from "@/components/option-chips";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { companyCategories, trades } from "@/lib/address-options";
import { initialFormState } from "@/lib/form-state";
import type { Company } from "@/lib/supabase/types";

import { createCompany, updateCompany } from "./actions";

type TextField = "name" | "name2" | "street" | "po_box" | "zip" | "city" | "country" | "phone" | "email" | "website" | "uid_number";

const addressFields: { name: TextField; className?: string }[] = [
  { name: "name", className: "sm:col-span-4" },
  { name: "name2", className: "sm:col-span-4" },
  { name: "street", className: "sm:col-span-3" },
  { name: "po_box", className: "sm:col-span-1" },
  { name: "zip", className: "sm:col-span-1" },
  { name: "city", className: "sm:col-span-2" },
  { name: "country", className: "sm:col-span-1" },
];

const communicationFields: { name: TextField; type?: string }[] = [
  { name: "phone", type: "tel" },
  { name: "email", type: "email" },
  { name: "website" },
  { name: "uid_number" },
];

/** Create form when `company` is undefined, otherwise edit form. */
export function CompanyForm({ company, editable }: { company?: Company; editable: boolean }) {
  const t = useTranslations();
  const tf = useTranslations("addresses.company");
  const [state, action] = useActionState(company ? updateCompany : createCompany, initialFormState);

  return (
    <form action={action} className="space-y-6">
      {company && <input type="hidden" name="id" value={company.id} />}
      {!editable && <p className="text-sm text-muted-foreground">{tf("readOnly")}</p>}
      <FormMessage state={state} />

      <fieldset disabled={!editable} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{tf("sections.address")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-4">
            {addressFields.map((field) => (
              <div key={field.name} className={`space-y-2 ${field.className ?? ""}`}>
                <Label htmlFor={field.name}>{tf(`fields.${field.name}`)}</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  defaultValue={company?.[field.name] ?? (field.name === "country" ? "CH" : "")}
                  maxLength={field.name === "country" ? 2 : undefined}
                  required={field.name === "name"}
                  autoFocus={!company && field.name === "name"}
                />
              </div>
            ))}
            {!company && <p className="text-xs text-muted-foreground sm:col-span-4">{tf("privateHint")}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{tf("sections.communication")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {communicationFields.map((field) => (
              <div key={field.name} className="space-y-2">
                <Label htmlFor={field.name}>{tf(`fields.${field.name}`)}</Label>
                <Input id={field.name} name={field.name} type={field.type ?? "text"} defaultValue={company?.[field.name] ?? ""} />
              </div>
            ))}
            <div className="space-y-2">
              <Label htmlFor="language">{tf("fields.language")}</Label>
              <NativeSelect id="language" name="language" defaultValue={company?.language ?? "de"}>
                {(["de", "fr", "it"] as const).map((l) => (
                  <option key={l} value={l}>
                    {t(`languages.${l}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{tf("sections.classification")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>{tf("fields.categories")}</Label>
              <OptionChips
                name="categories"
                defaultValue={company?.categories}
                disabled={!editable}
                options={companyCategories.map((c) => ({ value: c, label: t(`options.categories.${c}`) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{tf("fields.trades")}</Label>
              <OptionChips
                name="trades"
                defaultValue={company?.trades}
                disabled={!editable}
                options={trades.map((tr) => ({ value: tr, label: t(`options.trades.${tr}`) }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{tf("sections.notes")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea name="notes" aria-label={tf("fields.notes")} defaultValue={company?.notes ?? ""} rows={3} />
            {company && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="archived" defaultChecked={company.archived} />
                {tf("fields.archived")}
              </label>
            )}
          </CardContent>
        </Card>
      </fieldset>

      {editable && <SubmitButton>{company ? t("common.save") : tf("create")}</SubmitButton>}
    </form>
  );
}
