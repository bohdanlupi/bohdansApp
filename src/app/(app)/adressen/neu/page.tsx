import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { requireProfile } from "@/lib/auth";

import { CompanyForm } from "../company-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("addresses.company");
  return { title: t("newTitle") };
}

export default async function NewCompanyPage() {
  const profile = await requireProfile();
  if (profile.role === "viewer") redirect("/adressen");
  const t = await getTranslations("addresses.company");

  return (
    <div className="max-w-3xl">
      <PageHeader title={t("newTitle")} />
      <CompanyForm editable />
    </div>
  );
}
