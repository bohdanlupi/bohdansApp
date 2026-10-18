import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { CreditorForm } from "../creditor-form";
import { loadCreditorOptions } from "../load-options";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creditors");
  return { title: t("new") };
}

const addDays = (days: number) => new Date(Date.now() + days * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });

export default async function NewCreditorInvoicePage() {
  const profile = await requireProfile();
  if (profile.role === "viewer") redirect("/kreditoren");
  const t = await getTranslations("creditors");
  const { companies, projects } = await loadCreditorOptions(await createClient());

  return (
    <div className="max-w-4xl">
      <PageHeader title={t("new")} description={t("newDescription")} />
      <CreditorForm
        isNew
        editable
        companies={companies}
        projects={projects}
        initial={{
          id: crypto.randomUUID(),
          company_id: null,
          project_id: null,
          number: "",
          invoice_date: addDays(0),
          due_date: addDays(30),
          status: "open",
          paid_date: null,
          category: "material",
          vat_lines: [],
          description: "",
          file_path: null,
          file_name: null,
        }}
      />
    </div>
  );
}
