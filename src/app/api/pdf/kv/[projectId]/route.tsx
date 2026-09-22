import { renderToBuffer } from "@react-pdf/renderer";

import { loadCostPlan } from "@/app/(app)/projekte/[id]/kostenplan/load-cost-plan";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { KvDocument } from "@/pdf/kv-document";
import { loadLogo } from "@/pdf/logo";

// GET /api/pdf/kv/<projectId> – Kostenvoranschlag of a project in its document language.
export async function GET(_request: Request, { params }: RouteContext<"/api/pdf/kv/[projectId]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const [{ data: project }, { data: firm }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
    supabase.from("firm_settings").select("*").eq("id", true).single(),
  ]);
  if (!project) return new Response("Not found", { status: 404 });
  if (!firm) return new Response("Firm settings missing", { status: 500 });

  const { rows, templateName } = await loadCostPlan(project.id, project.cost_plan_template_id, project.language);
  const pdf = await renderToBuffer(
    <KvDocument firm={firm} logo={await loadLogo()} language={project.language} project={project} templateName={templateName} rows={rows} />,
  );

  const filename = `KV-${project.number}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
