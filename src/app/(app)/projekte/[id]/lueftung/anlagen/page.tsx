import { Network } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireProfile } from "@/lib/auth";
import { evaluateSystem, roomFlows } from "@/lib/kwl/network";
import { findProduct } from "@/lib/kwl/products";
import { formatNumber } from "@/lib/number-input";

import { loadProject } from "../../load-project";
import { loadCalcs, loadSystems } from "../load-plan";
import { NewSystemDialog } from "./system-form";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/lueftung/anlagen">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("kwlSystem");
  return { title: project ? `${t("title")} · ${project.number}` : t("title") };
}

export default async function SystemsPage({ params }: PageProps<"/projekte/[id]/lueftung/anlagen">) {
  const { id } = await params;
  const profile = await requireProfile();
  const t = await getTranslations("kwlSystem");
  const [systems, calcs] = await Promise.all([loadSystems(id), loadCalcs(id)]);
  const num = (v: number | null) => (v === null ? "–" : formatNumber(v, 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {profile.role !== "viewer" && <NewSystemDialog projectId={id} defaultName={t("defaultName", { n: systems.length + 1 })} />}
      </div>
      {systems.length === 0 ? (
        <EmptyState icon={Network} title={t("emptyTitle")} text={t("emptyText")} />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{t("name")}</TableHead>
                <TableHead>{t("device")}</TableHead>
                <TableHead className="text-right">{t("supply")}</TableHead>
                <TableHead className="text-right">{t("extract")}</TableHead>
                <TableHead className="pr-4 text-right">{t("external")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {systems.map((s) => {
                const result = evaluateSystem(s.data, roomFlows(calcs, s.data.calcIds));
                const device = findProduct(s.data.device)?.name ?? "–";
                return (
                  <TableRow key={s.id} className="relative">
                    <TableCell className="pl-4">
                      <Link href={`/projekte/${id}/lueftung/anlagen/${s.id}`} className="font-medium after:absolute after:inset-0">
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell>{device}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(result.supply.flow)} m³/h</TableCell>
                    <TableCell className="text-right tabular-nums">{num(result.extract.flow)} m³/h</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">
                      {num(result.external.supply)} / {num(result.external.extract)} Pa
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
