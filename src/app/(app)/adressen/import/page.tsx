import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { requireProfile } from "@/lib/auth";

import { ImportWizard } from "./import-wizard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("addresses.importPage");
  return { title: t("title") };
}

export default async function ImportPage() {
  const profile = await requireProfile();
  if (profile.role === "viewer") redirect("/adressen");
  const t = await getTranslations("addresses");

  return (
    <div className="max-w-5xl">
      <Link href="/adressen" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>
      <PageHeader title={t("importPage.title")} description={t("importPage.description")} />
      <ImportWizard />
    </div>
  );
}
