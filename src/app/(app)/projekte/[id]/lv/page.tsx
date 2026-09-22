import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/page-header";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { onlyKnown, trades } from "@/lib/address-options";
import { requireProfile } from "@/lib/auth";
import { formatMoney } from "@/lib/number-input";
import { createClient } from "@/lib/supabase/server";

import { loadCostOptions } from "../cost-options";
import { loadProject } from "../load-project";
import { LvFormDialog } from "./lv-form";
import { LvStatusBadge } from "./lv-status-badge";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/lv">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("lvs");
  return { title: project ? `${t("title")} · ${project.number}` : t("title") };
}

export default async function LvListPage({ params }: PageProps<"/projekte/[id]/lv">) {
  const { id } = await params;
  const profile = await requireProfile();
  const project = (await loadProject(id))!;
  const t = await getTranslations();
  const canWrite = profile.role !== "viewer";

  const supabase = await createClient();
  const { data: lvs } = await supabase.from("lv_list").select("*").eq("project_id", id).order("number");
  const list = lvs ?? [];
  const total = list.reduce((sum, lv) => sum + (lv.estimate_total ?? 0), 0);
  const nextNumber = String(list.length + 1).padStart(2, "0");
  const costOptions = canWrite ? await loadCostOptions(project.cost_plan_template_id, project.language) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{t("lvs.description")}</p>
        {canWrite && <LvFormDialog projectId={id} defaults={{ number: nextNumber, language: project.language }} costOptions={costOptions} />}
      </div>

      {list.length === 0 ? (
        <EmptyState icon={ListChecks} title={t("lvs.emptyTitle")} text={t("lvs.emptyText")} />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{t("lvs.fields.number")}</TableHead>
                <TableHead>{t("lvs.fields.title")}</TableHead>
                <TableHead>{t("lvs.fields.trade")}</TableHead>
                <TableHead>{t("lvs.fields.status")}</TableHead>
                <TableHead className="text-right">{t("lvs.positions")}</TableHead>
                <TableHead className="pr-4 text-right">{t("lvs.estimate")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((lv) => (
                <TableRow key={lv.id} className="relative">
                  <TableCell className="pl-4 font-medium tabular-nums">{lv.number}</TableCell>
                  <TableCell>
                    <Link href={`/projekte/${id}/lv/${lv.id}`} className="font-medium after:absolute after:inset-0">
                      {lv.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {onlyKnown([lv.trade ?? ""], trades).map((tr) => t(`options.trades.${tr}`))}
                  </TableCell>
                  <TableCell>{lv.status && <LvStatusBadge status={lv.status} />}</TableCell>
                  <TableCell className="text-right tabular-nums">{lv.position_count}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{formatMoney(lv.estimate_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5} className="pl-4">
                  {t("lvs.totalEstimate")}
                </TableCell>
                <TableCell className="pr-4 text-right tabular-nums">CHF {formatMoney(total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}
