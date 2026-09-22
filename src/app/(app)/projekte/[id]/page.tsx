import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { participantRoles } from "@/lib/address-options";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { deleteProject } from "../actions";
import { ProjectForm } from "../project-form";
import { StatusBadge } from "../status-badge";
import { Participants, type ParticipantView } from "./participants";

async function loadProject(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  return data;
}

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
  const [{ data: rows }, { data: companies }] = await Promise.all([
    supabase
      .from("project_participants")
      .select(
        "id, role, note, company:companies(id, name, city, phone, email), contact:contacts(id, first_name, last_name, phone, mobile, email)",
      )
      .eq("project_id", id),
    canWrite
      ? supabase.from("companies").select("id, name, city").eq("archived", false).order("name")
      : Promise.resolve({ data: [] }),
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
    <>
      <Link href="/projekte" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("projects.title")}
      </Link>
      <PageHeader
        title={`${project.number} · ${project.name}`}
        description={[project.street, [project.zip, project.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={project.status} />
            {canWrite && (
              <ConfirmButton
                label={t("projects.form.delete")}
                title={t("projects.form.delete")}
                text={t("projects.form.deleteConfirm", { name: `${project.number} ${project.name}` })}
                confirmLabel={t("common.delete")}
                onConfirm={deleteProject.bind(null, project.id)}
                variant="outline"
              />
            )}
          </div>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,48rem)_minmax(0,1fr)]">
        <ProjectForm key={project.updated_at} project={project} editable={canWrite} />
        <Participants
          projectId={project.id}
          participants={participants}
          companies={companies ?? []}
          editable={canWrite}
        />
      </div>
    </>
  );
}
