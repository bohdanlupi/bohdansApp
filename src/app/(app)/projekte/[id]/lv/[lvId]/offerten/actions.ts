"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertRole } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";
import { optionalText, PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION } from "@/lib/validation";

// Offer pages and the comparison live below the LV layout.
const revalidateLv = () => revalidatePath("/projekte/[id]/lv/[lvId]", "layout");

const bidderSchema = z.object({
  lv_id: z.uuid(),
  company_id: z.uuid(),
  contact_id: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
});

export async function addBidder(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const parsed = bidderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data: firm } = await supabase.from("firm_settings").select("vat_rate").eq("id", true).single();
  const { error } = await supabase.from("lv_bidders").insert({ ...parsed.data, vat_pct: firm?.vat_rate ?? 8.1 });
  if (error) return { error: error.code === PG_UNIQUE_VIOLATION ? "bidderExists" : "saveFailed" };

  revalidateLv();
  return { success: "saved" };
}

const pct = z.number().finite().min(0).max(100);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

const bidderUpdateSchema = z
  .object({
    status: z.enum(["invited", "offered", "declined"]),
    contact_id: z.uuid().nullable(),
    invited_at: date,
    offer_received_at: date,
    offer_reference: z.string().trim().max(100).nullable(),
    discount_pct: pct,
    skonto_pct: pct,
    other_deductions: z.number().finite().min(-1e10).max(1e10),
    vat_pct: pct,
    notes: z.string().trim().max(5000).nullable(),
  })
  .partial();
export type BidderUpdate = z.input<typeof bidderUpdateSchema>;

export async function updateBidder(bidderId: string, patch: BidderUpdate): Promise<FormState> {
  await assertRole("admin", "planer");
  const parsed = bidderUpdateSchema.safeParse(patch);
  if (!z.uuid().safeParse(bidderId).success || !parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("lv_bidders").update(parsed.data).eq("id", bidderId);
  if (error) return { error: "saveFailed" };

  revalidateLv();
  return {};
}

export async function removeBidder(bidderId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(bidderId).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("lv_bidders").delete().eq("id", bidderId);
  if (error) return { error: error.code === PG_FOREIGN_KEY_VIOLATION ? "bidderAwarded" : "deleteFailed" };

  revalidateLv();
  return {};
}

/**
 * Saves one offered unit price (null clears it). The first price marks the bidder as "offered"
 * and sets the received date to today if it is still empty.
 */
export async function saveOfferPrice(bidderId: string, lvId: string, nodeId: string, unitPrice: number | null): Promise<FormState> {
  await assertRole("admin", "planer");
  const ids = z.tuple([z.uuid(), z.uuid(), z.uuid()]).safeParse([bidderId, lvId, nodeId]);
  const price = z.number().finite().min(-1e10).max(1e10).nullable().safeParse(unitPrice);
  if (!ids.success || !price.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("offer_prices")
    .upsert({ lv_bidder_id: bidderId, lv_node_id: nodeId, lv_id: lvId, unit_price: price.data });
  if (error) return { error: "saveFailed" };

  if (price.data !== null) {
    await supabase
      .from("lv_bidders")
      .update({ status: "offered", offer_received_at: new Date().toISOString().slice(0, 10) })
      .eq("id", bidderId)
      .eq("status", "invited");
  }
  return {};
}

/** Revalidates the offer pages after a series of price entries (called when leaving the grid). */
export async function refreshOffers() {
  revalidateLv();
}

const awardSchema = z.object({
  lv_id: z.uuid(),
  awarded_bidder_id: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  award_date: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/)
    .transform((v) => v || null),
  award_justification: optionalText,
});

/** Saves the award decision; the LV status follows (awarded / back to tendered). */
export async function saveAward(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const parsed = awardSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidInput" };

  const { lv_id, ...award } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("lvs")
    .update({
      ...award,
      award_date: award.awarded_bidder_id ? (award.award_date ?? new Date().toISOString().slice(0, 10)) : null,
      status: award.awarded_bidder_id ? "awarded" : "tendered",
    })
    .eq("id", lv_id);
  if (error) return { error: "saveFailed" };

  revalidateLv();
  revalidatePath("/projekte/[id]/lv", "page");
  return { success: "saved" };
}
