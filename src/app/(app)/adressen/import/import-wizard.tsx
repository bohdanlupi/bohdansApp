"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";

import { NativeSelect } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { companyCategories, trades } from "@/lib/address-options";
import {
  companyImportFields,
  contactImportFields,
  guessMapping,
  mapRows,
  parseCsv,
  type ImportTarget,
} from "@/lib/address-import";
import type { AppLanguage } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import { importAddresses, type ImportResult } from "./actions";

type Encoding = "utf-8" | "windows-1252";

/** Excel on Windows saves CSV as Windows-1252 unless "CSV UTF-8" is chosen. */
function decode(buffer: ArrayBuffer, encoding: Encoding | "auto"): { text: string; encoding: Encoding } {
  if (encoding === "auto") {
    try {
      return { text: new TextDecoder("utf-8", { fatal: true }).decode(buffer), encoding: "utf-8" };
    } catch {
      return decode(buffer, "windows-1252");
    }
  }
  return { text: new TextDecoder(encoding).decode(buffer), encoding };
}

export function ImportWizard() {
  const t = useTranslations();
  const ti = useTranslations("addresses.importPage");

  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [encoding, setEncoding] = useState<Encoding>("utf-8");
  const [table, setTable] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<(ImportTarget | null)[]>([]);
  const [fileError, setFileError] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("de");
  const [categories, setCategories] = useState<string[]>([]);
  const [tradeKeys, setTradeKeys] = useState<string[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  const load = (data: ArrayBuffer, enc: Encoding | "auto") => {
    const decoded = decode(data, enc);
    const rows = parseCsv(decoded.text);
    setEncoding(decoded.encoding);
    setResult(null);
    if (rows.length < 2) {
      setTable(null);
      setFileError(true);
      return;
    }
    setFileError(false);
    setTable(rows);
    setMapping(guessMapping(rows[0]));
  };

  const headers = table?.[0] ?? [];
  const dataRows = useMemo(() => table?.slice(1) ?? [], [table]);
  const mapped = useMemo(() => mapRows(dataRows, mapping), [dataRows, mapping]);
  const hasName = mapping.includes("company.name");

  const targetLabel = (target: ImportTarget) => {
    const [group, field] = target.split(".");
    return group === "company"
      ? t(`addresses.company.fields.${field as (typeof companyImportFields)[number]}`)
      : t(`addresses.contacts.fields.${field as (typeof contactImportFields)[number]}`);
  };

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const runImport = () =>
    startTransition(async () => {
      setResult(await importAddresses({ rows: mapped, language, categories, trades: tradeKeys }));
    });

  if (result && !result.error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-4">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-5 text-emerald-600" />
            {ti("done", { companies: result.companies ?? 0, contacts: result.contacts ?? 0, skipped: result.skipped ?? 0 })}
          </p>
          <Link href="/adressen" className={buttonVariants()}>
            {ti("toList")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{ti("step1")}</CardTitle>
          <CardDescription>{ti("fileHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <Input
            type="file"
            accept=".csv,.txt,text/csv"
            className="max-w-sm"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const data = await file.arrayBuffer();
              setBuffer(data);
              load(data, "auto");
            }}
          />
          {buffer && (
            <div className="space-y-2">
              <Label htmlFor="encoding">{ti("encoding")}</Label>
              <NativeSelect
                id="encoding"
                value={encoding}
                onChange={(e) => load(buffer, e.target.value as Encoding)}
                className="w-48"
              >
                <option value="utf-8">UTF-8</option>
                <option value="windows-1252">Windows (ANSI)</option>
              </NativeSelect>
            </div>
          )}
          {buffer && <p className="w-full text-xs text-muted-foreground">{ti("encodingHint")}</p>}
          {fileError && <p className="w-full text-sm text-destructive">{ti("invalidFile")}</p>}
        </CardContent>
      </Card>

      {table && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{ti("step2")}</CardTitle>
              <CardDescription>{ti("mappingHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{ti("column")}</TableHead>
                    <TableHead>{ti("example")}</TableHead>
                    <TableHead>{ti("target")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {headers.map((header, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{header || `#${index + 1}`}</TableCell>
                      <TableCell className="max-w-64 truncate text-muted-foreground">
                        {dataRows.find((r) => r[index]?.trim())?.[index]}
                      </TableCell>
                      <TableCell className="w-72">
                        <NativeSelect
                          value={mapping[index] ?? ""}
                          aria-label={header}
                          className={cn(!mapping[index] && "text-muted-foreground")}
                          onChange={(e) => {
                            const target = (e.target.value || null) as ImportTarget | null;
                            // A target can only be used once (except notes, which are joined).
                            setMapping((m) =>
                              m.map((v, i) =>
                                i === index ? target : v === target && target !== "company.notes" ? null : v,
                              ),
                            );
                          }}
                        >
                          <option value="">{ti("ignore")}</option>
                          <optgroup label={ti("groupCompany")}>
                            {companyImportFields.map((f) => (
                              <option key={f} value={`company.${f}`}>
                                {targetLabel(`company.${f}`)}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label={ti("groupContact")}>
                            {contactImportFields.map((f) => (
                              <option key={f} value={`contact.${f}`}>
                                {targetLabel(`contact.${f}`)}
                              </option>
                            ))}
                          </optgroup>
                        </NativeSelect>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="grid gap-6 sm:grid-cols-[12rem_1fr]">
                <div className="space-y-2">
                  <Label htmlFor="import-language">{t("addresses.company.fields.language")}</Label>
                  <NativeSelect
                    id="import-language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as AppLanguage)}
                  >
                    {(["de", "fr", "it"] as const).map((l) => (
                      <option key={l} value={l}>
                        {t(`languages.${l}`)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-4">
                  <ChipToggle
                    label={ti("assignCategories")}
                    options={companyCategories.map((c) => ({ value: c, label: t(`options.categories.${c}`) }))}
                    selected={categories}
                    onToggle={(v) => setCategories((list) => toggle(list, v))}
                  />
                  <ChipToggle
                    label={ti("assignTrades")}
                    options={trades.map((tr) => ({ value: tr, label: t(`options.trades.${tr}`) }))}
                    selected={tradeKeys}
                    onToggle={(v) => setTradeKeys((list) => toggle(list, v))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{ti("step3")}</CardTitle>
              <CardDescription>{ti("previewHint", { rows: dataRows.length })}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("addresses.company.fields.name")}</TableHead>
                    <TableHead>{t("addresses.company.fields.street")}</TableHead>
                    <TableHead>{t("addresses.company.fields.city")}</TableHead>
                    <TableHead>{t("addresses.contacts.title")}</TableHead>
                    <TableHead>{t("addresses.company.fields.email")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mapped.slice(0, 10).map((row, i) => (
                    <TableRow key={i} className={cn(!row.name && "text-muted-foreground line-through")}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.street}</TableCell>
                      <TableCell>{[row.zip, row.city].filter(Boolean).join(" ")}</TableCell>
                      <TableCell>{[row.contact_first_name, row.contact_last_name].filter(Boolean).join(" ")}</TableCell>
                      <TableCell>{row.email ?? row.contact_email}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {!hasName && <p className="text-sm text-destructive">{ti("nameRequired")}</p>}
              {result?.error && <p className="text-sm text-destructive">{t(`forms.${result.error}`)}</p>}
              <Button onClick={runImport} disabled={!hasName || pending}>
                {ti("start")}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ChipToggle({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected.includes(o.value)}
            onClick={() => onToggle(o.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted",
              "aria-pressed:border-brand aria-pressed:bg-brand/10 aria-pressed:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
