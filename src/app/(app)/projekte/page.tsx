import { FolderKanban, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { NativeSelect } from "@/components/form";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { onlyKnown, projectStatuses } from "@/lib/address-options";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { param, searchWords } from "@/lib/validation";

import { isFeeOfferStatus } from "../honorarofferten/offer-table";
import { FeeStatusBadge } from "../honorarofferten/status-badge";
import { StatusBadge } from "./status-badge";

const PAGE_SIZE = 50;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("projects") };
}

export default async function ProjectsPage({ searchParams }: PageProps<"/projekte">) {
  const profile = await requireProfile();
  const t = await getTranslations();
  const canWrite = profile.role !== "viewer";

  const search = await searchParams;
  const q = param(search.q)?.trim() ?? "";
  const status = onlyKnown([param(search.status) ?? ""], projectStatuses)[0];
  const page = Math.max(1, Number(param(search.seite)) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("project_list")
    .select("id, number, name, street, zip, city, status", { count: "exact" })
    .order("number", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  for (const word of searchWords(q)) query = query.ilike("search_text", `%${word}%`);
  // Without a status filter, archived projects are hidden.
  query = status ? query.eq("status", status) : query.neq("status", "archived");
  const { data: projects, count } = await query;

  // Status of the latest fee offer per project (newest offer date first).
  const ids = (projects ?? []).flatMap((p) => (p.id ? [p.id] : []));
  const { data: offers } = ids.length
    ? await supabase.from("fee_offers").select("project_id, status").in("project_id", ids).order("offer_date", { ascending: false }).order("created_at", { ascending: false })
    : { data: [] };
  const offerStatus = new Map<string, string>();
  for (const o of offers ?? []) if (o.project_id && !offerStatus.has(o.project_id)) offerStatus.set(o.project_id, o.status);

  const filtered = Boolean(q || status);
  const isEmpty = !projects?.length;

  return (
    <>
      <PageHeader
        title={t("projects.title")}
        description={t("projects.description")}
        actions={
          canWrite && (
            <Link href="/projekte/neu" className={buttonVariants()}>
              <Plus />
              {t("projects.newProject")}
            </Link>
          )
        }
      />

      {isEmpty && !filtered ? (
        <EmptyState icon={FolderKanban} title={t("projects.emptyTitle")} text={t("projects.emptyText")} />
      ) : (
        <>
          <form className="mb-4 flex flex-wrap items-center gap-2">
            <Input
              name="q"
              defaultValue={q}
              placeholder={t("projects.searchPlaceholder")}
              aria-label={t("common.search")}
              className="w-72"
            />
            <NativeSelect name="status" defaultValue={status ?? ""} className="w-48">
              <option value="">{t("projects.allStatuses")}</option>
              {projectStatuses.map((s) => (
                <option key={s} value={s}>
                  {t(`options.projectStatus.${s}`)}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" variant="secondary">
              {t("common.search")}
            </Button>
            {filtered && (
              <Link href="/projekte" className={buttonVariants({ variant: "ghost" })}>
                {t("common.reset")}
              </Link>
            )}
          </form>

          {isEmpty ? (
            <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
              {t("projects.noResults")}
            </p>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">{t("projects.columns.number")}</TableHead>
                    <TableHead>{t("projects.columns.name")}</TableHead>
                    <TableHead>{t("projects.columns.street")}</TableHead>
                    <TableHead>{t("projects.columns.city")}</TableHead>
                    <TableHead>{t("projects.columns.feeOffer")}</TableHead>
                    <TableHead className="pr-4">{t("projects.columns.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((p) => (
                    <TableRow key={p.id} className="relative">
                      <TableCell className="pl-4 font-medium tabular-nums">{p.number}</TableCell>
                      <TableCell>
                        <Link href={`/projekte/${p.id}`} className="font-medium after:absolute after:inset-0">
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-64 truncate">{p.street}</TableCell>
                      <TableCell>{[p.zip, p.city].filter(Boolean).join(" ")}</TableCell>
                      <TableCell>
                        {(() => {
                          const status = p.id ? offerStatus.get(p.id) : undefined;
                          return isFeeOfferStatus(status) && <FeeStatusBadge status={status} />;
                        })()}
                      </TableCell>
                      <TableCell className="pr-4">{p.status && <StatusBadge status={p.status} />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} params={{ q, status }} />
        </>
      )}
    </>
  );
}
