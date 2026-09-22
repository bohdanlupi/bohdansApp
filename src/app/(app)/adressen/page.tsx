import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EmptyState, PageHeader } from "@/components/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("addresses") };
}

export default async function AddressesPage() {
  const t = await getTranslations("addresses");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <EmptyState icon={Building2} title={t("emptyTitle")} text={t("comingSoon")} />
    </>
  );
}
