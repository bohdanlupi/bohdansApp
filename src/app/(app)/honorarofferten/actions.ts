"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { assertRole } from "@/lib/auth";
import { feeOfferStatuses } from "@/lib/fees/options";
import { newFeeOfferData, parseFeeOfferData } from "@/lib/fees/offer-schema";
import { parseFeeSettings } from "@/lib/fees/settings-schema";
import { feeTrades } from "@/lib/fees/sia108";
import type { FormState } from "@/lib/form-state";
import { nextYearNumber } from "@/lib/next-number";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { languageSchema, optionalText, PG_UNIQUE_VIOLATION } from "@/lib/validation";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableText = z.string().trim().max(200).nullable().transform((v) => v || null);

const createSchema = z.object({
  number: z.string().trim().min(1).max(50),
  title: z.string().trim().min(1).max(200),
  company_id: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  contact_id: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  street: optionalText,
  zip: optionalText,
  city: optionalText,
  language: languageSchema,
});

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });

export async function createFeeOffer(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  const trades = feeTrades.filter((t) => formData.getAll("trades").includes(t));
  if (!parsed.success) return { error: "invalidInput" };
  if (!trades.length) return { error: "noTradeChosen" };

  const supabase = await createClient();
  const { data: firm } = await supabase.from("firm_settings").select("offer_validity_days, fee_settings").eq("id", true).single();
  const settings = parseFeeSettings(firm?.fee_settings);
  const { data: row, error } = await supabase
    .from("fee_offers")
    .insert({
      ...parsed.data,
      valid_until: addDays(new Date(), firm?.offer_validity_days ?? 30),
      data: newFeeOfferData(settings, trades) as unknown as Json,
    })
    .select("id")
    .single();
  if (error || !row) return { error: error?.code === PG_UNIQUE_VIOLATION ? "offerNumberExists" : "saveFailed" };

  revalidatePath("/honorarofferten");
  redirect(`/honorarofferten/${row.id}`);
}

const headerSchema = z.object({
  number: z.string().trim().min(1).max(50),
  title: z.string().trim().min(1).max(200),
  status: z.enum(feeOfferStatuses),
  company_id: z.uuid().nullable(),
  contact_id: z.uuid().nullable(),
  street: nullableText,
  zip: nullableText,
  city: nullableText,
  language: languageSchema,
  offer_date: isoDate,
  valid_until: isoDate.nullable(),
});

export type FeeOfferHeader = z.input<typeof headerSchema>;

/** Autosave of the editor: header columns and the offer data. */
export async function saveFeeOffer(id: string, payload: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  const p = (payload && typeof payload === "object" ? payload : {}) as { header?: unknown; data?: unknown };
  const header = headerSchema.safeParse(p.header);
  if (!z.uuid().safeParse(id).success || !header.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("fee_offers")
    .update({ ...header.data, data: parseFeeOfferData(p.data) as unknown as Json })
    .eq("id", id);
  if (error) return { error: error.code === PG_UNIQUE_VIOLATION ? "offerNumberExists" : "saveFailed" };

  revalidatePath("/honorarofferten");
  return {};
}

export async function deleteFeeOffer(id: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(id).success) return { error: "invalidInput" };
  const supabase = await createClient();
  const { error } = await supabase.from("fee_offers").delete().eq("id", id);
  if (error) return { error: "deleteFailed" };
  revalidatePath("/honorarofferten");
  redirect("/honorarofferten");
}

/**
 * Accepted offer → project: name, address and language of the offer, the client as participant. The offer is
 * marked accepted and linked to the project.
 */
export async function createProjectFromOffer(id: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(id).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data: offer } = await supabase.from("fee_offers").select("*").eq("id", id).maybeSingle();
  if (!offer) return { error: "invalidInput" };
  if (offer.project_id) redirect(`/projekte/${offer.project_id}`);

  const { data: bkp } = await supabase.from("cost_plan_templates").select("id").eq("key", "bkp").maybeSingle();
  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      number: await nextYearNumber("projects"),
      name: offer.title,
      street: offer.street,
      zip: offer.zip,
      city: offer.city,
      language: offer.language,
      status: "active",
      cost_plan_template_id: bkp?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !project) return { error: "saveFailed" };

  if (offer.company_id) {
    await supabase.from("project_participants").insert({ project_id: project.id, company_id: offer.company_id, contact_id: offer.contact_id, role: "client" });
  }
  await supabase.from("fee_offers").update({ project_id: project.id, status: "accepted" }).eq("id", id);

  revalidatePath("/honorarofferten");
  revalidatePath("/projekte");
  redirect(`/projekte/${project.id}`);
}

/** Firm-wide fee settings (admins only). */
export async function saveFeeSettings(_key: string, data: unknown): Promise<{ error?: string }> {
  const admin = await assertRole("admin");
  const supabase = await createClient();
  const { error } = await supabase
    .from("firm_settings")
    .update({ fee_settings: parseFeeSettings(data) as unknown as Json, updated_by: admin.id })
    .eq("id", true);
  if (error) return { error: "saveFailed" };
  revalidatePath("/einstellungen/honorar");
  return {};
}
