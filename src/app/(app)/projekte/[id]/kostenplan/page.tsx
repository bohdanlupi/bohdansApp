import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { formatMoney } from "@/lib/number-input";
import { createClient } from "@/lib/supabase/server";
import { param } from "@/lib/validation";

import { loadProject } from "../load-project";
import { CostPlanTable } from "./cost-plan-table";
import { loadCostPlan } from "./load-cost-plan";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/kostenplan">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("costPlan");
  return { title: project ? `${t("title")} · ${project.number}` : t("title") };
}

export default async function CostPlanPage({ params, searchParams }: PageProps<"/projekte/[id]/kostenplan">) {
  const { id } = await params;
  const profile = await requireProfile();
  const project = await loadProject(id);
  if (!project) notFound();

  const t = await getTranslations();
  const showAll = param((await searchParams).alle) === "1";
  const { rows, templateName, unassignedLvs } = await loadCostPlan(id, project.cost_plan_template_id, project.language);
  const supabase = await createClient();
  const { data: firm } = await supabase.from("firm_settings").select("vat_rate").eq("id", true).single();

  if (!project.cost_plan_template_id) {
    return <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">{t("costPlan.noTemplate")}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("costPlan.description", { template: templateName ?? "" })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={showAll ? `/projekte/${id}/kostenplan` : `/projekte/${id}/kostenplan?alle=1`}
            className={buttonVariants({ variant: "ghost" })}
          >
            {showAll ? t("costPlan.showUsed") : t("costPlan.showAll")}
          </Link>
          <a href={`/api/pdf/kv/${id}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
            <FileText />
            {t("costPlan.pdf")}
          </a>
        </div>
      </div>

      {unassignedLvs.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="font-medium">{t("costPlan.unassignedTitle")}</p>
          <ul className="mt-1 list-inside list-disc">
            {unassignedLvs.map((lv) => (
              <li key={lv.id}>
                <Link href={`/projekte/${id}/lv/${lv.id}`} className="underline">
                  {lv.number} {lv.title}
                </Link>{" "}
                (CHF {formatMoney(lv.estimate_total)})
              </li>
            ))}
          </ul>
          <p className="mt-1">{t("costPlan.unassignedHint")}</p>
        </div>
      )}

      <CostPlanTable
        projectId={id}
        rows={rows}
        showAll={showAll}
        vatRate={firm?.vat_rate ?? 8.1}
        editable={profile.role !== "viewer"}
      />
    </div>
  );
}
