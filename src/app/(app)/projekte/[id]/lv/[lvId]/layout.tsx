import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ConfirmButton } from "@/components/confirm-button";
import { buttonVariants } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { formatMoney } from "@/lib/number-input";
import type { Lv } from "@/lib/supabase/types";

import { deleteLv } from "../actions";
import { LvFormDialog } from "../lv-form";
import { LvStatusBadge } from "../lv-status-badge";
import { loadLv } from "./load-lv";
import { LvNav } from "./lv-nav";

export default async function LvLayout({ children, params }: LayoutProps<"/projekte/[id]/lv/[lvId]">) {
  const { id, lvId } = await params;
  const profile = await requireProfile();
  const lv = await loadLv(id, lvId);
  if (!lv) notFound();

  const t = await getTranslations();
  const canWrite = profile.role !== "viewer";
  const pdf = `/api/pdf/lv/${lv.id}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/projekte/${id}/lv`} className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            {t("lvs.title")}
          </Link>
          <h2 className="flex items-center gap-3 text-xl font-semibold">
            <span>
              {t("lvs.lv")} {lv.number} · {lv.title}
            </span>
            {lv.status && <LvStatusBadge status={lv.status} />}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("lvs.estimate")}: CHF {formatMoney(lv.estimate_total)} · {t(`languages.${lv.language ?? "de"}`)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={pdf} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
            <FileText />
            {t("lvs.pdfTender")}
          </a>
          <a href={`${pdf}?preise=1`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
            <FileText />
            {t("lvs.pdfEstimate")}
          </a>
          {canWrite && (
            <>
              <LvFormDialog projectId={id} lv={lv as Lv} />
              <ConfirmButton
                label={t("lvs.delete")}
                title={t("lvs.delete")}
                text={t("lvs.deleteConfirm", { name: `${lv.number} ${lv.title}` })}
                confirmLabel={t("common.delete")}
                onConfirm={deleteLv.bind(null, lv.id!, id)}
                variant="outline"
              />
            </>
          )}
        </div>
      </div>
      <LvNav projectId={id} lvId={lv.id!} />
      {children}
    </div>
  );
}
