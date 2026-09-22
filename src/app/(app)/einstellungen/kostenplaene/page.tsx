import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ConfirmButton } from "@/components/confirm-button";
import { requireProfile } from "@/lib/auth";
import { costRows, type CostItem } from "@/lib/cost-plan";
import type { I18nText } from "@/lib/i18n-text";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { param } from "@/lib/validation";

import { deleteTemplate } from "./actions";
import { AddItemForm, CostItemRow, NewTemplateForm } from "./cost-plan-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.tabs");
  return { title: t("costPlans") };
}

export default async function CostPlanTemplatesPage({ searchParams }: PageProps<"/einstellungen/kostenplaene">) {
  const profile = await requireProfile();
  const t = await getTranslations();
  const isAdmin = profile.role === "admin";

  const supabase = await createClient();
  const { data: templates } = await supabase.from("cost_plan_templates").select("*").order("name");
  const list = templates ?? [];
  const selectedId = param((await searchParams).vorlage) ?? list[0]?.id;
  const selected = list.find((tpl) => tpl.id === selectedId);

  const { data: items } = selected
    ? await supabase.from("cost_plan_items").select("id, parent_id, code, name, sort").eq("template_id", selected.id)
    : { data: [] };
  const rows = costRows(
    (items ?? []).map((i) => ({ ...i, name: i.name as I18nText })) as CostItem[],
    new Map(),
    new Map(),
    "de",
  ).filter((r) => r.depth >= 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("settings.costPlans.description")}</p>

      <div className="flex flex-wrap items-center gap-2">
        {list.map((tpl) => (
          <Link
            key={tpl.id}
            href={`/einstellungen/kostenplaene?vorlage=${tpl.id}`}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium",
              tpl.id === selected?.id ? "border-brand bg-brand/10" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {tpl.name}
          </Link>
        ))}
        {isAdmin && <NewTemplateForm templates={list.map((tpl) => ({ id: tpl.id, name: tpl.name }))} />}
      </div>

      {selected && (
        <div className="space-y-4">
          {isAdmin && <AddItemForm templateId={selected.id} />}
          <div className="rounded-xl border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="w-24 py-2 pl-4 text-left font-medium">{t("settings.costPlans.code")}</th>
                  <th className="px-2 text-left font-medium">{t("languages.de")}</th>
                  <th className="px-2 text-left font-medium">{t("languages.fr")}</th>
                  <th className="px-2 text-left font-medium">{t("languages.it")}</th>
                  <th className="w-10 pr-4" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <CostItemRow
                    key={row.item.id}
                    templateId={selected.id}
                    item={{ id: row.item.id, code: row.item.code, name: row.item.name }}
                    depth={row.depth}
                    editable={isAdmin}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {isAdmin && !selected.key && (
            <div className="flex justify-end">
              <ConfirmButton
                label={t("settings.costPlans.deleteTemplate")}
                title={t("settings.costPlans.deleteTemplate")}
                text={t("settings.costPlans.deleteTemplateConfirm", { name: selected.name })}
                confirmLabel={t("common.delete")}
                onConfirm={deleteTemplate.bind(null, selected.id)}
                variant="outline"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
