import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import type { I18nText } from "@/lib/i18n-text";
import { requireProfile } from "@/lib/auth";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { flatten } from "@/lib/tree";
import { param } from "@/lib/validation";

import { loadLv } from "../load-lv";
import { BidderList, type BidderView } from "./bidder-list";
import { OfferEntry, type OfferRow } from "./offer-entry";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/lv/[lvId]/offerten">): Promise<Metadata> {
  const { id, lvId } = await params;
  const lv = await loadLv(id, lvId);
  const t = await getTranslations("lvs.tabs");
  return { title: lv ? `${t("offers")} · LV ${lv.number}` : t("offers") };
}

export default async function OffersPage({ params, searchParams }: PageProps<"/projekte/[id]/lv/[lvId]/offerten">) {
  const { id, lvId } = await params;
  const profile = await requireProfile();
  const lv = await loadLv(id, lvId);
  if (!lv) notFound();
  const canWrite = profile.role !== "viewer";
  const selectedId = param((await searchParams).bieter);

  const supabase = await createClient();
  const [{ data: bidders }, { data: totals }, { data: companies }] = await Promise.all([
    supabase
      .from("lv_bidders")
      .select("*, company:companies(id, name, city, trades), contact:contacts(id, first_name, last_name)")
      .eq("lv_id", lvId)
      .order("created_at"),
    supabase.from("offer_totals").select("*").eq("lv_id", lvId),
    canWrite
      ? supabase.from("companies").select("id, name, city, trades, categories").eq("archived", false).order("name")
      : Promise.resolve({ data: [] }),
  ]);

  const totalsById = new Map((totals ?? []).map((t) => [t.lv_bidder_id, t]));
  const views: BidderView[] = (bidders ?? []).map((b) => ({
    ...b,
    company: b.company!,
    contact: b.contact,
    gross: totalsById.get(b.id)?.gross_total ?? 0,
    missing: totalsById.get(b.id)?.missing_prices ?? 0,
  }));
  const selected = views.find((b) => b.id === selectedId);

  // Contractors of the LV's trade first in the picker.
  const options = (companies ?? [])
    .map((c) => ({ id: c.id, name: c.name, city: c.city, match: Boolean(lv.trade && c.trades.includes(lv.trade)) }))
    .sort((a, b) => Number(b.match) - Number(a.match) || a.name.localeCompare(b.name));

  let rows: OfferRow[] = [];
  if (selected) {
    const [{ data: nodes }, { data: prices }] = await Promise.all([
      fetchAll((from, to) => supabase.from("lv_nodes").select("id, parent_id, kind, sort, number, short_text, unit, quantity, unit_price, is_optional, is_lump_sum").eq("lv_id", lvId).order("id").range(from, to)).then((data) => ({ data })),
      fetchAll((from, to) => supabase.from("offer_prices").select("lv_node_id, unit_price").eq("lv_bidder_id", selected.id).order("lv_node_id").range(from, to)).then((data) => ({ data })),
    ]);
    const priceById = new Map((prices ?? []).map((p) => [p.lv_node_id, p.unit_price]));
    rows = flatten(nodes ?? []).map(({ node, depth }) => ({
      ...node,
      short_text: node.short_text as I18nText,
      depth,
      offered: priceById.get(node.id) ?? null,
    }));
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <BidderList
        projectId={id}
        lvId={lvId}
        bidders={views}
        selectedId={selected?.id ?? null}
        companies={options}
        editable={canWrite}
        awardedBidderId={lv.awarded_bidder_id}
      />
      {selected ? (
        <OfferEntry
          key={selected.id}
          lvId={lvId}
          bidder={selected}
          rows={rows}
          language={lv.language ?? "de"}
          editable={canWrite}
        />
      ) : (
        <OfferHint hasBidders={views.length > 0} />
      )}
    </div>
  );
}

async function OfferHint({ hasBidders }: { hasBidders: boolean }) {
  const t = await getTranslations("offers");
  return (
    <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
      {hasBidders ? t("selectBidder") : t("noBidders")}
    </p>
  );
}
