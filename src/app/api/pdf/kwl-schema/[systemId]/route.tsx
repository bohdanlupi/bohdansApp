import { renderToBuffer } from "@react-pdf/renderer";
import { createTranslator } from "next-intl";

import { languageToLocale } from "@/i18n/config";
import { getCurrentProfile } from "@/lib/auth";
import { hasOptions, optionsList, schemaExtras } from "@/lib/kwl/attachments";
import { evaluateSystem, roomFlows } from "@/lib/kwl/network";
import { findPhase } from "@/lib/kwl/phases";
import { findProduct } from "@/lib/kwl/products";
import { parseKwlData } from "@/lib/kwl/schema";
import { layoutSystem } from "@/lib/kwl/schema-layout";
import { parseSchemaPlan } from "@/lib/kwl/schema-plan";
import { legendKeys, schemaLegend } from "@/lib/kwl/schema-symbols";
import { parseSystemData } from "@/lib/kwl/system-schema";
import { formatNumber } from "@/lib/number-input";
import { createClient } from "@/lib/supabase/server";
import type { KwlTranslate } from "@/pdf/kwl-document";
import { KwlSchemaDocument } from "@/pdf/kwl-schema-document";
import { loadLogo } from "@/pdf/logo";

// GET /api/pdf/kwl-schema/<systemId> – Prinzipschema of a Lüftungsanlage as a plan with title block and legend.
export async function GET(_request: Request, { params }: RouteContext<"/api/pdf/kwl-schema/[systemId]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { systemId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(systemId)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: system } = await supabase.from("ventilation_systems").select("*").eq("id", systemId).maybeSingle();
  if (!system) return new Response("Not found", { status: 404 });
  const [{ data: project }, { data: firm }, { data: calcRows }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", system.project_id).maybeSingle(),
    supabase.from("firm_settings").select("*").eq("id", true).single(),
    supabase.from("ventilation_calcs").select("id, name, data").eq("project_id", system.project_id).order("sort").order("created_at"),
  ]);
  if (!project) return new Response("Not found", { status: 404 });
  if (!firm) return new Response("Firm settings missing", { status: 500 });

  const locale = languageToLocale(project.language);
  const messages = (await import(`../../../../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages }) as unknown as KwlTranslate;
  const s = (key: string) => t(`kwlSystem.${key}`);

  const data = parseSystemData(system.data);
  const plan = parseSchemaPlan(system.schema_plan);
  const calcs = (calcRows ?? []).map((c) => ({ id: c.id, name: c.name, data: parseKwlData(c.data) }));
  const rooms = roomFlows(calcs, data.calcIds);
  const result = evaluateSystem(data, rooms);
  const layout = layoutSystem(data, rooms, (n) => rooms.find((r) => r.calcId === n.calcId && r.roomId === n.roomId)?.name ?? n.label);
  const attachments = schemaExtras(data.device, data.deviceOptions);
  const nodeResult = (id: string) => result.supply.nodes.get(id) ?? result.extract.nodes.get(id) ?? result.outdoor.nodes.get(id) ?? result.exhaust.nodes.get(id);
  const phase = plan.phase ? findPhase(plan.phase) : null;
  const airs = ["outdoor", "supply", "extract", "exhaust"] as const;

  const pdf = await renderToBuffer(
    <KwlSchemaDocument
      layout={layout}
      labels={{
        device: findProduct(data.device)?.name ?? s("device"),
        deviceLines: hasOptions(data.deviceOptions)
          ? optionsList(data.device, data.deviceOptions, {
              erv: t("kwlDevice.ervShort"),
              fond: "ComfoFond-L Q",
              fondFilter: t("kwlDevice.fondFilter"),
              fondLeft: t("kwlDevice.fondLeft"),
              fondRight: t("kwlDevice.fondRight"),
            })
          : [],
        attachments,
        airShort: Object.fromEntries(airs.map((a) => [a, s(`airShort.${a}`)])) as Record<(typeof airs)[number], string>,
        air: Object.fromEntries(airs.map((a) => [a, s(`air.${a}`)])) as Record<(typeof airs)[number], string>,
        material: (m) => s(`materialsShort.${m}`),
        legendTitle: s("plankopf.legend"),
        legend: Object.fromEntries(legendKeys.map((k) => [k, s(`legend.${k}`)])) as Record<(typeof legendKeys)[number], string>,
      }}
      info={(node) => {
        const r = nodeResult(node.id);
        return r ? `${formatNumber(r.flow, 0)} m³/h · ${formatNumber(r.dp, 1)} Pa` : "";
      }}
      legend={schemaLegend(layout, attachments)}
      plankopf={{
        plan: s("plankopf.plan"),
        trade: s("plankopf.trade"),
        index: s("plankopf.index"),
        initials: s("plankopf.initials"),
        date: s("plankopf.date"),
        comment: s("plankopf.comment"),
        parcel: s("plankopf.parcel"),
      }}
      project={project}
      system={system.name}
      phase={phase ? `${phase.code} ${phase.title[project.language]}` : ""}
      revisions={plan.revisions}
      firm={firm}
      logo={await loadLogo()}
    />,
  );
  const filename = `Prinzipschema-${project.number}-${system.name}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
