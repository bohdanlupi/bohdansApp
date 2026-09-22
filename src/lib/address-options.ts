// Fixed option keys for addresses and projects. Labels live in messages/*.json under `options`.

/** What a company is for us (a company can have several). */
export const companyCategories = [
  "client",
  "architect",
  "engineer",
  "contractor",
  "supplier",
  "authority",
  "other",
] as const;
export type CompanyCategory = (typeof companyCategories)[number];

/** Trades a contractor or supplier works in (used to pick bidders for an LV). */
export const trades = [
  "sanitary",
  "heating",
  "ventilation",
  "air_conditioning",
  "refrigeration",
  "sheet_metal",
  "electrical",
  "building_automation",
  "insulation",
  "general",
] as const;
export type Trade = (typeof trades)[number];

/** Role of a company in a project. */
export const participantRoles = [
  "client",
  "client_representative",
  "architect",
  "general_contractor",
  "engineer",
  "contractor",
  "supplier",
  "authority",
  "other",
] as const;
export type ParticipantRole = (typeof participantRoles)[number];

export const projectStatuses = ["acquisition", "active", "on_hold", "completed", "archived"] as const;

export const salutations = ["mr", "ms"] as const;

/** Keeps only known keys, e.g. for arrays coming from forms or CSV files. */
export function onlyKnown<T extends string>(values: readonly string[], known: readonly T[]): T[] {
  return [...new Set(values.filter((v): v is T => (known as readonly string[]).includes(v)))];
}
