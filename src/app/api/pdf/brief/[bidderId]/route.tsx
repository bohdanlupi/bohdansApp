import { renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";

import { getCurrentProfile } from "@/lib/auth";
import { offerGross, offerTotals } from "@/lib/offer-math";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { formatAmount, formatDate } from "@/pdf/format";
import { loadLogo } from "@/pdf/logo";
import type { LetterType } from "@/pdf/offer-texts";
import { TenderLetter } from "@/pdf/tender-letter";

const types: Record<string, LetterType> = { einladung: "invitation", zusage: "award", absage: "rejection" };

// GET /api/pdf/brief/<bidderId>?typ=einladung|zusage|absage – letter in the recipient's language.
export async function GET(request: NextRequest, { params }: RouteContext<"/api/pdf/brief/[bidderId]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { bidderId } = await params;
  const type = types[request.nextUrl.searchParams.get("typ") ?? ""];
  if (!/^[0-9a-f-]{36}$/i.test(bidderId) || !type) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const [{ data: bidder }, { data: firm }] = await Promise.all([
    supabase
      .from("lv_bidders")
      .select(
        "*, company:companies(name, street, zip, city, language), contact:contacts(salutation, first_name, last_name, language), lv:lvs!lv_bidders_lv_id_fkey(number, title, submission_deadline, project:projects(number, name))",
      )
      .eq("id", bidderId)
      .maybeSingle(),
    supabase.from("firm_settings").select("*").eq("id", true).single(),
  ]);
  if (!bidder?.company || !bidder.lv?.project) return new Response("Not found", { status: 404 });
  if (!firm) return new Response("Firm settings missing", { status: 500 });

  let total = "";
  if (type === "award") {
    const [{ data: nodes }, { data: prices }] = await Promise.all([
      fetchAll((from, to) => supabase.from("lv_nodes").select("id, parent_id, kind, sort, number, quantity, is_optional").eq("lv_id", bidder.lv_id).order("id").range(from, to)).then((data) => ({ data })),
      fetchAll((from, to) => supabase.from("offer_prices").select("lv_node_id, unit_price").eq("lv_bidder_id", bidderId).order("lv_node_id").range(from, to)).then((data) => ({ data })),
    ]);
    const gross = offerGross(nodes ?? [], new Map((prices ?? []).map((p) => [p.lv_node_id, p.unit_price])));
    total = formatAmount(offerTotals(gross, bidder).total);
  }

  const language = bidder.contact?.language ?? bidder.company.language;
  const { lv } = bidder;
  const pdf = await renderToBuffer(
    <TenderLetter
      firm={firm}
      logo={await loadLogo()}
      language={language}
      type={type}
      recipient={bidder.company}
      contact={bidder.contact}
      context={{
        project: `${lv.project!.number} ${lv.project!.name}`,
        lv: `${lv.number} ${lv.title}`,
        deadline: lv.submission_deadline ? formatDate(new Date(lv.submission_deadline)) : null,
        offerDate: bidder.offer_received_at ? formatDate(new Date(bidder.offer_received_at)) : null,
        offerReference: bidder.offer_reference,
        total,
      }}
    />,
  );

  const filename = `${request.nextUrl.searchParams.get("typ")}-${lv.project!.number}-${lv.number}-${bidder.company.name}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
