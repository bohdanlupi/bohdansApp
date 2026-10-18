"use client";

import { FileText, Plus, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useRef, useState, useTransition } from "react";

import { type CompanyOption, CompanyPicker } from "@/components/company-picker";
import { ConfirmButton } from "@/components/confirm-button";
import { FormMessage, NativeSelect } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { creditorCategories, type CreditorCategory, creditorStatuses, type CreditorStatus, inputTaxZiffer, splitVat, vatRates } from "@/lib/creditors";
import { initialFormState } from "@/lib/form-state";
import { formatMoney, parseNumber } from "@/lib/number-input";
import { createClient } from "@/lib/supabase/client";

import { createSupplier, deleteCreditorInvoice, saveCreditorInvoice } from "./actions";

export type CreditorInvoiceValues = {
  id: string;
  company_id: string | null;
  project_id: string | null;
  number: string;
  invoice_date: string;
  due_date: string | null;
  status: CreditorStatus;
  paid_date: string | null;
  category: CreditorCategory;
  total: number | null;
  vat_rate: number;
  description: string;
  file_path: string | null;
  file_name: string | null;
};

const ACCEPT = "application/pdf,image/jpeg,image/png";
const MAX_BYTES = 10 * 1024 * 1024;

/** Object name in the bucket: the invoice id as folder, a timestamp so a replaced document gets a new name. */
const objectPath = (id: string, file: File) => `${id}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]+/g, "_")}`;

/**
 * Received invoice: supplier (address book, with quick-add), amount incl. MWST and rate, category, optional project
 * and the original document, uploaded straight to the storage bucket before the form is sent.
 */
