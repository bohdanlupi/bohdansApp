import { Construction, Factory } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/page-header";

import type { LoadedPlant } from "./load-plan";
import { PlantBar } from "./plant-bar";

/**
 * Frame of a Heizung chapter page: chapter number and title, for per-Anlage chapters the Anlage bar, and an empty
 * state while the project has no Anlage yet (then the chapter content is not rendered).
 */
export async function ChapterFrame({
  chapter,
  title,
  description,
  projectId,
  plants,
  plant,
  editable,
  actions,
  children,
}: {
  chapter: "242" | "243";
  title: string;
  description?: string;
  projectId: string;
  /** Per-Anlage chapter: all Anlagen and the chosen one (undefined = project-wide chapter). */
  plants?: LoadedPlant[];
  plant?: LoadedPlant | null;
  editable: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = await getTranslations("heatingPlan.plant");
  const perPlant = plants !== undefined;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{chapter}</p>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {perPlant && <PlantBar key={plant?.id ?? "none"} projectId={projectId} plants={plants} current={plant ?? null} editable={editable} />}
      {perPlant && !plant ? <EmptyState icon={Factory} title={t("noneTitle")} text={t("noneText")} /> : children}
    </div>
  );
}

/** Placeholder of a chapter that is worked out next: what it will contain. */
export async function ChapterPlaceholder({ text }: { text: string }) {
  const t = await getTranslations("heatingPlan.placeholder");
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center">
      <Construction className="mb-3 size-8 text-muted-foreground" />
      <p className="font-medium">{t("title")}</p>
      <p className="mt-1 max-w-lg text-sm text-muted-foreground">{text}</p>
      <p className="mt-2 text-xs text-muted-foreground">{t("text")}</p>
    </div>
  );
}
