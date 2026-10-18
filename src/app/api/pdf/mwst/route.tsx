import { renderToBuffer } from "@react-pdf/renderer";

import { loadVatData } from "@/app/(app)/kreditoren/vat-data";
import { getCurrentProfile } from "@/lib/auth";
import { parseQuarter, quarterRange } from "@/lib/creditors";
import { createClient } from "@/lib/supabase/server";
import { appendReceipts } from "@/pdf/append-receipts";
import { loadLogo } from "@/pdf/logo";
import { VatReportDocument } from "@/pdf/vat-report-document";

// GET /api/pdf/mwst?jahr=2026&quartal=3 – MWST-Abrechnung of a quarter with the received invoices' documents appended.
export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const quarter = parseQuarter(url.searchParams.get("jahr"), url.searchParams.get("quartal"));
  if (!quarter) return new Response("Invalid quarter", { status: 400 });

  const supabase = await createClient();
  const [{ data: firm }, vat] = await Promise.all([supabase.from("firm_settings").select("*").eq("id", true).single(), loadVatData(supabase, quarter)]);
  if (!firm) return new Response("Firm settings missing", { status: 500 });

  const report = await renderToBuffer(
    <VatReportDocument
      firm={firm}
      logo={await loadLogo()}
      period={{ ...quarter, ...quarterRange(quarter) }}
      report={vat.report}
      outgoing={vat.outgoing}
      incoming={vat.incoming}
    />,
  );
  const pdf = await appendReceipts(
    new Uint8Array(report),
    vat.receipts.map((r) => ({
      label: `Beleg ${r.number} – ${r.label}`,
      name: r.name,
      load: async () => {
        const { data } = await supabase.storage.from("receipts").download(r.path);
        return data ? new Uint8Array(await data.arrayBuffer()) : null;
      },
    })),
  );

  const fileName = `MWST-Abrechnung_${quarter.year}_Q${quarter.quarter}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
