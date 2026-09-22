import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { TreeEditor, type EditorNode } from "@/components/tree-editor/tree-editor";
import { localeToLanguage, type Locale } from "@/i18n/config";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { deleteCatalog } from "../actions";
import { CatalogFormDialog } from "../catalog-form";

async function loadCatalog(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("catalogs").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/kataloge/[id]">): Promise<Metadata> {
  const catalog = await loadCatalog((await params).id);
  return { title: catalog?.name };
}

export default async function CatalogPage({ params }: PageProps<"/kataloge/[id]">) {
  const { id } = await params;
  const profile = await requireProfile();
  const catalog = await loadCatalog(id);
  if (!catalog) notFound();

  const t = await getTranslations();
  const canWrite = profile.role !== "viewer";
  const supabase = await createClient();
  const { data: nodes } = await supabase.from("catalog_nodes").select("*").eq("catalog_id", id);

  return (
    <>
      <Link href="/kataloge" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("catalogs.title")}
      </Link>
      <PageHeader
        title={catalog.name}
        description={catalog.description ?? undefined}
        actions={
          canWrite && (
            <>
              <CatalogFormDialog catalog={catalog} />
              <ConfirmButton
                label={t("catalogs.delete")}
                title={t("catalogs.delete")}
                text={t("catalogs.deleteConfirm", { name: catalog.name })}
                confirmLabel={t("common.delete")}
                onConfirm={deleteCatalog.bind(null, catalog.id)}
                variant="outline"
              />
            </>
          )
        }
      />
      <TreeEditor
        key={catalog.id}
        scope={{ type: "catalog", id: catalog.id }}
        nodes={(nodes ?? []) as EditorNode[]}
        language={localeToLanguage((await getLocale()) as Locale)}
        editable={canWrite}
      />
    </>
  );
}
