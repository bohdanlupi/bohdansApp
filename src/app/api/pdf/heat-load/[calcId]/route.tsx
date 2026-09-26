import { renderToBuffer } from "@react-pdf/renderer";
import { createTranslator } from "next-intl";

import { languageToLocale } from "@/i18n/config";
import { getCurrentProfile } from "@/lib/auth";
import { evaluateHeatLoad } from "@/lib/heating/heat-load";
import { parseHeatLoad } from "@/lib/heating/heat-load-schema";
import { parseHeatingPlan } from "@/lib/heating/plan-schema";
import { createClient } from "@/lib/supabase/server";
import { HeatLoadDocument } from "@/pdf/heating-documents";
import type { KwlTranslate } from "@/pdf/kwl-document";
import { pdfLabels } from "@/pdf/labels";
import { loadLogo } from "@/pdf/logo";

// GET /api/pdf/heat-load/<calcId> – Norm-Heizlast after SIA 384/2 (basics, rooms, building, elements) in the project language.
export async function GET(_request: Request, { params }: RouteContext<"/api/pdf/heat-load/[calcId]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { calcId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(calcId)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: calc } = await supabase.from("heating_calcs").select("*").eq("id", calcId).maybeSingle();
  if (!calc) return new Response("Not found", { status: 404 });
  const [{ data: project }, { data: firm }, { data: plan }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", calc.project_id).maybeSingle(),
    supabase.from("firm_settings").select("*").eq("id", true).single(),
    supabase.from("heating_plans").select("data").eq("project_id", calc.project_id).maybeSingle(),
  ]);
  if (!project) return new Response("Not found", { status: 404 });
  if (!firm) return new Response("Firm settings missing", { status: 500 });

  const locale = languageToLocale(project.language);
  const messages = (await import(`../../../../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages }) as unknown as KwlTranslate;
  const labels = pdfLabels(project.language);
  const { site, catalog } = parseHeatingPlan(plan?.data);
  const data = parseHeatLoad(calc.data);

  const pdf = await renderToBuffer(
    <HeatLoadDocument
      firm={firm}
      logo={await loadLogo()}
      t={t}
      pageLabel={labels.page}
      projectLabel={labels.project}
      dateLabel={labels.date}
      project={project}
      name={calc.name}
      data={data}
      site={site}
      catalog={catalog}
      result={evaluateHeatLoad(data, site, catalog)}
    />,
  );

  const filename = `Heizlast-${project.number}-${calc.name}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "private, no-store" },
  });
}
