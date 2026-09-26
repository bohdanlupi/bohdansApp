import { Layers } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/page-header";
import { NewNamedDialog } from "@/components/planning/new-named-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireProfile } from "@/lib/auth";
import { evaluateFloor } from "@/lib/heating/floor";
import { formatNumber } from "@/lib/number-input";

import { loadProject } from "../../load-project";
import { createHeatingSystem } from "../actions";
import { loadHeatingSystems } from "../load-plan";
import { loadCalcRooms } from "./load-rooms";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/heizung/dimensionierung">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("floorHeating");
  return { title: project ? `${t("title")} · ${project.number}` : t("title") };
}

export default async function FloorSystemsPage({ params }: PageProps<"/projekte/[id]/heizung/dimensionierung">) {
  const { id } = await params;
  const profile = await requireProfile();
  const t = await getTranslations("floorHeating");
  const [systems, { lookup }] = await Promise.all([loadHeatingSystems(id), loadCalcRooms(id)]);
  const rows = systems.map((s) => ({ system: s, result: evaluateFloor(s.data, lookup) }));
  const num = (v: number | null | undefined, d = 0) => (v ? formatNumber(v, d) : "");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {profile.role !== "viewer" && (
          <NewNamedDialog projectId={id} defaultName={t("defaultName", { n: systems.length + 1 })} action={createHeatingSystem} labels={{ button: t("new"), name: t("name"), hint: t("nameHint"), create: t("create") }} />
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Layers} title={t("emptyTitle")} text={t("emptyText")} />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{t("name")}</TableHead>
                <TableHead className="text-right">{t("list.distributors")}</TableHead>
                <TableHead className="text-right">{t("list.rings")}</TableHead>
                <TableHead className="text-right">{t("list.flowReturn")}</TableHead>
                <TableHead className="text-right">{t("list.total")}</TableHead>
                <TableHead className="pr-4 text-right">{t("list.massFlow")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ system, result }) => (
                <TableRow key={system.id} className="relative">
                  <TableCell className="pl-4">
                    <Link href={`/projekte/${id}/heizung/dimensionierung/${system.id}`} className="font-medium after:absolute after:inset-0">
                      {system.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{system.data.distributors.length}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(result.distributors.reduce((s, d) => s + d.rings, 0))}</TableCell>
                  <TableCell className="text-right tabular-nums">{result.flow === null ? "" : `${num(result.flow)} / ${num(result.ret)} °C`}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{num(result.total)}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{num(result.massFlow)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
