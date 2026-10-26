import { renderToBuffer } from "@react-pdf/renderer";
import { createTranslator } from "next-intl";

import { languageToLocale } from "@/i18n/config";
import { getCurrentProfile } from "@/lib/auth";
import { parseBuildingModel, type PlanInfo, planLabelsSchema } from "@/lib/building/schema";
import { createClient } from "@/lib/supabase/server";
import { BuildingPlanDocument, type PlanImage } from "@/pdf/building-plan-document";
import type { KwlTranslate } from "@/pdf/kwl-document";

// GET /api/pdf/building/<projectId> – plan sheets of the Gebäudemodell: one A3 page per Geschoss with the plan preview
// (or the snapshot for plans uploaded before previews existed), rooms, envelope and room table.
export async function GET(_request: Request, { params }: RouteContext<"/api/pdf/building/[id]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const [{ data: project }, { data: firm }, { data: modelRow }, { data: planRows }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("firm_settings").select("*").eq("id", true).single(),
    supabase.from("building_models").select("data").eq("project_id", id).maybeSingle(),
    supabase.from("building_plans").select("*").eq("project_id", id),
  ]);
  if (!project) return new Response("Not found", { status: 404 });
  if (!firm) return new Response("Firm settings missing", { status: 500 });
  if (!planRows?.length) return new Response("No plans", { status: 404 });

  const locale = languageToLocale(project.language);
  const messages = (await import(`../../../../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages }) as unknown as KwlTranslate;
  const model = parseBuildingModel(modelRow?.data);

  const images: PlanImage[] = [];
  for (const p of planRows) {
    const path = p.preview_path ?? p.snapshot_path;
    const { data: file } = await supabase.storage.from("plans").download(path);
    if (!file) continue;
    const plan: PlanInfo = {
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
    };
    images.push({ plan, data: Buffer.from(await file.arrayBuffer()) });
  }
  if (!images.length) return new Response("No plans", { status: 404 });

  const pdf = await renderToBuffer(<BuildingPlanDocument firm={firm} t={t} project={project} model={model} images={images} />);
  const filename = `Gebaeudemodell-${project.number}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "private, no-store" },
  });
}
