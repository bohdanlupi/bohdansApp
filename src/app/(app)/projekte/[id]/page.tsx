import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ConfirmButton } from "@/components/confirm-button";
import { participantRoles } from "@/lib/address-options";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { deleteProject } from "../actions";
import { ProjectForm } from "../project-form";
import { loadProject } from "./load-project";
import { Participants, type ParticipantView } from "./participants";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  return { title: project ? `${project.number} ${project.name}` : undefined };
}

export default async function ProjectPage({ params }: PageProps<"/projekte/[id]">) {
  const { id } = await params;
  const profile = await requireProfile();
  const project = await loadProject(id);
  if (!project) notFound();

  const t = await getTranslations();
  const canWrite = profile.role !== "viewer";

  const supabase = await createClient();
  const [{ data: rows }, { data: companies }, { data: templates }] = await Promise.all([
    supabase
      .from("project_participants")
      .select(
        "id, role, note, company:companies(id, name, city, phone, email), contact:contacts(id, first_name, last_name, phone, mobile, email)",
      )
      .eq("project_id", id),
    canWrite
      ? supabase.from("companies").select("id, name, city").eq("archived", false).order("name")
      : Promise.resolve({ data: [] }),
    supabase.from("cost_plan_templates").select("*").order("name"),
  ]);

  // Sorted by role order (Bauherr first), then company name.
  const roleOrder = (role: string) => {
    const index = participantRoles.indexOf(role as (typeof participantRoles)[number]);
    return index === -1 ? participantRoles.length : index;
  };
  const participants = ((rows ?? []).filter((p) => p.company) as ParticipantView[]).sort(
    (a, b) => roleOrder(a.role) - roleOrder(b.role) || a.company.name.localeCompare(b.company.name),
  );

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,48rem)_minmax(0,1fr)]">
      <div className="space-y-6">
        <ProjectForm key={project.updated_at} project={project} templates={templates ?? []} editable={canWrite} />
        {canWrite && (
          <div className="flex justify-end border-t pt-4">
            <ConfirmButton
              label={t("projects.form.delete")}
              title={t("projects.form.delete")}
              text={t("projects.form.deleteConfirm", { name: `${project.number} ${project.name}` })}
              confirmLabel={t("common.delete")}
              onConfirm={deleteProject.bind(null, project.id)}
              variant="outline"
            />
          </div>
        )}
      </div>
      <Participants projectId={project.id} participants={participants} companies={companies ?? []} editable={canWrite} />
    </div>
  );
}
