"use client";

import { FileText, FolderPlus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { type CompanyOption, CompanyPicker } from "@/components/company-picker";
import { ConfirmButton } from "@/components/confirm-button";
import { NativeSelect } from "@/components/form";
import { fmt, NumberField, Section } from "@/components/planning/fields";
import { NumberParam, SaveIndicator } from "@/components/planning/plan-ui";
import { usePlan } from "@/components/planning/use-plan";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { localeToLanguage, type Locale } from "@/i18n/config";
import { feeTotals } from "@/lib/fees/calc";
import { type FeeOfferData, MAX_EXTRAS } from "@/lib/fees/offer-schema";
import { type FeeOfferStatus, feeOfferStatuses, phaseLabel, tradeNames } from "@/lib/fees/options";
import { formatMoney } from "@/lib/number-input";
import type { AppLanguage } from "@/lib/supabase/types";

import { getCompanyContacts } from "../../projekte/actions";
import { CreateInvoiceButton } from "../../honorarrechnungen/create-invoice-button";
import { createProjectFromOffer, deleteFeeOffer, saveFeeOffer } from "../actions";
import { CommitInput } from "@/components/planning/commit-input";
import { type FeeDefaults, FeeSection } from "./fee-section";
import { PositionsSection } from "./positions-section";
import { ServicesSection } from "./services-section";

const to5Rappen = (v: number | null) => (v === null ? null : Math.round(v * 20) / 20);

export type FeeOfferHeaderState = {
  number: string;
  title: string;
  status: FeeOfferStatus;
  company_id: string | null;
  contact_id: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  language: AppLanguage;
  offer_date: string;
  valid_until: string | null;
};

type ContactOption = { id: string; first_name: string | null; last_name: string; function: string | null };

type State = { header: FeeOfferHeaderState; data: FeeOfferData };

export function FeeOfferEditor({
  id,
  initialHeader,
  initialData,
  project,
  companies,
  initialContacts,
  vatRate,
  defaults,
  editable,
  locked,
  canInvoice,
}: {
  id: string;
  initialHeader: FeeOfferHeaderState;
  initialData: FeeOfferData;
  project: { id: string; number: string; name: string } | null;
  companies: (CompanyOption & { street: string | null; zip: string | null })[];
  initialContacts: ContactOption[];
  vatRate: number;
  defaults: FeeDefaults;
  editable: boolean;
  /** Has a paid invoice: read-only. */
  locked: boolean;
  /** May create invoices (writers; also when the offer is locked). */
  canInvoice: boolean;
}) {
  const t = useTranslations("feeOffers");
  const tCommon = useTranslations();
  const language = localeToLanguage(useLocale() as Locale);
  const { plan, update, status } = usePlan<State>(id, { header: initialHeader, data: initialData }, editable, saveFeeOffer);
  const [contacts, setContacts] = useState(initialContacts);
  const { header, data } = plan;
  const totals = useMemo(() => feeTotals(data, vatRate), [data, vatRate]);
  const free = data.kind === "positions";

  const setHeader = (change: Partial<FeeOfferHeaderState>) => update((s) => ({ ...s, header: { ...s.header, ...change } }));
  const setData = (change: (d: FeeOfferData) => FeeOfferData) => update((s) => ({ ...s, data: change(s.data) }));

  const selectCompany = async (companyId: string | null) => {
    const company = companies.find((c) => c.id === companyId);
    setHeader({ company_id: companyId, contact_id: null, ...(company ? { street: company.street, zip: company.zip, city: company.city } : {}) });
    setContacts(companyId ? await getCompanyContacts(companyId) : []);
  };

  const text = (key: "number" | "title" | "street" | "zip" | "city", className = "") => (
    <div className={`space-y-1.5 ${className}`}>
      <Label htmlFor={`offer-${key}`}>{t(`fields.${key}`)}</Label>
      <CommitInput
        id={`offer-${key}`}
        value={header[key] ?? ""}
        required={key === "number" || key === "title"}
        disabled={!editable}
        onCommit={(v) => setHeader({ [key]: v || null })}
      />
    </div>
  );

  const date = (key: "offer_date" | "valid_until") => (
    <div className="space-y-1.5">
      <Label htmlFor={`offer-${key}`}>{t(`fields.${key}`)}</Label>
      <CommitInput
        id={`offer-${key}`}
        type="date"
        value={header[key] ?? ""}
        required={key === "offer_date"}
        disabled={!editable}
        onCommit={(v) => setHeader({ [key]: v || null })}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {header.number} {header.title}
          </h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {t("summary.net")}: CHF {formatMoney(totals.net)} · {t("summary.total")}: CHF {formatMoney(totals.total)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SaveIndicator status={status} />
          <a href={`/api/pdf/honorarofferte/${id}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
            <FileText />
            {t("pdf")}
          </a>
          {canInvoice && project && header.status === "accepted" && status === "saved" && <CreateInvoiceButton offerId={id} offerNumber={header.number} variant="outline" />}
          {project ? (
            <Link href={`/projekte/${project.id}`} className={buttonVariants({ variant: "outline" })}>
              {t("toProject", { number: project.number })}
            </Link>
          ) : (
            editable && (
              <ConfirmButton
                variant="outline"
                label={t("createProject")}
                trigger={
                  <>
                    <FolderPlus />
                    {t("createProject")}
                  </>
                }
                title={t("createProjectTitle")}
                text={t("createProjectText")}
                confirmLabel={t("createProject")}
                onConfirm={() => createProjectFromOffer(id)}
              />
            )
          )}
          {editable && (
            <ConfirmButton
              variant="outline"
              label={t("delete")}
              trigger={<Trash2 />}
              title={t("deleteTitle")}
              text={t("deleteText", { number: header.number })}
              confirmLabel={t("delete")}
              onConfirm={() => deleteFeeOffer(id)}
            />
          )}
        </div>
      </div>

      {locked && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{t("lockedHint")}</p>}

      <Section title={t("sections.offer")} collapseKey="fee-offer:header">
        <div className="grid gap-4 sm:grid-cols-6">
          {text("number", "sm:col-span-1")}
          {text("title", "sm:col-span-3")}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="offer-status">{t("fields.status")}</Label>
            <NativeSelect id="offer-status" value={header.status} disabled={!editable} onChange={(e) => setHeader({ status: e.target.value as FeeOfferStatus })}>
              {feeOfferStatuses.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="offer-company">{t("fields.company")}</Label>
            {editable ? (
              <CompanyPicker id="offer-company" name="company_id" options={companies} defaultValue={header.company_id} onChange={selectCompany} />
            ) : (
              <p className="text-sm">{companies.find((c) => c.id === header.company_id)?.name ?? "–"}</p>
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="offer-contact">{t("fields.contact")}</Label>
            <NativeSelect id="offer-contact" value={header.contact_id ?? ""} disabled={!editable || !contacts.length} onChange={(e) => setHeader({ contact_id: e.target.value || null })}>
              <option value="">–</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.first_name, c.last_name].filter(Boolean).join(" ")}
                  {c.function ? ` (${c.function})` : ""}
                </option>
              ))}
            </NativeSelect>
          </div>
          {text("street", "sm:col-span-3")}
          {text("zip", "sm:col-span-1")}
          {text("city", "sm:col-span-2")}
          <div className="sm:col-span-2">{date("offer_date")}</div>
          <div className="sm:col-span-2">{date("valid_until")}</div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="offer-language">{t("fields.language")}</Label>
            <NativeSelect id="offer-language" value={header.language} disabled={!editable} onChange={(e) => setHeader({ language: e.target.value as AppLanguage })}>
              {(["de", "fr", "it"] as const).map((l) => (
                <option key={l} value={l}>
                  {tCommon(`languages.${l}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className={free ? "space-y-1.5 sm:col-span-6" : "space-y-1.5 sm:col-span-3"}>
            <Label htmlFor="offer-description">{t(free ? "fields.scope" : "fields.description")}</Label>
            <CommitInput id="offer-description" multiline rows={5} value={data.description} placeholder={t(free ? "scopePlaceholder" : "descriptionPlaceholder")} disabled={!editable} onCommit={(description) => setData((d) => ({ ...d, description }))} />
          </div>
          {!free && (
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="offer-basis">{t("fields.basis")}</Label>
            <CommitInput id="offer-basis" multiline rows={5} value={data.basis} placeholder={t("basisPlaceholder")} disabled={!editable} onCommit={(basis) => setData((d) => ({ ...d, basis }))} />
            <p className="text-xs text-muted-foreground">{t("basisHint")}</p>
          </div>
          )}
        </div>
      </Section>

      {free ? (
        <PositionsSection data={data} onChange={setData} editable={editable} suggestion={defaults} />
      ) : (
        <>
          <FeeSection data={data} onChange={setData} editable={editable} language={language} totals={totals} defaults={defaults} />
          <ServicesSection data={data} onChange={setData} editable={editable} language={language} />
        </>
      )}

      <Section title={t("sections.conditions")} collapseKey="fee-offer:conditions">
        {!free && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("extras.title")}</p>
          <p className="text-xs text-muted-foreground">{t("extras.hint")}</p>
          {data.extras.map((e) => (
            <div key={e.id} className="flex items-center gap-2">
              <CommitInput
                aria-label={t("extras.text")}
                value={e.text}
                placeholder={t("extras.text")}
                disabled={!editable}
                className="h-7 flex-1"
                onCommit={(v) => setData((d) => ({ ...d, extras: d.extras.map((x) => (x.id === e.id ? { ...x, text: v } : x)) }))}
              />
              <NumberField
                label={t("extras.amount")}
                value={e.amount}
                decimals={2}
                disabled={!editable}
                className="w-32"
                onChange={(amount) => setData((d) => ({ ...d, extras: d.extras.map((x) => (x.id === e.id ? { ...x, amount: to5Rappen(amount) } : x)) }))}
              />
              {editable && (
                <Button variant="ghost" size="icon-sm" aria-label={t("extras.remove")} onClick={() => setData((d) => ({ ...d, extras: d.extras.filter((x) => x.id !== e.id) }))}>
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
          {editable && data.extras.length < MAX_EXTRAS && (
            <Button variant="ghost" size="sm" onClick={() => setData((d) => ({ ...d, extras: [...d.extras, { id: crypto.randomUUID(), text: "", amount: null }] }))}>
              <Plus />
              {t("extras.add")}
            </Button>
          )}
        </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberParam label={t("fields.discountPct")} value={data.discountPct} decimals={1} editable={editable} onChange={(v) => setData((d) => ({ ...d, discountPct: Math.min(100, v ?? 0) }))} />
          <NumberParam label={t("fields.expensesPct")} value={data.expensesPct} decimals={1} editable={editable} onChange={(v) => setData((d) => ({ ...d, expensesPct: Math.min(100, v ?? 0) }))} />
          <div className="grid grid-cols-2 gap-2">
            <NumberParam label={t("fields.skontoPct")} value={data.skontoPct} decimals={1} editable={editable} onChange={(v) => setData((d) => ({ ...d, skontoPct: Math.min(100, v ?? 0) }))} />
            <NumberParam label={t("fields.skontoDays")} value={data.skontoDays} editable={editable && data.skontoPct > 0} onChange={(v) => setData((d) => ({ ...d, skontoDays: Math.min(365, Math.max(0, Math.round(v ?? 0))) }))} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="offer-expenses">{t("fields.expensesText")}</Label>
          <CommitInput id="offer-expenses" multiline rows={3} value={data.expensesText} disabled={!editable} onCommit={(expensesText) => setData((d) => ({ ...d, expensesText }))} />
        </div>
      </Section>

      <Section title={t("sections.summary")} collapseKey="fee-offer:summary">
        {!free && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 text-left font-medium">{t("fee.phase")}</th>
                {totals.trades.map((tr) => (
                  <th key={tr.trade} className="py-1.5 pl-3 text-right font-medium">
                    {tradeNames[tr.trade][language]}
                  </th>
                ))}
                <th className="py-1.5 pl-3 text-right font-medium">{t("summary.sum")}</th>
              </tr>
            </thead>
            <tbody>
              {totals.phases.map((ph) => (
                <tr key={ph.phase} className="border-b">
                  <td className="py-1">{phaseLabel(ph.phase, language)}</td>
                  {totals.trades.map((tr) => {
                    const p = tr.phases.find((x) => x.phase === ph.phase);
                    return (
                      <td key={tr.trade} className="py-1 pl-3 text-right">
                        {p ? (p.amount === null ? "–" : formatMoney(p.amount)) : ""}
                      </td>
                    );
                  })}
                  <td className="py-1 pl-3 text-right font-medium">{formatMoney(ph.amount)}</td>
                </tr>
              ))}
              <tr className="border-b font-medium">
                <td className="py-1">{t("summary.fees")}</td>
                {totals.trades.map((tr) => (
                  <td key={tr.trade} className="py-1 pl-3 text-right">
                    {formatMoney(tr.amount)}
                  </td>
                ))}
                <td className="py-1 pl-3 text-right">{formatMoney(totals.fees)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        )}
        <dl className="ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm tabular-nums">
          {totals.extras > 0 && (
            <>
              <dt>{t("summary.extras")}</dt>
              <dd className="text-right">{formatMoney(totals.extras)}</dd>
            </>
          )}
          <dt>{t(free ? "summary.positions" : "summary.subtotal")}</dt>
          <dd className="text-right">{formatMoney(totals.subtotal)}</dd>
          {totals.discount > 0 && (
            <>
              <dt>{t("summary.discount", { pct: fmt(data.discountPct, 1) })}</dt>
              <dd className="text-right">−{formatMoney(totals.discount)}</dd>
            </>
          )}
          <dt>{t("summary.expenses", { pct: fmt(data.expensesPct, 1) })}</dt>
          <dd className="text-right">{formatMoney(totals.expenses)}</dd>
          <dt className="font-medium">{t("summary.net")}</dt>
          <dd className="text-right font-medium">{formatMoney(totals.net)}</dd>
          <dt>{t("summary.vat", { pct: fmt(vatRate, 1) })}</dt>
          <dd className="text-right">{formatMoney(totals.vat)}</dd>
          <dt className="font-semibold">{t("summary.total")}</dt>
          <dd className="text-right font-semibold">{formatMoney(totals.total)}</dd>
          {totals.skonto > 0 && (
            <>
              <dt className="text-muted-foreground">{t("summary.skonto", { pct: fmt(data.skontoPct, 1), days: data.skontoDays })}</dt>
              <dd className="text-right text-muted-foreground">−{formatMoney(totals.skonto)}</dd>
            </>
          )}
        </dl>
      </Section>
    </div>
  );
}
