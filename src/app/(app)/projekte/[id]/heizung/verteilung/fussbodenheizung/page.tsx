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

import { loadProject } from "../../../load-project";
import { createHeatingSystem } from "../../actions";
import { ChapterFrame } from "../../chapter-frame";
import { loadHeatingPlants, loadHeatingSystems, selectPlant } from "../../load-plan";
import { loadCalcRooms } from "./load-rooms";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/heizung/verteilung/fussbodenheizung">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("floorHeating");
  return { title: project ? `${t("title")} · ${project.number}` : t("title") };
}

/** 243 Fussbodenheizung: the floor heating systems of the chosen Anlage (unassigned ones count to the first). */
export default async function FloorSystemsPage({ params, searchParams }: PageProps<"/projekte/[id]/heizung/verteilung/fussbodenheizung">) {
  const { id } = await params;
  const { anlage } = await searchParams;
  const profile = await requireProfile();
  const t = await getTranslations("floorHeating");
  const tPlan = await getTranslations("heatingPlan");
  const [all, plants, { lookup }] = await Promise.all([loadHeatingSystems(id), loadHeatingPlants(id), loadCalcRooms(id)]);
  const plant = selectPlant(plants, anlage);
  const plantOf = (plantId: string | null) => (plants.some((p) => p.id === plantId) ? plantId : (plants[0]?.id ?? null));
  const systems = all.filter((s) => plant && plantOf(s.data.plantId) === plant.id);
  const rows = systems.map((s) => ({ system: s, result: evaluateFloor(s.data, lookup) }));
  const editable = profile.role !== "viewer";
  const num = (v: number | null | undefined, d = 0) => (v ? formatNumber(v, d) : "");

  return (
    <ChapterFrame
      chapter="243"
      title={tPlan("chapters.floorHeating")}
      description={t("description")}
      projectId={id}
      plants={plants}
      plant={plant}
      editable={editable}
      actions={
        editable &&
        plant && (
          <NewNamedDialog
            projectId={id}
            defaultName={t("defaultName", { n: all.length + 1 })}
            action={createHeatingSystem}
            labels={{ button: t("new"), name: t("name"), hint: t("nameHint"), create: t("create") }}
            hidden={{ plant_id: plant.id }}
          />
        )
      }
    >
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
                    <Link href={`/projekte/${id}/heizung/verteilung/fussbodenheizung/${system.id}`} className="font-medium after:absolute after:inset-0">
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
    </ChapterFrame>
  );
}
