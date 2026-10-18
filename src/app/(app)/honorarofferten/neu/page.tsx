import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { param } from "@/lib/validation";

import { loadProject } from "../../projekte/[id]/load-project";
import { NewFeeOfferForm } from "./new-offer-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("feeOffers");
  return { title: t("new") };
}

/** New offer of a project (/honorarofferten/neu?projekt=<id>): prefilled with name, language and Bauherr with its address. */
export default async function NewFeeOfferPage({ searchParams }: PageProps<"/honorarofferten/neu">) {
  const profile = await requireProfile();
  const project = await loadProject(param((await searchParams).projekt) ?? "");
  if (!project) redirect("/projekte");
  if (profile.role === "viewer") redirect(`/projekte/${project.id}/honorar`);
  const t = await getTranslations("feeOffers");

  const supabase = await createClient();
  const [{ data: companies }, { data: offers }, { data: client }] = await Promise.all([
    supabase.from("companies").select("id, name, street, zip, city").eq("archived", false).order("name"),
    supabase.from("fee_offers").select("number").eq("project_id", project.id),
    supabase.from("project_participants").select("company_id, contact_id").eq("project_id", project.id).eq("role", "client").limit(1).maybeSingle(),
  ]);
  const { data: contacts } = client?.company_id
    ? await supabase.from("contacts").select("id, first_name, last_name, function").eq("company_id", client.company_id).order("last_name")
    : { data: [] };

  const clientCompany = (companies ?? []).find((c) => c.id === client?.company_id);

  // Offer numbers follow the project: 2026-010-HO1, -HO2 … (offers without suffix count as well).
  const used = (offers ?? []).map((o) => Number(o.number.match(/-HO(\d+)$/)?.[1] ?? 0));
  const suggestedNumber = `${project.number}-HO${Math.max(used.length, ...used) + 1}`;

  return (
    <div className="max-w-3xl">
      <PageHeader title={t("new")} description={`${project.number} · ${project.name}`} />
      <NewFeeOfferForm
        suggestedNumber={suggestedNumber}
        companies={companies ?? []}
        initialContacts={contacts ?? []}
        defaults={{
          project_id: project.id,
          title: project.name,
          // Address of the Auftraggeber (follows the chosen company in the form)
          street: clientCompany?.street ?? null,
          zip: clientCompany?.zip ?? null,
          city: clientCompany?.city ?? null,
          language: project.language,
          company_id: client?.company_id ?? null,
          contact_id: client?.contact_id ?? null,
        }}
      />
    </div>
  );
}
