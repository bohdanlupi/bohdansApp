import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// GET /api/gebaeude/plan/<planId> – the PNG snapshot of a plan page (short-lived signed URL). The editor references this
// stable URL, so re-renders of the page never reload the large image.
export async function GET(_request: Request, { params }: RouteContext<"/api/gebaeude/plan/[planId]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { planId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(planId)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: plan } = await supabase.from("building_plans").select("snapshot_path").eq("id", planId).maybeSingle();
  if (!plan) return new Response("Not found", { status: 404 });
  const { data } = await supabase.storage.from("plans").createSignedUrl(plan.snapshot_path, 300);
  if (!data) return new Response("Not found", { status: 404 });
  return Response.redirect(data.signedUrl, 302);
}
