"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { type CompanyOption, CompanyPicker } from "@/components/company-picker";
import { FormMessage, NativeSelect, SubmitButton } from "@/components/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tradeNames } from "@/lib/fees/options";
import { feeTrades } from "@/lib/fees/sia108";
import { initialFormState } from "@/lib/form-state";
import { localeToLanguage, type Locale } from "@/i18n/config";

import { getCompanyContacts } from "../../projekte/actions";
import { createFeeOffer } from "../actions";

type ContactOption = Awaited<ReturnType<typeof getCompanyContacts>>[number];

export function NewFeeOfferForm({ suggestedNumber, companies }: { suggestedNumber: string; companies: CompanyOption[] }) {
  const t = useTranslations();
  const tf = useTranslations("feeOffers.fields");
  const language = localeToLanguage(useLocale() as Locale);
  const [state, action] = useActionState(createFeeOffer, initialFormState);
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  const selectCompany = async (id: string | null) => {
    setContacts([]);
    if (id) setContacts(await getCompanyContacts(id));
  };

  const text = (name: "number" | "title" | "street" | "zip" | "city", className = "") => (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor={name}>{tf(name)}</Label>
      <Input id={name} name={name} defaultValue={name === "number" ? suggestedNumber : ""} required={name === "number" || name === "title"} autoFocus={name === "title"} />
    </div>
  );

  return (
    <form action={action} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader>
          <CardTitle>{t("feeOffers.sections.project")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          {text("number", "sm:col-span-1")}
          {text("title", "sm:col-span-3")}
          {text("street", "sm:col-span-4")}
          {text("zip", "sm:col-span-1")}
          {text("city", "sm:col-span-3")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("feeOffers.sections.client")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="company_id">{tf("company")}</Label>
            <CompanyPicker id="company_id" name="company_id" options={companies} onChange={selectCompany} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_id">{tf("contact")}</Label>
            <NativeSelect id="contact_id" name="contact_id" defaultValue="" disabled={!contacts.length}>
              <option value="">–</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.first_name, c.last_name].filter(Boolean).join(" ")}
                  {c.function ? ` (${c.function})` : ""}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="language">{tf("language")}</Label>
            <NativeSelect id="language" name="language" defaultValue={language}>
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
          <CardTitle>{t("feeOffers.sections.trades")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("feeOffers.tradesHint")}</p>
          <div className="flex flex-wrap gap-4">
            {feeTrades.map((trade) => (
              <label key={trade} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="trades" value={trade} />
                {tradeNames[trade][language]}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <SubmitButton>{t("feeOffers.create")}</SubmitButton>
    </form>
  );
}
