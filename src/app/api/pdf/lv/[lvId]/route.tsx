import { renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";

import { getCurrentProfile } from "@/lib/auth";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { loadLogo } from "@/pdf/logo";
import { LvDocument, type PdfNode } from "@/pdf/lv-document";

// GET /api/pdf/lv/<id>            tender version (empty price columns)
// GET /api/pdf/lv/<id>?preise=1   estimate version with unit prices and totals
export async function GET(request: NextRequest, { params }: RouteContext<"/api/pdf/lv/[lvId]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { lvId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(lvId)) return new Response("Not found", { status: 404 });
  const withPrices = request.nextUrl.searchParams.get("preise") === "1";

  const supabase = await createClient();
  const [{ data: lv }, { data: nodes }, { data: firm }] = await Promise.all([
    supabase.from("lvs").select("*, project:projects(number, name, city)").eq("id", lvId).maybeSingle(),
    fetchAll((from, to) => supabase.from("lv_nodes").select("*").eq("lv_id", lvId).order("id").range(from, to)).then((data) => ({ data })),
    supabase.from("firm_settings").select("*").eq("id", true).single(),
  ]);
  if (!lv || !lv.project) return new Response("Not found", { status: 404 });
  if (!firm) return new Response("Firm settings missing", { status: 500 });

  const pdf = await renderToBuffer(
    <LvDocument
      firm={firm}
      logo={await loadLogo()}
      language={lv.language}
      project={lv.project}
      lv={lv}
      nodes={(nodes ?? []) as PdfNode[]}
      withPrices={withPrices}
    />,
  );

  const filename = `LV-${lv.project.number}-${lv.number}${withPrices ? "-Schaetzung" : ""}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
