import { renderToBuffer } from "@react-pdf/renderer";
import { createTranslator } from "next-intl";

import { languageToLocale } from "@/i18n/config";
import { getCurrentProfile } from "@/lib/auth";
import { evaluateSystem, roomFlows, systemChecks, systemQuantities } from "@/lib/kwl/network";
import { checkDevice } from "@/lib/kwl/network-device";
import { parsePlanData } from "@/lib/kwl/plan-schema";
import { parseKwlData } from "@/lib/kwl/schema";
import { layoutSystem } from "@/lib/kwl/schema-layout";
import { externalPressureCheck } from "@/lib/kwl/sia3825";
import { parseSystemData } from "@/lib/kwl/system-schema";
import { createClient } from "@/lib/supabase/server";
import type { KwlTranslate } from "@/pdf/kwl-document";
import { KwlSystemDocument } from "@/pdf/kwl-system-document";
import { pdfLabels } from "@/pdf/labels";
import { loadLogo } from "@/pdf/logo";

// GET /api/pdf/kwl-system/<systemId> – Lüftungsanlage (device, results, Prinzipschema, elements, quantities).
export async function GET(_request: Request, { params }: RouteContext<"/api/pdf/kwl-system/[systemId]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { systemId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(systemId)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: system } = await supabase.from("ventilation_systems").select("*").eq("id", systemId).maybeSingle();
  if (!system) return new Response("Not found", { status: 404 });
  const [{ data: project }, { data: firm }, { data: calcRows }, { data: plan }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", system.project_id).maybeSingle(),
    supabase.from("firm_settings").select("*").eq("id", true).single(),
    supabase.from("ventilation_calcs").select("id, name, data").eq("project_id", system.project_id).order("sort").order("created_at"),
    supabase.from("ventilation_plans").select("data").eq("project_id", system.project_id).maybeSingle(),
  ]);
  if (!project) return new Response("Not found", { status: 404 });
  if (!firm) return new Response("Firm settings missing", { status: 500 });

  const locale = languageToLocale(project.language);
  const messages = (await import(`../../../../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages }) as unknown as KwlTranslate;
  const labels = pdfLabels(project.language);

  const data = parseSystemData(system.data);
  const calcs = (calcRows ?? []).map((c) => ({ id: c.id, name: c.name, data: parseKwlData(c.data) }));
  const rooms = roomFlows(calcs, data.calcIds);
  const result = evaluateSystem(data, rooms);
  const device = checkDevice(
    data.device,
    { flow: result.supply.flow, dp: result.external.supply ?? 0 },
    { flow: result.extract.flow, dp: result.external.extract ?? 0 },
    data.deviceOptions,
  );
  const fondDp = device.attachments?.fond?.dp ?? 0;
  const total =
    result.external.supply !== null || result.external.extract !== null ? (result.external.supply ?? 0) + fondDp + (result.external.extract ?? 0) : null;
  const design = parsePlanData(plan?.data).params;
  const check = externalPressureCheck(design.system, design.operation === "demand", total);
  const layout = layoutSystem(data, rooms, (n) => rooms.find((r) => r.calcId === n.calcId && r.roomId === n.roomId)?.name ?? n.label);

  const pdf = await renderToBuffer(
    <KwlSystemDocument
      firm={firm}
      logo={await loadLogo()}
      t={t}
      pageLabel={labels.page}
      projectLabel={labels.project}
      dateLabel={labels.date}
      project={project}
      name={system.name}
      data={data}
      rooms={rooms}
      dwellings={calcs.filter((c) => data.calcIds.includes(c.id)).map((c) => c.name)}
      result={result}
      device={device}
      checks={systemChecks(data, rooms, result)}
      pressure={{ status: check.status, limit: check.limit ?? null, target: check.target ?? null }}
      layout={layout}
      quantities={systemQuantities(data).filter((q) => q.quantity > 0)}
    />,
  );

  const filename = `Lueftungsanlage-${project.number}-${system.name}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
