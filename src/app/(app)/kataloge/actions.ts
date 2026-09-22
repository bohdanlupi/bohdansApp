"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { onlyKnown, trades } from "@/lib/address-options";
import { assertRole } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";
import { optionalText } from "@/lib/validation";

const catalogSchema = z.object({
  name: z.string().trim().min(1).max(200),
  trade: z.string().transform((v) => onlyKnown([v], trades)[0] ?? null),
  description: optionalText,
});

export async function createCatalog(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const parsed = catalogSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("catalogs").insert(parsed.data).select("id").single();
  if (error || !data) return { error: "saveFailed" };

  revalidatePath("/kataloge");
  redirect(`/kataloge/${data.id}`);
}

export async function updateCatalog(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = catalogSchema.safeParse(Object.fromEntries(formData));
  if (!id.success || !parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("catalogs")
    .update({ ...parsed.data, active: formData.get("active") === "on" })
    .eq("id", id.data);
  if (error) return { error: "saveFailed" };

  revalidatePath("/kataloge", "layout");
  return { success: "saved" };
}

export async function deleteCatalog(id: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(id).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("catalogs").delete().eq("id", id);
  if (error) return { error: "deleteFailed" };

  revalidatePath("/kataloge");
  redirect("/kataloge");
}
