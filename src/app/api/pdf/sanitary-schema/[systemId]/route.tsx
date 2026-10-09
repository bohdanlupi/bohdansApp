import { renderToBuffer } from "@react-pdf/renderer";
import { createTranslator } from "next-intl";

import { languageToLocale } from "@/i18n/config";
import { getCurrentProfile } from "@/lib/auth";
import { findPhase } from "@/lib/kwl/phases";
import { parseSchemaPlan } from "@/lib/kwl/schema-plan";
import { evaluateSystem } from "@/lib/sanitary/network";
import { applianceSymbols, layoutSchema, type SymbolKey } from "@/lib/sanitary/schema";
import { parseSanitaryData } from "@/lib/sanitary/system-schema";
import { createClient } from "@/lib/supabase/server";
import { loadLogo } from "@/pdf/logo";
import { SanitarySchemaDocument } from "@/pdf/sanitary-schema-document";

type Translate = (key: string, values?: Record<string, string | number>) => string;

const symbolKeys: SymbolKey[] = ["shutoff", "shutoffDrain", "check", "regValve", "regValveThermal", "meter", "filter", "redfil", "reducer", "safety", "pump", "mixer", "softener", "consumer", "battery", "heater", "union", "drain", "manifold", "manifoldConcealed", ...applianceSymbols];

// GET /api/pdf/sanitary-schema/<systemId> – Prinzipschema of a Sanitäranlage as a plan with title block and legend.
export async function GET(_request: Request, { params }: RouteContext<"/api/pdf/sanitary-schema/[systemId]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { systemId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(systemId)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: system } = await supabase.from("sanitary_systems").select("*").eq("id", systemId).maybeSingle();
  if (!system) return new Response("Not found", { status: 404 });
  const [{ data: project }, { data: firm }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", system.project_id).maybeSingle(),
    supabase.from("firm_settings").select("*").eq("id", true).single(),
  ]);
  if (!project) return new Response("Not found", { status: 404 });
  if (!firm) return new Response("Firm settings missing", { status: 500 });

  const locale = languageToLocale(project.language);
  const messages = (await import(`../../../../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages }) as unknown as Translate;
  const s = (key: string, values?: Record<string, string | number>) => t(`sanitary.${key}`, values);
  const k = (key: string) => t(`kwlSystem.plankopf.${key}`);

  const data = parseSanitaryData(system.data);
  const plan = parseSchemaPlan(system.schema_plan);
  const result = evaluateSystem(data);
  const schema = layoutSchema(data, result, {
    kw: s("schemaText.kw"),
    ww: s("schemaText.ww"),
    zk: s("schemaText.zk"),
    insulation: s("schemaText.insulation"),
    none: s("schemaText.none"),
    inShared: s("schemaText.inShared"),
    material: s(`schemaText.materials.${data.settings.insulationMaterial}`),
    strang: s("schemaText.strang"),
    heater: s("schemaText.heater"),
    house: s("schemaText.house"),
    meter: s("schemaText.meter"),
    battery: s("schemaText.battery"),
    softener: s("schemaText.softener"),
    lu: "LU",
  });
  const phase = plan.phase ? findPhase(plan.phase) : null;

  const pdf = await renderToBuffer(
    <SanitarySchemaDocument
      schema={schema}
      legend={{
        title: k("legend"),
        media: { pwc: s("legend.pwc"), pwh: s("legend.pwh"), pwhc: s("legend.pwhc") },
        symbols: Object.fromEntries(symbolKeys.map((key) => [key, s(`legend.symbols.${key}`)])) as Record<SymbolKey, string>,
        insulation: s("legend.insulationBand"),
        sizes: s("legend.sizes"),
      }}
      plankopf={{
        plan: s("plankopf.plan"),
        trade: s("plankopf.trade"),
        index: k("index"),
        initials: k("initials"),
        date: k("date"),
        comment: k("comment"),
        parcel: k("parcel"),
      }}
      project={project}
      system={system.name}
      phase={phase ? `${phase.code} ${phase.title[project.language]}` : ""}
      revisions={plan.revisions}
      firm={firm}
      logo={await loadLogo()}
    />,
  );
  const filename = `Prinzipschema-Sanitaer-${project.number}-${system.name}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
