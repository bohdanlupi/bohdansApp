import { renderToBuffer } from "@react-pdf/renderer";
import { createTranslator } from "next-intl";

import { languageToLocale } from "@/i18n/config";
import { getCurrentProfile } from "@/lib/auth";
import { firePhases } from "@/lib/fire/phases";
import { parseFirePlan } from "@/lib/fire/plan-schema";
import { parseHeatingPlan } from "@/lib/heating/plan-schema";
import { parsePlanData } from "@/lib/kwl/plan-schema";
import { parseSanitaryPlan } from "@/lib/sanitary/plan-schema";
import { createClient } from "@/lib/supabase/server";
import { FirePlanDocument } from "@/pdf/fire-plan-document";
import type { KwlTranslate } from "@/pdf/kwl-document";
import { pdfLabels } from "@/pdf/labels";
import { loadLogo } from "@/pdf/logo";

// GET /api/pdf/fire-plan/<projectId>[?phase=32] – Brandschutzplanung (criteria + checklists) in the project language.
export async function GET(request: Request, { params }: RouteContext<"/api/pdf/fire-plan/[projectId]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const [{ data: project }, { data: firm }, { data: fire }, { data: heating }, { data: ventilation }, { data: sanitary }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
    supabase.from("firm_settings").select("*").eq("id", true).single(),
    supabase.from("fire_plans").select("data").eq("project_id", projectId).maybeSingle(),
    supabase.from("heating_plans").select("data").eq("project_id", projectId).maybeSingle(),
    supabase.from("ventilation_plans").select("data").eq("project_id", projectId).maybeSingle(),
    supabase.from("sanitary_plans").select("data").eq("project_id", projectId).maybeSingle(),
  ]);
  if (!project) return new Response("Not found", { status: 404 });
  if (!firm) return new Response("Firm settings missing", { status: 500 });

  const code = new URL(request.url).searchParams.get("phase");
  const selected = code ? firePhases.filter((p) => p.code === code) : firePhases;
  if (selected.length === 0) return new Response("Not found", { status: 404 });

  const locale = languageToLocale(project.language);
  const messages = (await import(`../../../../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: "firePlan" }) as unknown as KwlTranslate;
  const tHeating = createTranslator({ locale, messages, namespace: "heatingPlan" }) as unknown as KwlTranslate;
  const labels = pdfLabels(project.language);
  const firePlan = parseFirePlan(fire?.data);

  const pdf = await renderToBuffer(
    <FirePlanDocument
      firm={firm}
      logo={await loadLogo()}
      t={t}
      tHeating={tHeating}
      language={project.language}
      pageLabel={labels.page}
      projectLabel={labels.project}
      dateLabel={labels.date}
      project={project}
      plans={{
        fire: firePlan,
        heating: parseHeatingPlan(heating?.data),
        ventilation: parsePlanData(ventilation?.data),
        sanitary: parseSanitaryPlan(sanitary?.data),
      }}
      notes={firePlan.notes}
      phases={selected}
    />,
  );

  const filename = `Brandschutzplanung-${project.number}${code ? `-${code}` : ""}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