export function CreditorForm({
  initial,
  isNew,
  companies: initialCompanies,
  projects,
  editable,
}: {
  initial: CreditorInvoiceValues;
  isNew: boolean;
  companies: CompanyOption[];
  projects: { id: string; number: string; name: string }[];
  editable: boolean;
}) {
  const t = useTranslations("creditors");
  const tc = useTranslations("common");
  const [state, action] = useActionState(saveCreditorInvoice, initialFormState);
  const [pending, startTransition] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [companies, setCompanies] = useState(initialCompanies);
  const [companyId, setCompanyId] = useState(initial.company_id);
  const [pickerKey, setPickerKey] = useState(0);
  const [supplierOpen, setSupplierOpen] = useState(false);

  const [total, setTotal] = useState(initial.total === null ? "" : formatMoney(initial.total));
  const [rate, setRate] = useState(initial.vat_rate);
  const [category, setCategory] = useState(initial.category);
  const [status, setStatus] = useState(initial.status);
  const [file, setFile] = useState<{ path: string; name: string } | null>(
    initial.file_path ? { path: initial.file_path, name: initial.file_name ?? "" } : null,
  );
  const [newFile, setNewFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const amount = parseNumber(total);
  const split = amount === null ? null : splitVat(amount, rate);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setUploadError(null);
    startTransition(async () => {
      let document = file;
      if (newFile) {
        const path = objectPath(initial.id, newFile);
        const { error } = await createClient().storage.from("receipts").upload(path, newFile, { contentType: newFile.type });
        if (error) {
          setUploadError(t("uploadFailed"));
          return;
        }
        document = { path, name: newFile.name };
        setFile(document);
        setNewFile(null);
        if (fileInput.current) fileInput.current.value = "";
      }
      formData.set("file_path", document?.path ?? "");
      formData.set("file_name", document?.name ?? "");
      action(formData);
    });
  };

  const pickFile = (f: File | undefined) => {
    setUploadError(null);
    if (!f) return setNewFile(null);
    if (!ACCEPT.split(",").includes(f.type)) return setUploadError(t("fileType"));
    if (f.size > MAX_BYTES) return setUploadError(t("fileSize"));
    setNewFile(f);
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <input type="hidden" name="id" value={initial.id} />
      <input type="hidden" name="isNew" value={isNew ? "1" : ""} />
      {!editable && <p className="text-sm text-muted-foreground">{t("readOnly")}</p>}
      <FormMessage state={state} />
      {uploadError && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{uploadError}</p>}

      <fieldset disabled={!editable || pending} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("sections.invoice")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-6">
            <div className="space-y-2 sm:col-span-4">
              <Label htmlFor="company_id">{t("fields.supplier")}</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <CompanyPicker key={pickerKey} id="company_id" name="company_id" options={companies} defaultValue={companyId} required onChange={setCompanyId} />
                </div>
                {editable && (
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setSupplierOpen(true)}>
                    <Plus className="size-4" />
                    {t("newSupplier")}
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="number">{t("fields.number")}</Label>
              <Input id="number" name="number" defaultValue={initial.number} maxLength={80} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="invoice_date">{t("fields.invoiceDate")}</Label>
              <Input id="invoice_date" name="invoice_date" type="date" defaultValue={initial.invoice_date} required />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="due_date">{t("fields.dueDate")}</Label>
              <Input id="due_date" name="due_date" type="date" defaultValue={initial.due_date ?? ""} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="project_id">{t("fields.project")}</Label>
              <NativeSelect id="project_id" name="project_id" defaultValue={initial.project_id ?? ""}>
                <option value="">{t("noProject")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.number} {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="total">{t("fields.total")}</Label>
              <Input
                id="total"
                name="total"
                inputMode="decimal"
                className="text-right tabular-nums"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                onBlur={() => amount !== null && setTotal(formatMoney(amount))}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="vat_rate">{t("fields.vatRate")}</Label>
              <NativeSelect id="vat_rate" name="vat_rate" value={String(rate)} onChange={(e) => setRate(Number(e.target.value))}>
                {vatRates.map((r) => (
                  <option key={r} value={r}>
                    {t(`rates.${String(r).replace(".", "_") as "8_1"}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="category">{t("fields.category")}</Label>
              <NativeSelect id="category" name="category" value={category} onChange={(e) => setCategory(e.target.value as CreditorCategory)}>
                {creditorCategories.map((c) => (
                  <option key={c} value={c}>
                    {t(`categories.${c}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <p className="text-sm text-muted-foreground tabular-nums sm:col-span-6">
              {split ? t("split", { net: formatMoney(split.net), vat: formatMoney(split.vat), ziffer: inputTaxZiffer(category) }) : t("splitEmpty")}
            </p>

            <div className="space-y-2 sm:col-span-6">
              <Label htmlFor="description">{t("fields.description")}</Label>
              <Textarea id="description" name="description" defaultValue={initial.description} rows={2} maxLength={2000} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("sections.payment")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-6">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="status">{t("fields.status")}</Label>
              <NativeSelect id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value as CreditorStatus)}>
                {creditorStatuses.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {status === "paid" && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="paid_date">{t("fields.paidDate")}</Label>
                <Input id="paid_date" name="paid_date" type="date" defaultValue={initial.paid_date ?? new Date().toLocaleDateString("sv-SE")} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("sections.document")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {file && !newFile && (
              <div className="flex items-center gap-3 text-sm">
                <a href={`/api/kreditoren/beleg/${initial.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-medium hover:underline">
                  <FileText className="size-4" />
                  {file.name || t("document")}
                </a>
                {editable && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setFile(null)}>
                    <Trash2 className="size-4" />
                    {t("removeDocument")}
                  </Button>
                )}
              </div>
            )}
            {editable && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Upload className="size-4 text-muted-foreground" />
                <input ref={fileInput} type="file" accept={ACCEPT} onChange={(e) => pickFile(e.target.files?.[0])} className="text-sm file:mr-3 file:rounded-md file:border file:bg-transparent file:px-2 file:py-1" />
              </label>
            )}
            <p className="text-xs text-muted-foreground">{t("documentHint")}</p>
          </CardContent>
        </Card>
      </fieldset>

      {editable && (
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending}>
            {tc("save")}
          </Button>
          {!isNew && (
            <ConfirmButton
              label={tc("delete")}
              title={t("deleteTitle")}
              text={t("deleteText")}
              confirmLabel={tc("delete")}
              variant="outline"
              onConfirm={() => deleteCreditorInvoice(initial.id)}
            />
          )}
        </div>
      )}

      <SupplierDialog
        open={supplierOpen}
        onOpenChange={setSupplierOpen}
        onCreated={(company) => {
          setCompanies((list) => [...list, company].sort((a, b) => a.name.localeCompare(b.name, "de")));
          setCompanyId(company.id);
          setPickerKey((k) => k + 1);
          setSupplierOpen(false);
        }}
      />
    </form>
  );
}

/** Quick-add of a supplier (no nested form: the dialog renders inside the invoice form's React tree). */
function SupplierDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (c: CompanyOption) => void }) {
  const t = useTranslations("creditors");
  const ta = useTranslations("addresses.company.fields");
  const tc = useTranslations("common");
  const [values, setValues] = useState({ name: "", street: "", zip: "", city: "" });
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      const result = await createSupplier(values);
      if (!result.company) return setError(true);
      setValues({ name: "", street: "", zip: "", city: "" });
      setError(false);
      onCreated(result.company);
    });

  const field = (name: keyof typeof values, className = "") => (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor={`supplier-${name}`}>{ta(name)}</Label>
      <Input
        id={`supplier-${name}`}
        value={values[name]}
        onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (values.name.trim()) create();
          }
        }}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("newSupplier")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-3">
          {field("name", "sm:col-span-3")}
          {field("street", "sm:col-span-3")}
          {field("zip")}
          {field("city", "sm:col-span-2")}
        </div>
        {error && <p className="text-sm text-destructive">{t("supplierFailed")}</p>}
        <p className="text-xs text-muted-foreground">{t("supplierHint")}</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button type="button" onClick={create} disabled={pending || !values.name.trim()}>
            {t("createSupplier")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
