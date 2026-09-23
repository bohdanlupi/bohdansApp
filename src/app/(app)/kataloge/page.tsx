import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { onlyKnown, trades } from "@/lib/address-options";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { CatalogFormDialog } from "./catalog-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("catalogs") };
}

export default async function CatalogsPage() {
  const profile = await requireProfile();
  const t = await getTranslations();
  const canWrite = profile.role !== "viewer";

  const supabase = await createClient();
  const { data: catalogs } = await supabase.from("catalogs").select("*")
    // Own catalogues first, then the supplier catalogues.
    .order("source", { ascending: false })
    .order("name");

  return (
    <>
      <PageHeader
        title={t("catalogs.title")}
        description={t("catalogs.description")}
        actions={canWrite && <CatalogFormDialog />}
      />

      {!catalogs?.length ? (
        <EmptyState icon={BookOpen} title={t("catalogs.emptyTitle")} text={t("catalogs.emptyText")} />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{t("catalogs.fields.name")}</TableHead>
                <TableHead>{t("catalogs.fields.trade")}</TableHead>
                <TableHead className="text-right">{t("catalogs.entries")}</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {catalogs.map((c) => (
                <TableRow key={c.id} className="relative">
                  <TableCell className="pl-4">
                    <Link href={`/kataloge/${c.id}`} className="font-medium after:absolute after:inset-0">
                      {c.name}
                    </Link>
                    {c.source === "igh" && (
                      <Badge variant="secondary" className="ml-2" title={t("catalogs.supplierInfo", { version: c.version ?? "–" })}>
                        IGH
                      </Badge>
                    )}
                    {c.description && <div className="max-w-xl truncate text-xs text-muted-foreground">{c.description}</div>}
                  </TableCell>
                  <TableCell>{onlyKnown([c.trade ?? ""], trades).map((tr) => t(`options.trades.${tr}`))}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.entry_count}</TableCell>
                  <TableCell className="pr-4 text-right">
                    {!c.active && <Badge variant="outline">{t("catalogs.inactive")}</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
