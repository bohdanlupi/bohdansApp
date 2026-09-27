import { z } from "zod";

// Plankopf data of the Prinzipschema PDF of a ventilation system (ventilation_systems.schema_plan): the SIA phase
// printed in the title block and the revision list (index A, B, C …), entered in the print dialog.

export type SchemaRevision = { index: string; initials: string; date: string; comment: string };
export type SchemaPlan = { phase: string | null; revisions: SchemaRevision[] };

const revisionSchema = z.object({
  index: z.string().max(4),
  initials: z.string().max(10).catch(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comment: z.string().max(80).catch(""),
});

const schemaPlanSchema = z.object({
  phase: z.string().max(4).nullable().catch(null),
  revisions: z
    .array(z.unknown())
    .catch([])
    .transform((list) => list.slice(0, 50).flatMap((r) => {
      const parsed = revisionSchema.safeParse(r);
      return parsed.success ? [parsed.data] : [];
    })),
});

export function parseSchemaPlan(raw: unknown): SchemaPlan {
  const parsed = schemaPlanSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { phase: null, revisions: [] };
}

/** Next revision index: A, B, … Z, then AA, AB … */
export function nextRevisionIndex(revisions: SchemaRevision[]): string {
  const n = revisions.length;
  const letter = (i: number) => String.fromCharCode(65 + i);
  return n < 26 ? letter(n) : letter(Math.floor(n / 26) - 1) + letter(n % 26);
}

/** Initials of a person for the revision list, e.g. «Joel Gratwohl» → «JG»; else the part of the e-mail before «@». */
export function initialsOf(fullName: string | null | undefined, email: string): string {
  const words = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length) return words.map((w) => w[0]!.toUpperCase()).join("").slice(0, 4);
  return email.split("@")[0]!.slice(0, 4).toUpperCase();
}
