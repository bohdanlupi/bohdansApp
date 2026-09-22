import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { requireProfile } from "@/lib/auth";

import { StatusBadge } from "../status-badge";
import { loadProject } from "./load-project";
import { ProjectNav } from "./project-nav";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projekte/[id]">) {
  const { id } = await params;
  await requireProfile();
  const project = await loadProject(id);
  if (!project) notFound();
  const t = await getTranslations("projects");

  return (
    <>
      <Link href="/projekte" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>
      <PageHeader
        title={`${project.number} · ${project.name}`}
        description={[project.street, [project.zip, project.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
        actions={<StatusBadge status={project.status} />}
      />
      <ProjectNav projectId={project.id} />
      <div className="mt-6">{children}</div>
    </>
  );
}
