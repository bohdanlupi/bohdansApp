import { FileSignature, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { OfferTable } from "../../../honorarofferten/offer-table";
import { loadProject } from "../load-project";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/honorar">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("projects.tabs");
  return { title: project ? `${t("fee")} · ${project.number}` : t("fee") };
}

/** Honorar tab: the fee offers of the project (offer, Nachtrag, variants). */
export default async function ProjectFeePage({ params }: PageProps<"/projekte/[id]/honorar">) {
  const { id } = await params;
  const profile = await requireProfile();
  const project = await loadProject(id);
  if (!project) notFound();
  const t = await getTranslations("feeOffers");

  const supabase = await createClient();
  const [{ data: offers }, { data: firm }] = await Promise.all([
    supabase
      .from("fee_offers")
      .select("id, number, title, city, offer_date, status, data, company:companies(name)")
      .eq("project_id", id)
      .order("offer_date", { ascending: false })
      .order("number", { ascending: false }),
    supabase.from("firm_settings").select("vat_rate").eq("id", true).single(),
  ]);

  return (
    <div className="space-y-4">
      {profile.role !== "viewer" && (
        <div className="flex justify-end">
          <Link href={`/honorarofferten/neu?projekt=${id}`} className={buttonVariants()}>
            <Plus />
            {t("new")}
          </Link>
        </div>
      )}
      {offers?.length ? (
        <OfferTable offers={offers} vatRate={firm?.vat_rate ?? 0} />
      ) : (
        <EmptyState icon={FileSignature} title={t("emptyTitle")} text={t("emptyProjectText")} />
      )}
    </div>
  );
}
