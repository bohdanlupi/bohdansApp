import { Wind } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/page-header";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireProfile } from "@/lib/auth";
import { spiLimit } from "@/lib/kwl/calc";
import { formatNumber } from "@/lib/number-input";
import { cn } from "@/lib/utils";

import { loadProject } from "../../load-project";
import { loadCalcs } from "../load-plan";
import { NewKwlDialog } from "./kwl-form";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/lueftung/wohnungen">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("kwl");
  return { title: project ? `${t("title")} · ${project.number}` : t("title") };
}

export default async function KwlListPage({ params }: PageProps<"/projekte/[id]/lueftung/wohnungen">) {
  const { id } = await params;
  const profile = await requireProfile();
  const t = await getTranslations("kwl");

  const calcs = (await loadCalcs(id)).map((c) => ({ calc: c, result: c.result }));
  const total = (pick: (r: (typeof calcs)[number]["result"]) => number) => calcs.reduce((s, c) => s + pick(c.result), 0);
  const num = (value: number | null | undefined, decimals = 0) => (value ? formatNumber(value, decimals) : "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        {profile.role !== "viewer" && <NewKwlDialog projectId={id} defaultName={t("defaultName", { n: calcs.length + 1 })} />}
      </div>

      {calcs.length === 0 ? (
        <EmptyState icon={Wind} title={t("emptyTitle")} text={t("emptyText")} />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{t("fields.name")}</TableHead>
                <TableHead className="text-right">{t("list.rooms")}</TableHead>
                <TableHead className="text-right">{t("list.area")}</TableHead>
                <TableHead className="text-right">{t("list.supply")}</TableHead>
                <TableHead className="text-right">{t("list.extract")}</TableHead>
                <TableHead>{t("list.device")}</TableHead>
                <TableHead className="pr-4 text-right">{t("device.spi")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calcs.map(({ calc, result }) => (
                <TableRow key={calc.id} className="relative">
                  <TableCell className="pl-4">
                    <Link href={`/projekte/${id}/lueftung/wohnungen/${calc.id}`} className="font-medium after:absolute after:inset-0">
                      {calc.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{result.rows.length || ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(result.summary.area, 1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(result.summary.supply)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(result.summary.extract)}</TableCell>
                  <TableCell>{result.device?.name}</TableCell>
                  <TableCell
                    className={cn(
                      "pr-4 text-right tabular-nums",
                      result.deviceResult.spi !== null && (result.deviceResult.spi < spiLimit ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"),
                    )}
                  >
                    {num(result.deviceResult.spi, 2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="pl-4">{t("list.total")}</TableCell>
                <TableCell className="text-right tabular-nums">{total((r) => r.rows.length)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(total((r) => r.summary.area), 1)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(total((r) => r.summary.supply))}</TableCell>
                <TableCell className="text-right tabular-nums">{num(total((r) => r.summary.extract))}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}
