import { renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";

import { getCurrentProfile } from "@/lib/auth";
import type { AppLanguage } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { loadLogo } from "@/pdf/logo";
import { SampleLetter } from "@/pdf/sample-letter";

const languages: AppLanguage[] = ["de", "fr", "it"];

// GET /api/pdf/briefkopf?lang=fr – letterhead preview with dummy content.
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const langParam = request.nextUrl.searchParams.get("lang") as AppLanguage | null;
  const language = langParam && languages.includes(langParam) ? langParam : profile.language;

  const supabase = await createClient();
  const { data: firm } = await supabase.from("firm_settings").select("*").eq("id", true).single();
  if (!firm) return new Response("Firm settings missing", { status: 500 });

  const pdf = await renderToBuffer(<SampleLetter firm={firm} logo={await loadLogo()} language={language} />);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Briefkopf-Vorschau-${language}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
