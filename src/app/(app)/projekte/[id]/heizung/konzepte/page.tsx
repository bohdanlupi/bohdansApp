import { Flame } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/page-header";
import { NewNamedDialog } from "@/components/planning/new-named-dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireProfile } from "@/lib/auth";
import { evaluateHeatLoad } from "@/lib/heating/heat-load";
import { formatNumber } from "@/lib/number-input";

import { loadProject } from "../../load-project";
import { createHeatCalc } from "../actions";
import { loadHeatCalcs, loadHeatingPlan } from "../load-plan";
import { HeatBasics } from "./heat-basics";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/heizung/konzepte">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("heatLoad");
  return { title: project ? `${t("title")} · ${project.number}` : t("title") };
}

export default async function HeatConceptsPage({ params }: PageProps<"/projekte/[id]/heizung/konzepte">) {
  const { id } = await params;
  const profile = await requireProfile();
  const t = await getTranslations("heatLoad");
  const [plan, calcs] = await Promise.all([loadHeatingPlan(id), loadHeatCalcs(id)]);
  const rows = calcs.map((c) => ({ calc: c, result: evaluateHeatLoad(c.data, plan.site, plan.catalog) }));
  const num = (v: number | null | undefined, d = 0) => (v ? formatNumber(v, d) : "");
  const editable = profile.role !== "viewer";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <HeatBasics projectId={id} initial={plan} editable={editable} />

      <div className="flex items-center justify-between gap-4 pt-2">
        <h3 className="font-semibold">{t("calcs")}</h3>
        {editable && (
          <NewNamedDialog
            projectId={id}
            defaultName={t("defaultName", { n: calcs.length + 1 })}
            action={createHeatCalc}
            labels={{ button: t("new"), name: t("name"), hint: t("nameHint"), create: t("create") }}
          />
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Flame} title={t("emptyTitle")} text={t("emptyText")} />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{t("name")}</TableHead>
                <TableHead className="text-right">{t("list.rooms")}</TableHead>
                <TableHead className="text-right">{t("list.area")}</TableHead>
                <TableHead className="text-right">{t("list.roomSum")}</TableHead>
                <TableHead className="text-right">{t("list.building")}</TableHead>
                <TableHead className="pr-4 text-right">{t("list.specific")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ calc, result }) => (
                <TableRow key={calc.id} className="relative">
                  <TableCell className="pl-4">
                    <Link href={`/projekte/${id}/heizung/konzepte/${calc.id}`} className="font-medium after:absolute after:inset-0">
                      {calc.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{calc.data.rooms.length || ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(result.area, 1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(result.roomSum)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{num(result.building)}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{num(result.specific, 1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="pl-4">{t("list.total")}</TableCell>
                <TableCell className="text-right tabular-nums">{rows.reduce((s, r) => s + r.calc.data.rooms.length, 0)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(rows.reduce((s, r) => s + r.result.area, 0), 1)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(rows.reduce((s, r) => s + r.result.roomSum, 0))}</TableCell>
                <TableCell className="text-right tabular-nums">{num(rows.reduce((s, r) => s + r.result.building, 0))}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}
