import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";

import { loadSanitarySystems } from "../load-systems";
import { SanitaryEditor } from "./system-editor";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/sanitaer/[systemId]">): Promise<Metadata> {
  const { id, systemId } = await params;
  const system = (await loadSanitarySystems(id)).find((s) => s.id === systemId);
  const t = await getTranslations("sanitary");
  return { title: system ? `${system.name} · ${t("title")}` : t("title") };
}

export default async function SanitarySystemPage({ params }: PageProps<"/projekte/[id]/sanitaer/[systemId]">) {
  const { id, systemId } = await params;
  const profile = await requireProfile();
  const system = (await loadSanitarySystems(id)).find((s) => s.id === systemId);
  if (!system) notFound();
  const t = await getTranslations("sanitary");

  return (
    <div className="space-y-4">
      <Link href={`/projekte/${id}/sanitaer`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>
      <SanitaryEditor
        key={system.id}
        id={system.id}
        projectId={id}
        initialName={system.name}
        initialData={system.data}
        schemaPlan={system.schemaPlan}
        editable={profile.role !== "viewer"}
      />
    </div>
  );
}
