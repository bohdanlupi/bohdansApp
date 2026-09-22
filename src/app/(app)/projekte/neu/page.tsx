import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { ProjectForm } from "../project-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projects.form");
  return { title: t("newTitle") };
}

/** Next free number of the form 2026-001 (only numbers following that pattern count). */
async function suggestNumber() {
  const year = new Date().getFullYear();
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("number").like("number", `${year}-%`);
  const highest = Math.max(
    0,
    ...(data ?? []).map((p) => Number(p.number.match(/^\d{4}-(\d+)$/)?.[1] ?? 0)),
  );
  return `${year}-${String(highest + 1).padStart(3, "0")}`;
}

export default async function NewProjectPage() {
  const profile = await requireProfile();
  if (profile.role === "viewer") redirect("/projekte");
  const t = await getTranslations("projects.form");
  const supabase = await createClient();
  const { data: templates } = await supabase.from("cost_plan_templates").select("*").order("name");

  return (
    <div className="max-w-3xl">
      <PageHeader title={t("newTitle")} />
      <ProjectForm editable suggestedNumber={await suggestNumber()} templates={templates ?? []} />
    </div>
  );
}
