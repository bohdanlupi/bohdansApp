import { renderToBuffer } from "@react-pdf/renderer";
import { createTranslator } from "next-intl";

import { languageToLocale } from "@/i18n/config";
import { getCurrentProfile } from "@/lib/auth";
import { deriveElements } from "@/lib/building/heat-link";
import { parseBuildingModel, type PlanInfo, planLabelsSchema } from "@/lib/building/schema";
import { evaluateSia3801 } from "@/lib/building/sia3801";
import { parseHeatingPlan } from "@/lib/heating/plan-schema";
import { createClient } from "@/lib/supabase/server";
import type { KwlTranslate } from "@/pdf/kwl-document";
import { pdfLabels } from "@/pdf/labels";
import { loadLogo } from "@/pdf/logo";
import { Sia3801Document } from "@/pdf/sia3801-document";

// GET /api/pdf/sia3801/<projectId> – Heizwärmebedarf after SIA 380/1 of the Gebäudemodell, in the project language.
export async function GET(_request: Request, { params }: RouteContext<"/api/pdf/sia3801/[id]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const [{ data: project }, { data: firm }, { data: modelRow }, { data: planRows }, { data: heating }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("firm_settings").select("*").eq("id", true).single(),
    supabase.from("building_models").select("data").eq("project_id", id).maybeSingle(),
    supabase.from("building_plans").select("id, floor, name, page, width, height, scale, rotation, north, origin_x, origin_y, labels, preview_path").eq("project_id", id),
    supabase.from("heating_plans").select("data").eq("project_id", id).maybeSingle(),
  ]);
  if (!project) return new Response("Not found", { status: 404 });
  if (!firm) return new Response("Firm settings missing", { status: 500 });

  const locale = languageToLocale(project.language);
  const messages = (await import(`../../../../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages }) as unknown as KwlTranslate;
  const labels = pdfLabels(project.language);
  const model = parseBuildingModel(modelRow?.data);
  const plans: PlanInfo[] = (planRows ?? []).map((p) => ({
    labels: planLabelsSchema.parse(p.labels),
    previewPath: p.preview_path,
    id: p.id,
    floor: p.floor,
    name: p.name,
    page: p.page,
    width: p.width,
    height: p.height,
    scale: p.scale,
    rotation: p.rotation,
    north: p.north,
    originX: p.origin_x,
    originY: p.origin_y,
  }));
  const { catalog } = parseHeatingPlan(heating?.data);
  const result = evaluateSia3801(model, plans, catalog, deriveElements(model, plans));

  const pdf = await renderToBuffer(
    <Sia3801Document firm={firm} logo={await loadLogo()} t={t} pageLabel={labels.page} projectLabel={labels.project} dateLabel={labels.date} project={project} model={model} result={result} />,
  );

  const filename = `SIA380-1-${project.number}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "private, no-store" },
  });
}
