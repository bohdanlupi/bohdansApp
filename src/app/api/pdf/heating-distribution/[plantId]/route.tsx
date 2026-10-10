import { renderToBuffer } from "@react-pdf/renderer";
import { createTranslator } from "next-intl";

import { loadDistributionInputs } from "@/app/(app)/projekte/[id]/heizung/verteilung/schema/load-inputs";
import { languageToLocale } from "@/i18n/config";
import { getCurrentProfile } from "@/lib/auth";
import { evaluateDistribution } from "@/lib/heating/distribution";
import { groupInfos, inputLookups } from "@/lib/heating/distribution-inputs";
import { layoutDistribution } from "@/lib/heating/distribution-layout";
import { parseDistribution } from "@/lib/heating/distribution-schema";
import { parsePlant } from "@/lib/heating/plant-schema";
import { findPhase } from "@/lib/kwl/phases";
import { parseSchemaPlan } from "@/lib/kwl/schema-plan";
import { createClient } from "@/lib/supabase/server";
import { HeatingDistributionDocument } from "@/pdf/heating-distribution-document";
import { loadLogo } from "@/pdf/logo";

type Translate = (key: string, values?: Record<string, string | number>) => string;

// GET /api/pdf/heating-distribution/<plantId> – Prinzipschema Wärmeverteilung (Strangschema) of an Anlage as a plan
// with title block and legend.
export async function GET(_request: Request, { params }: RouteContext<"/api/pdf/heating-distribution/[plantId]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { plantId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(plantId)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: plant } = await supabase.from("heating_plants").select("*").eq("id", plantId).maybeSingle();
  if (!plant) return new Response("Not found", { status: 404 });
  const [{ data: project }, { data: firm }, inputs] = await Promise.all([
    supabase.from("projects").select("*").eq("id", plant.project_id).maybeSingle(),
    supabase.from("firm_settings").select("*").eq("id", true).single(),
    loadDistributionInputs(plant.project_id, { id: plant.id }),
  ]);
  if (!project) return new Response("Not found", { status: 404 });
  if (!firm) return new Response("Firm settings missing", { status: 500 });

  const locale = languageToLocale(project.language);
  const messages = (await import(`../../../../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages }) as unknown as Translate;
  const d = (key: string) => t(`heatingDistribution.${key}`);
  const g = (key: string) => t(`heatingPlan.generation.${key}`);
  const k = (key: string) => t(`kwlSystem.plankopf.${key}`);

  const plantData = parsePlant(plant.data);
  const data = parseDistribution(plant.distribution);
  const lookups = inputLookups(inputs.rooms, inputs.floors, inputs.radiators.list);
  const result = evaluateDistribution(data, groupInfos(plantData.groups, g("schema.group")), lookups.room, lookups.floor, inputs.outsideTemp, lookups.radiator);
  const circuitOf = new Map(plantData.groups.map((x) => [x.id, x.circuit]));
  const schema = layoutDistribution(data, result, {
    vl: "VL",
    rl: "RL",
    insulation: d("schemaText.insulation"),
    strang: d("schemaText.strang"),
    circuit: (gr) => (circuitOf.has(gr.group.id) ? g(`circuits.${circuitOf.get(gr.group.id)}`) : ""),
    head: d("schemaText.head"),
    rings: (n) => t("heatingDistribution.schemaText.rings", { n }),
    ringFittings: d("schemaText.ringFittings"),
    radiator: (r) => [t(`radiators.connections.${r.connection}`), t(`radiators.sides.${r.side}`), t(`radiators.pipeSources.${r.pipeFrom}`)].join(" · "),
  }, lookups.radiatorInfo);
  const plan = parseSchemaPlan(plant.distribution_plan);
  const phase = plan.phase ? findPhase(plan.phase) : null;

  const pdf = await renderToBuffer(
    <HeatingDistributionDocument
      schema={schema}
      legend={{ title: k("legend"), vl: d("legend.vl"), rl: d("legend.rl"), insulation: d("legend.insulation"), symbol: (key) => d(`legend.symbols.${key}`) }}
      plankopf={{
        plan: d("plankopf.plan"),
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
  const filename = `Prinzipschema-Waermeverteilung-${project.number}-${plant.name}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
