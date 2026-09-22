import { Building2, Plus, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { NativeSelect } from "@/components/form";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { companyCategories, onlyKnown, trades } from "@/lib/address-options";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { param, searchWords } from "@/lib/validation";

const PAGE_SIZE = 50;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("addresses") };
}

export default async function AddressesPage({ searchParams }: PageProps<"/adressen">) {
  const profile = await requireProfile();
  const t = await getTranslations();
  const canWrite = profile.role !== "viewer";

  const search = await searchParams;
  const q = param(search.q)?.trim() ?? "";
  const category = onlyKnown([param(search.kategorie) ?? ""], companyCategories)[0];
  const trade = onlyKnown([param(search.gewerk) ?? ""], trades)[0];
  const showArchived = param(search.archiv) === "1";
  const page = Math.max(1, Number(param(search.seite)) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("company_list")
    .select("id, name, name2, zip, city, phone, categories, archived, contact_count", { count: "exact" })
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  for (const word of searchWords(q)) query = query.ilike("search_text", `%${word}%`);
  if (category) query = query.contains("categories", [category]);
  if (trade) query = query.contains("trades", [trade]);
  if (!showArchived) query = query.eq("archived", false);
  const { data: companies, count } = await query;

  const filtered = Boolean(q || category || trade || showArchived);
  const isEmpty = !companies?.length;

  return (
    <>
      <PageHeader
        title={t("addresses.title")}
        description={t("addresses.description")}
        actions={
          canWrite && (
            <>
              <Link href="/adressen/import" className={buttonVariants({ variant: "outline" })}>
                <Upload />
                {t("addresses.import")}
              </Link>
              <Link href="/adressen/neu" className={buttonVariants()}>
                <Plus />
                {t("addresses.newCompany")}
              </Link>
            </>
          )
        }
      />

      {isEmpty && !filtered ? (
        <EmptyState icon={Building2} title={t("addresses.emptyTitle")} text={t("addresses.emptyText")} />
      ) : (
        <>
          <form className="mb-4 flex flex-wrap items-center gap-2">
            <Input
              name="q"
              defaultValue={q}
              placeholder={t("addresses.searchPlaceholder")}
              aria-label={t("common.search")}
              className="w-72"
            />
            <NativeSelect name="kategorie" defaultValue={category ?? ""} className="w-48">
              <option value="">{t("addresses.allCategories")}</option>
              {companyCategories.map((c) => (
                <option key={c} value={c}>
                  {t(`options.categories.${c}`)}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="gewerk" defaultValue={trade ?? ""} className="w-48">
              <option value="">{t("addresses.allTrades")}</option>
              {trades.map((tr) => (
                <option key={tr} value={tr}>
                  {t(`options.trades.${tr}`)}
                </option>
              ))}
            </NativeSelect>
            <label className="flex items-center gap-2 px-1 text-sm">
              <input type="checkbox" name="archiv" value="1" defaultChecked={showArchived} />
              {t("addresses.showArchived")}
            </label>
            <Button type="submit" variant="secondary">
              {t("common.search")}
            </Button>
            {filtered && (
              <Link href="/adressen" className={buttonVariants({ variant: "ghost" })}>
                {t("common.reset")}
              </Link>
            )}
          </form>

          {isEmpty ? (
            <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
              {t("addresses.noResults")}
            </p>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">{t("addresses.columns.name")}</TableHead>
                    <TableHead>{t("addresses.columns.city")}</TableHead>
                    <TableHead>{t("addresses.columns.categories")}</TableHead>
                    <TableHead>{t("addresses.columns.phone")}</TableHead>
                    <TableHead className="pr-4 text-right">{t("addresses.columns.contacts")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((c) => (
                    <TableRow key={c.id} className="relative">
                      <TableCell className="pl-4">
                        <Link href={`/adressen/${c.id}`} className="font-medium after:absolute after:inset-0">
                          {c.name}
                        </Link>
                        {c.name2 && <span className="ml-2 text-muted-foreground">{c.name2}</span>}
                        {c.archived && (
                          <Badge variant="outline" className="ml-2">
                            {t("addresses.archived")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{[c.zip, c.city].filter(Boolean).join(" ")}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {onlyKnown(c.categories ?? [], companyCategories).map((cat) => (
                            <Badge key={cat} variant="secondary">
                              {t(`options.categories.${cat}`)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{c.phone}</TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">{c.contact_count || ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={count ?? 0}
            params={{ q, kategorie: category, gewerk: trade, archiv: showArchived ? "1" : undefined }}
          />
        </>
      )}
    </>
  );
}
