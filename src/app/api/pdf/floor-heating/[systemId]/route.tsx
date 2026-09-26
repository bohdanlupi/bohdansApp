import { renderToBuffer } from "@react-pdf/renderer";
import { createTranslator } from "next-intl";

import { languageToLocale } from "@/i18n/config";
import { getCurrentProfile } from "@/lib/auth";
import { evaluateFloor } from "@/lib/heating/floor";
import { parseFloorSystem } from "@/lib/heating/floor-schema";
import { parseHeatLoad } from "@/lib/heating/heat-load-schema";
import { linkedRooms, roomLookup } from "@/lib/heating/links";
import { parseHeatingPlan } from "@/lib/heating/plan-schema";
import { createClient } from "@/lib/supabase/server";
import { FloorHeatingDocument } from "@/pdf/heating-documents";
import type { KwlTranslate } from "@/pdf/kwl-document";
import { pdfLabels } from "@/pdf/labels";
import { loadLogo } from "@/pdf/logo";

// GET /api/pdf/floor-heating/<systemId> – floor heating after HAKA.GERODUR (group temperatures, rooms per distributor).
export async function GET(_request: Request, { params }: RouteContext<"/api/pdf/floor-heating/[systemId]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { systemId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(systemId)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: system } = await supabase.from("heating_systems").select("*").eq("id", systemId).maybeSingle();
  if (!system) return new Response("Not found", { status: 404 });
  const [{ data: project }, { data: firm }, { data: plan }, { data: calcRows }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", system.project_id).maybeSingle(),
    supabase.from("firm_settings").select("*").eq("id", true).single(),
    supabase.from("heating_plans").select("data").eq("project_id", system.project_id).maybeSingle(),
    supabase.from("heating_calcs").select("id, name, data").eq("project_id", system.project_id),
  ]);
  if (!project) return new Response("Not found", { status: 404 });
  if (!firm) return new Response("Firm settings missing", { status: 500 });

  const locale = languageToLocale(project.language);
  const messages = (await import(`../../../../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages }) as unknown as KwlTranslate;
  const labels = pdfLabels(project.language);
  const { site, catalog } = parseHeatingPlan(plan?.data);
  const calcs = (calcRows ?? []).map((c) => ({ id: c.id, name: c.name, data: parseHeatLoad(c.data) }));
  const data = parseFloorSystem(system.data);

  const pdf = await renderToBuffer(
    <FloorHeatingDocument
      firm={firm}
      logo={await loadLogo()}
      t={t}
      pageLabel={labels.page}
      projectLabel={labels.project}
      dateLabel={labels.date}
      project={project}
      name={system.name}
      data={data}
      result={evaluateFloor(data, roomLookup(linkedRooms(calcs, site, catalog)))}
    />,
  );

  const filename = `Fussbodenheizung-${project.number}-${system.name}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "private, no-store" },
  });
}
