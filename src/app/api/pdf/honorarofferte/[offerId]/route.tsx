import { renderToBuffer } from "@react-pdf/renderer";

import { getCurrentProfile } from "@/lib/auth";
import { feeTotals } from "@/lib/fees/calc";
import { parseFeeOfferData } from "@/lib/fees/offer-schema";
import { createClient } from "@/lib/supabase/server";
import { FeeOfferDocument } from "@/pdf/fee-offer-document";
import { loadLogo } from "@/pdf/logo";

// GET /api/pdf/honorarofferte/<offerId> – fee offer (letter + Anhang) in the offer's language.
export async function GET(_request: Request, { params }: RouteContext<"/api/pdf/honorarofferte/[offerId]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { offerId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(offerId)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const [{ data: offer }, { data: firm }] = await Promise.all([
    supabase
      .from("fee_offers")
      .select("*, company:companies(name, street, zip, city), contact:contacts(salutation, first_name, last_name)")
      .eq("id", offerId)
      .maybeSingle(),
    supabase.from("firm_settings").select("*").eq("id", true).single(),
  ]);
  if (!offer) return new Response("Not found", { status: 404 });
  if (!firm) return new Response("Firm settings missing", { status: 500 });

  const data = parseFeeOfferData(offer.data);
  const pdf = await renderToBuffer(
    <FeeOfferDocument
      firm={firm}
      logo={await loadLogo()}
      recipient={offer.company}
      contact={offer.contact}
      vatRate={firm.vat_rate}
      offer={{
        number: offer.number,
        title: offer.title,
        street: offer.street,
        zip: offer.zip,
        city: offer.city,
        language: offer.language,
        offerDate: offer.offer_date,
        validUntil: offer.valid_until,
        data,
        totals: feeTotals(data, firm.vat_rate),
      }}
    />,
  );

  const filename = `Honorarofferte-${offer.number}-${offer.title}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
