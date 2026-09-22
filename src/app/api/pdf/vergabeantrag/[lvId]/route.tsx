import { renderToBuffer } from "@react-pdf/renderer";

import { loadComparison } from "@/app/(app)/projekte/[id]/lv/[lvId]/vergleich/load-comparison";
import { getCurrentProfile } from "@/lib/auth";
import { AwardProposal } from "@/pdf/award-documents";
import { loadLogo } from "@/pdf/logo";

// GET /api/pdf/vergabeantrag/<lvId> – award proposal in the LV's language.
export async function GET(_request: Request, { params }: RouteContext<"/api/pdf/vergabeantrag/[lvId]">) {
  if (!(await getCurrentProfile())) return new Response("Unauthorized", { status: 401 });
  const { lvId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(lvId)) return new Response("Not found", { status: 404 });

  const data = await loadComparison(lvId);
  if (!data) return new Response("Not found", { status: 404 });

  const pdf = await renderToBuffer(<AwardProposal data={data} logo={await loadLogo()} />);
  const filename = `Vergabeantrag-${data.project.number}-${data.lv.number}.pdf`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
