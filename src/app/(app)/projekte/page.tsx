import { FolderKanban } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EmptyState, PageHeader } from "@/components/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("projects") };
}

export default async function ProjectsPage() {
  const t = await getTranslations("projects");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <EmptyState icon={FolderKanban} title={t("emptyTitle")} text={t("comingSoon")} />
    </>
  );
}
