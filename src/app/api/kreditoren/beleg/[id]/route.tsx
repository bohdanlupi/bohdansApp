import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// GET /api/kreditoren/beleg/<invoiceId> – the original document of a received invoice (short-lived signed URL).
export async function GET(_request: Request, { params }: RouteContext<"/api/kreditoren/beleg/[id]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: invoice } = await supabase.from("creditor_invoices").select("file_path").eq("id", id).maybeSingle();
  if (!invoice?.file_path) return new Response("Not found", { status: 404 });
  const { data } = await supabase.storage.from("receipts").createSignedUrl(invoice.file_path, 60);
  if (!data) return new Response("Not found", { status: 404 });
  return Response.redirect(data.signedUrl, 302);
}
