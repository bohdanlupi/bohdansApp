import { renderToBuffer } from "@react-pdf/renderer";
import { createTranslator } from "next-intl";

import { languageToLocale } from "@/i18n/config";
import { getCurrentProfile } from "@/lib/auth";
import { buildGenerationSchema, generationLabels, type PipeKind, type SymbolKey, symbolKeys } from "@/lib/heating/generation-schema";
import { ewsContextOf } from "@/lib/heating/ews";
import { evaluateHeatLoad } from "@/lib/heating/heat-load";
import { parseHeatLoad } from "@/lib/heating/heat-load-schema";
import { parseHeatingPlan } from "@/lib/heating/plan-schema";
import { parsePlant } from "@/lib/heating/plant-schema";
import { findPhase } from "@/lib/kwl/phases";
import { parseSchemaPlan } from "@/lib/kwl/schema-plan";
import { createClient } from "@/lib/supabase/server";
import { HeatingSchemaDocument } from "@/pdf/heating-schema-document";
import { loadLogo } from "@/pdf/logo";

type Translate = (key: string, values?: Record<string, string | number>) => string;

const pipeKinds: PipeKind[] = ["vl", "rl", "brine", "brineR", "gw", "gwR", "pwc", "pwh"];

// GET /api/pdf/heating-schema/<plantId> – Prinzipschema Wärmeerzeugung of an Anlage as a plan with title block and
// legend.
export async function GET(_request: Request, { params }: RouteContext<"/api/pdf/heating-schema/[plantId]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { plantId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(plantId)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: plant } = await supabase.from("heating_plants").select("*").eq("id", plantId).maybeSingle();
  if (!plant) return new Response("Not found", { status: 404 });
  const [{ data: project }, { data: firm }, { data: planRow }, { data: calcs }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", plant.project_id).maybeSingle(),
    supabase.from("firm_settings").select("*").eq("id", true).single(),
    supabase.from("heating_plans").select("data").eq("project_id", plant.project_id).maybeSingle(),
    supabase.from("heating_calcs").select("data").eq("project_id", plant.project_id),
  ]);
  if (!project) return new Response("Not found", { status: 404 });
  if (!firm) return new Response("Firm settings missing", { status: 500 });

  const locale = languageToLocale(project.language);
  const messages = (await import(`../../../../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages }) as unknown as Translate;
  const g = (key: string) => t(`heatingPlan.generation.${key}`);
  const k = (key: string) => t(`kwlSystem.plankopf.${key}`);

  // Same project context as the page: site, EBF and the building heat load (Erdwärmesonden).
  const heatingPlan = parseHeatingPlan(planRow?.data);
  const heatLoad = (calcs ?? []).reduce((s, c) => s + evaluateHeatLoad(parseHeatLoad(c.data), heatingPlan.site, heatingPlan.catalog).building, 0);
  const schema = buildGenerationSchema(parsePlant(plant.data), generationLabels(g), { ews: ewsContextOf(heatingPlan, heatLoad) });
  const plan = parseSchemaPlan(plant.schema_plan);
  const phase = plan.phase ? findPhase(plan.phase) : null;

  const pdf = await renderToBuffer(
    <HeatingSchemaDocument
      schema={schema}
      legend={{
        title: k("legend"),
        pipes: Object.fromEntries(pipeKinds.map((p) => [p, g(`pipes.${p}`)])) as Record<PipeKind, string>,
        symbols: Object.fromEntries(symbolKeys.map((s) => [s, g(`legend.${s}`)])) as Record<SymbolKey, string>,
      }}
      plankopf={{
        plan: g("plankopf.plan"),
        trade: g("plankopf.trade"),
        index: k("index"),
        initials: k("initials"),
        date: k("date"),
        comment: k("comment"),
        parcel: k("parcel"),
      }}
      project={project}
      plant={plant.name}
      phase={phase ? `${phase.code} ${phase.title[project.language]}` : ""}
      revisions={plan.revisions}
      firm={firm}
      logo={await loadLogo()}
    />,
  );
  const filename = `Prinzipschema-Waermeerzeugung-${project.number}-${plant.name}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
