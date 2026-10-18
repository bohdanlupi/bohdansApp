import { renderToBuffer } from "@react-pdf/renderer";

import { getCurrentProfile } from "@/lib/auth";
import { invoiceSkonto, invoiceTotals, parseFeeInvoiceData } from "@/lib/fees/invoice";
import { parseFeeOfferData } from "@/lib/fees/offer-schema";
import { isQrIban, type QrBill, qrIban } from "@/lib/qr-bill";
import { createClient } from "@/lib/supabase/server";
import { feeInvoiceTexts } from "@/pdf/fee-invoice-texts";
import { FeeInvoiceDocument } from "@/pdf/fee-invoice-document";
import { feeOfferTexts } from "@/pdf/fee-offer-texts";
import { loadLogo } from "@/pdf/logo";

// GET /api/pdf/honorarrechnung/<invoiceId> – fee invoice in the offer's language, with the QR payment part when the
// firm has a valid Swiss IBAN (no QR-IBAN) and the amount is positive.
export async function GET(_request: Request, { params }: RouteContext<"/api/pdf/honorarrechnung/[invoiceId]">) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { invoiceId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const [{ data: invoice }, { data: firm }] = await Promise.all([
    supabase
      .from("fee_invoices")
      .select(
        "*, offer:fee_offers(id, number, title, street, zip, city, language, data, company:companies(name, street, zip, city, country), contact:contacts(salutation, first_name, last_name), project:projects(zip, city))",
      )
      .eq("id", invoiceId)
      .maybeSingle(),
    supabase.from("firm_settings").select("*").eq("id", true).single(),
  ]);
  if (!invoice?.offer) return new Response("Not found", { status: 404 });
  if (!firm) return new Response("Firm settings missing", { status: 500 });
  const { offer } = invoice;

  const { data: previous } = await supabase
    .from("fee_invoices")
    .select("number, data")
    .eq("offer_id", offer.id)
    .lt("created_at", invoice.created_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const offerData = parseFeeOfferData(offer.data);
  const data = parseFeeInvoiceData(invoice.data);
  const totals = invoiceTotals(offerData, firm.vat_rate, data, previous ? parseFeeInvoiceData(previous.data) : null);
  const language = offer.language;
  const { company, contact } = offer;
  // Recipient: the offer's address (Auftraggeber), else the company's.
  const own = Boolean(offer.street || offer.zip || offer.city);
  const to = { street: own ? offer.street : company?.street, zip: own ? offer.zip : company?.zip, city: own ? offer.city : company?.city };
  const title = contact?.salutation === "mr" ? feeOfferTexts(language).mr : contact?.salutation === "ms" ? feeOfferTexts(language).ms : null;
  const recipient = [
    company?.name,
    contact ? [title, contact.first_name, contact.last_name].filter(Boolean).join(" ") : null,
    to.street,
    [to.zip, to.city].filter(Boolean).join(" "),
  ].filter((line): line is string => Boolean(line));

  const iban = qrIban(firm.iban);
  const qr: QrBill | null =
    iban && !isQrIban(iban) && totals.total > 0
      ? {
          iban,
          creditor: { name: firm.name, street: firm.street, zip: firm.zip, city: firm.city, country: firm.country },
          debtor: company ? { name: company.name, street: to.street ?? null, zip: to.zip ?? null, city: to.city ?? null, country: company.country } : null,
          amount: totals.total,
          message: feeInvoiceTexts(language).qr.message(invoice.number),
        }
      : null;

  const pdf = await renderToBuffer(
    <FeeInvoiceDocument
      firm={firm}
      logo={await loadLogo()}
      recipient={recipient}
      vatRate={firm.vat_rate}
      qr={qr}
      invoice={{
        number: invoice.number,
        invoiceDate: invoice.invoice_date,
        dueDate: invoice.due_date,
        offerNumber: offer.number,
        projectLine: [offer.title, [offer.project?.zip, offer.project?.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
        language,
        offer: offerData,
        text: data.text,
        conditions: data.conditions,
        totals,
        previousNumber: previous?.number ?? null,
        skonto: invoiceSkonto(offerData, data),
      }}
    />,
  );

  const filename = `Honorarrechnung-${invoice.number}-${offer.title}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
