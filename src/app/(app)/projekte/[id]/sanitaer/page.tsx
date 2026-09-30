import { Droplets } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireProfile } from "@/lib/auth";
import { formatNumber } from "@/lib/number-input";
import { evaluateSystem } from "@/lib/sanitary/network";

import { loadProject } from "../load-project";
import { loadSanitarySystems } from "./load-systems";
import { NewSanitarySystemDialog } from "./system-form";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/sanitaer">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("sanitary");
  return { title: project ? `${t("title")} · ${project.number}` : t("title") };
}

export default async function SanitaryPage({ params }: PageProps<"/projekte/[id]/sanitaer">) {
  const { id } = await params;
  const profile = await requireProfile();
  const t = await getTranslations("sanitary");
  const systems = await loadSanitarySystems(id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {profile.role !== "viewer" && <NewSanitarySystemDialog projectId={id} defaultName={t("defaultName", { n: systems.length + 1 })} />}
      </div>
      {systems.length === 0 ? (
        <EmptyState icon={Droplets} title={t("emptyTitle")} text={t("emptyText")} />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{t("name")}</TableHead>
                <TableHead className="text-right">{t("results.lu")}</TableHead>
                <TableHead className="text-right">{t("results.heatLoss")}</TableHead>
                <TableHead className="pr-4">{t("results.pump")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {systems.map((s) => {
                const r = evaluateSystem(s.data);
                return (
                  <TableRow key={s.id} className="relative">
                    <TableCell className="pl-4">
                      <Link href={`/projekte/${id}/sanitaer/${s.id}`} className="font-medium after:absolute after:inset-0">
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.lu.cold} / {r.lu.warm}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.pump ? `${formatNumber(r.pump.heatLoss, 2)} kWh/d` : "–"}</TableCell>
                    <TableCell className="pr-4">{r.pump ? `${r.pump.chosen?.name ?? "–"} · ${formatNumber(r.pump.flow, 0)} l/h · ${formatNumber(r.pump.head, 0)} mbar` : "–"}</TableCell>
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
