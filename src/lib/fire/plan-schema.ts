import { z } from "zod";

import { checkSchema, lenientRecord } from "@/lib/planning";

// Brandschutzplanung of a project (fire_plans.data): the design criteria of the VKF Brandschutzvorschriften 2015
// (Gebäudehöhe, Nutzungen, Konzept, QSS, technische Brandschutzeinrichtungen), checklist states and notes per
// SIA 108 phase. The HLKS-specific criteria (Brennstoffe, Leistung, Lüftung über Brandabschnitte, Löschposten …)
// live in the Heizung / Lüftung / Sanitär plans and are mirrored in the Brandschutz pages. Parsed leniently.

/** Nutzungen after VKF BSN 1-15 Art. 12 / BSR 11-15 Tabelle 3.3.1 (several per building). */
export const fireUsages = [
  "residential",
  "office",
  "school",
  "retail",
  "hospitalityA",
  "hospitalityB",
  "hospitalityC",
  "assembly",
  "industry",
  "parking",
  "agriculture",
] as const;
export const fireHeights = ["low", "medium", "highRise"] as const;
export const fireConcepts = ["standard", "sprinkler", "performance"] as const;
export const smokeExtractionTypes = ["none", "natural", "mechanical"] as const;

export type FireUsage = (typeof fireUsages)[number];

const bool = z.boolean().catch(false);
/** Set of enum values; unknown entries are dropped, duplicates removed. */
const set = <T extends readonly [string, ...string[]]>(values: T, fallback: T[number][] = []) =>
  z
    .array(z.unknown())
    .transform((list): T[number][] => values.filter((v) => list.includes(v)))
    .catch(fallback);

export const fireParamsSchema = z.object({
  /** Gebäudehöhenkategorie after BSN 1-15 Art. 13: geringer Höhe ≤ 11 m, mittlerer Höhe ≤ 30 m, Hochhaus > 30 m. */
  height: z.enum(fireHeights).catch("low"),
  usages: set(fireUsages, ["residential"]),
  /** New building or change of an existing one (bauliche / nutzungsbezogene Änderung, BSN Art. 2). */
  construction: z.enum(["new", "renovation"]).catch("new"),
  /** Standardkonzept, Brandschutzkonzept mit Sprinkler-Vollschutz, or Nachweisverfahren (BSR 27-15). */
  concept: z.enum(fireConcepts).catch("standard"),
  /** Qualitätssicherungsstufe 1–4 set by the Brandschutzbehörde (BSR 11-15). */
  qss: z.number().int().min(1).max(4).catch(1),
  /** The office acts as QS-Verantwortliche Brandschutz (not only as Fachplaner HLKS). */
  qsRole: bool,
  /** Holzbau / brennbare Tragwerke or brandabschnittsbildende Bauteile. */
  timber: bool,
  sprinkler: bool,
  fireAlarm: bool,
  smokeExtraction: z.enum(smokeExtractionTypes).catch("none"),
  lightning: bool,
  safetyLighting: bool,
  lifts: bool,
});

export const firePlanSchema = z.object({
  params: fireParamsSchema.catch(() => fireParamsSchema.parse({})),
  /** Checklist item id → state (own items only; mirrored HLKS items keep their state in the trade plans). */
  checks: lenientRecord(checkSchema),
  notes: lenientRecord(z.string().max(4000), 10),
  /** Items set to «nicht zutreffend» or excluded by the criteria are hidden in the phase pages. */
  hideNa: bool,
});

export type FirePlan = z.infer<typeof firePlanSchema>;
export type FireParams = FirePlan["params"];

export const parseFirePlan = (value: unknown): FirePlan => firePlanSchema.parse(value ?? {});
