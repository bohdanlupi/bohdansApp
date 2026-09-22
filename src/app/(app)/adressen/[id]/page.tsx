import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { onlyKnown, participantRoles } from "@/lib/address-options";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { deleteCompany } from "../actions";
import { CompanyForm } from "../company-form";
import { ContactList } from "./contacts";

async function loadCompany(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/adressen/[id]">): Promise<Metadata> {
  const company = await loadCompany((await params).id);
  return { title: company?.name };
}

export default async function CompanyPage({ params }: PageProps<"/adressen/[id]">) {
  const { id } = await params;
  const profile = await requireProfile();
  const company = await loadCompany(id);
  if (!company) notFound();

  const t = await getTranslations();
  const canWrite = profile.role !== "viewer";

  const supabase = await createClient();
  const [{ data: contacts }, { data: participations }] = await Promise.all([
    supabase.from("contacts").select("*").eq("company_id", id).order("last_name").order("first_name"),
    supabase
      .from("project_participants")
      .select("id, role, project:projects(id, number, name, status)")
      .eq("company_id", id),
  ]);

  const projects = (participations ?? [])
    .filter((p) => p.project)
    .sort((a, b) => b.project!.number.localeCompare(a.project!.number));

  return (
    <>
      <Link href="/adressen" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("addresses.title")}
      </Link>
      <PageHeader
        title={company.name}
        description={[company.name2, [company.zip, company.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
        actions={
          canWrite && (
            <ConfirmButton
              label={t("addresses.company.delete")}
              title={t("addresses.company.delete")}
              text={t("addresses.company.deleteConfirm", { name: company.name })}
              confirmLabel={t("common.delete")}
              onConfirm={deleteCompany.bind(null, company.id)}
              variant="outline"
            />
          )
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,48rem)_minmax(0,1fr)]">
        <CompanyForm key={company.updated_at} company={company} editable={canWrite} />

        <div className="space-y-6">
          <ContactList companyId={company.id} contacts={contacts ?? []} editable={canWrite} />

          <Card>
            <CardHeader>
              <CardTitle>{t("addresses.projectsTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("addresses.projectsEmpty")}</p>
              ) : (
                <ul className="divide-y text-sm">
                  {projects.map(({ id: participationId, role, project }) => (
                    <li key={participationId} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                      <Link href={`/projekte/${project!.id}`} className="min-w-0 flex-1 truncate hover:underline">
                        <span className="font-medium tabular-nums">{project!.number}</span> {project!.name}
                      </Link>
                      {onlyKnown([role], participantRoles).map((r) => (
                        <Badge key={r} variant="secondary">
                          {t(`options.participantRoles.${r}`)}
                        </Badge>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
