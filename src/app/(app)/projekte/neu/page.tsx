import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { requireProfile } from "@/lib/auth";
import { nextYearNumber } from "@/lib/next-number";
import { createClient } from "@/lib/supabase/server";

import { ProjectForm } from "../project-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projects.form");
  return { title: t("newTitle") };
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
      <ProjectForm editable suggestedNumber={await nextYearNumber("projects")} templates={templates ?? []} />
    </div>
  );
}
