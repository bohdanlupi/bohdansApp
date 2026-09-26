import { renderToBuffer } from "@react-pdf/renderer";
import { createTranslator } from "next-intl";

import { languageToLocale } from "@/i18n/config";
import { getCurrentProfile } from "@/lib/auth";
import { evaluateKwl } from "@/lib/kwl/evaluate";
import { systemDropsByCalc } from "@/lib/kwl/network";
import { parseKwlData } from "@/lib/kwl/schema";
import { parseSystemData } from "@/lib/kwl/system-schema";
import { createClient } from "@/lib/supabase/server";
import { KwlDocument, type KwlTranslate } from "@/pdf/kwl-document";
import { pdfLabels } from "@/pdf/labels";
import { loadLogo } from "@/pdf/logo";

// GET /api/pdf/kwl/<calcId> – KWL-Auslegung of one dwelling in the project's document language.
export async function GET(_request: Request, { params }: RouteContext<"/api/pdf/kwl/[calcId]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { calcId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(calcId)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: calc } = await supabase.from("ventilation_calcs").select("*").eq("id", calcId).maybeSingle();
  if (!calc) return new Response("Not found", { status: 404 });
  const [{ data: project }, { data: firm }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", calc.project_id).maybeSingle(),
    supabase.from("firm_settings").select("*").eq("id", true).single(),
  ]);
  if (!project) return new Response("Not found", { status: 404 });
  if (!firm) return new Response("Firm settings missing", { status: 500 });

  const locale = languageToLocale(project.language);
  const messages = (await import(`../../../../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: "kwl" }) as unknown as KwlTranslate;
  const labels = pdfLabels(project.language);
  const data = parseKwlData(calc.data);
  const [{ data: systemRows }, { data: calcRows }] = await Promise.all([
    supabase.from("ventilation_systems").select("id, name, data").eq("project_id", calc.project_id),
    supabase.from("ventilation_calcs").select("id, name, data").eq("project_id", calc.project_id),
  ]);
  const drops = systemDropsByCalc(
    (systemRows ?? []).map((s) => ({ id: s.id, name: s.name, data: parseSystemData(s.data) })),
    (calcRows ?? []).map((c) => ({ id: c.id, name: c.name, data: parseKwlData(c.data) })),
  ).get(calc.id);

  const pdf = await renderToBuffer(
    <KwlDocument
      firm={firm}
      logo={await loadLogo()}
      t={t}
      pageLabel={labels.page}
      projectLabel={labels.project}
      dateLabel={labels.date}
      project={project}
      name={calc.name}
      data={data}
      result={evaluateKwl(data, drops ?? null)}
    />,
  );

  const filename = `KWL-${project.number}-${calc.name}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
