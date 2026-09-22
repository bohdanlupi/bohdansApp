import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EmptyState, PageHeader } from "@/components/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("catalogs") };
}

export default async function CatalogsPage() {
  const t = await getTranslations("catalogs");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <EmptyState icon={BookOpen} title={t("emptyTitle")} text={t("comingSoon")} />
    </>
  );
}
