import { FileSignature, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { NativeSelect } from "@/components/form";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireProfile } from "@/lib/auth";
import { feeTotals } from "@/lib/fees/calc";
import { parseFeeOfferData } from "@/lib/fees/offer-schema";
import { type FeeOfferStatus, feeOfferStatuses } from "@/lib/fees/options";
import { formatMoney } from "@/lib/number-input";
import { createClient } from "@/lib/supabase/server";
import { param, searchWords } from "@/lib/validation";

import { FeeStatusBadge } from "./status-badge";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("feeOffers") };
}

const isStatus = (value: string | undefined): value is FeeOfferStatus => feeOfferStatuses.includes(value as FeeOfferStatus);

export default async function FeeOffersPage({ searchParams }: PageProps<"/honorarofferten">) {
  const profile = await requireProfile();
  const t = await getTranslations();
  const search = await searchParams;
  const q = param(search.q)?.trim() ?? "";
  const statusParam = param(search.status);
  const status = isStatus(statusParam) ? statusParam : null;

  const supabase = await createClient();
  let query = supabase
    .from("fee_offers")
    .select("id, number, title, city, offer_date, status, data, company:companies(name)")
    .order("number", { ascending: false })
    .limit(300);
  for (const word of searchWords(q)) query = query.or(`number.ilike.%${word}%,title.ilike.%${word}%,city.ilike.%${word}%`);
  if (status) query = query.eq("status", status);
  const [{ data: offers }, { data: firm }] = await Promise.all([query, supabase.from("firm_settings").select("vat_rate").eq("id", true).single()]);

  const filtered = Boolean(q || status);
  const isEmpty = !offers?.length;

  return (
    <>
      <PageHeader
        title={t("feeOffers.title")}
        description={t("feeOffers.description")}
        actions={
          profile.role !== "viewer" && (
            <Link href="/honorarofferten/neu" className={buttonVariants()}>
              <Plus />
              {t("feeOffers.new")}
            </Link>
          )
        }
      />

      {isEmpty && !filtered ? (
        <EmptyState icon={FileSignature} title={t("feeOffers.emptyTitle")} text={t("feeOffers.emptyText")} />
      ) : (
        <>
          <form className="mb-4 flex flex-wrap items-center gap-2">
            <Input name="q" defaultValue={q} placeholder={t("feeOffers.searchPlaceholder")} aria-label={t("common.search")} className="w-72" />
            <NativeSelect name="status" defaultValue={status ?? ""} className="w-48">
              <option value="">{t("feeOffers.allStatuses")}</option>
              {feeOfferStatuses.map((s) => (
                <option key={s} value={s}>
                  {t(`feeOffers.status.${s}`)}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" variant="secondary">
              {t("common.search")}
            </Button>
            {filtered && (
              <Link href="/honorarofferten" className={buttonVariants({ variant: "ghost" })}>
                {t("common.reset")}
              </Link>
            )}
          </form>

          {isEmpty ? (
            <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">{t("feeOffers.noResults")}</p>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">{t("feeOffers.columns.number")}</TableHead>
                    <TableHead>{t("feeOffers.columns.title")}</TableHead>
                    <TableHead>{t("feeOffers.columns.client")}</TableHead>
                    <TableHead>{t("feeOffers.columns.date")}</TableHead>
                    <TableHead className="text-right">{t("feeOffers.columns.net")}</TableHead>
                    <TableHead className="pr-4">{t("feeOffers.columns.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offers.map((o) => (
                    <TableRow key={o.id} className="relative">
                      <TableCell className="pl-4 font-medium tabular-nums">{o.number}</TableCell>
                      <TableCell>
                        <Link href={`/honorarofferten/${o.id}`} className="font-medium after:absolute after:inset-0">
                          {o.title}
                        </Link>
                        {o.city && <span className="ml-2 text-muted-foreground">{o.city}</span>}
                      </TableCell>
                      <TableCell className="max-w-64 truncate">{o.company?.name}</TableCell>
                      <TableCell className="tabular-nums">{new Date(o.offer_date).toLocaleDateString("de-CH")}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(feeTotals(parseFeeOfferData(o.data), firm?.vat_rate ?? 0).net)}</TableCell>
                      <TableCell className="pr-4">{isStatus(o.status) && <FeeStatusBadge status={o.status} />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </>
  );
}
