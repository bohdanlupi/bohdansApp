// Product data for the network calculation. Zehnder data (digitised from the Zehnder CH datasheets in
// Berechnungsvorlagen/Lüftung KWL/Zehnder Daten) has priority; generic duct sizes are the fallback.
// Curves are pressure drop [Pa] over air flow [m³/h]; duct curves are [Pa/m].

import { zehnderProducts } from "./zehnder-data";

export type Curve = {
  label: string;
  points: [number, number][];
  /** Distributors: whether the x axis is the total flow or the flow per outlet. */
  flowRefersTo?: "total" | "perOutlet";
  /** Curve measured for supply or extract air (e.g. terminal with / without filter). */
  use?: "supply" | "extract";
};

export type ProductKind =
  | "device"
  | "duct"
  | "fitting"
  | "silencer"
  | "filter"
  | "distributor"
  | "terminal"
  | "grille"
  | "valve"
  | "transfer"
  | "extension";

export type DeviceMeasurement = { qv: number; pst: number; powerW: number; spi?: number };

export type Product = {
  key: string;
  manufacturer: string;
  name: string;
  kind: ProductKind;
  /** Pressure-drop curves (Pa over m³/h), or duct friction (Pa/m over m³/h) for ducts. */
  curves: Curve[];
  /** Inner cross-section of ducts / connections for velocity and dynamic pressure. */
  inner?: { diameter?: number; width?: number; height?: number };
  outlets?: number;
  use?: "supply" | "extract" | "both" | "outdoor" | "exhaust" | "transfer";
  recommendedRange?: [number, number];
  articles: { number: string; text: string }[];
  source?: { file: string; page?: number };
  notes?: string;
  device?: {
    measurements: DeviceMeasurement[];
    maxExternalCurve: [number, number][];
    maxFlow?: number;
    nominalFlow?: number;
  };
};

/** Generic ducts (no manufacturer curve): friction by Darcy–Weisbach with textbook roughness. */
const genericDucts: Product[] = [80, 100, 125, 150, 160, 180, 200, 250, 315].map((d) => ({
  key: `spiro-${d}`,
  manufacturer: "",
  name: `Wickelfalzrohr ø ${d}`,
  kind: "duct" as const,
  curves: [],
  inner: { diameter: d },
  articles: [],
}));

export const products: Product[] = [...zehnderProducts, ...genericDucts];

const byKey = new Map(products.map((p) => [p.key, p]));
export const findProduct = (key: string | null | undefined) => (key ? (byKey.get(key) ?? null) : null);
export const productsOfKind = (...kinds: ProductKind[]) => products.filter((p) => kinds.includes(p.kind));

/**
 * Datasheet device for a device key: the Zehnder product itself, or the datasheet equivalent of a workbook device
 * (e.g. workbook «zehnder-comfoair-q350-st» → datasheet «ComfoAir Q350»). Datasheet data has priority.
 */
export function datasheetDevice(key: string | null | undefined): Product | null {
  if (!key) return null;
  const direct = findProduct(key);
  if (direct?.device) return direct;
  const mapped = findProduct(key.replace(/-st$/, ""));
  return mapped?.device ? mapped : null;
}

/** The chosen curve of a product, else the first curve measured for the air side, else the first curve. */
export function productCurve(product: Product | null, label: string | null | undefined, side: "supply" | "extract"): Curve | null {
  if (!product) return null;
  return (
    product.curves.find((c) => c.label === label) ?? product.curves.find((c) => c.use === side) ?? product.curves[0] ?? null
  );
}

/** Interpolates a curve linearly; outside the range it extrapolates with (q / q_edge)² for pressure curves. */
export function curveValue(points: [number, number][], q: number, quadratic = true): number | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  if (q <= 0) return 0;
  if (q <= sorted[0][0]) {
    const [q0, p0] = sorted[0];
    return quadratic ? p0 * (q / q0) ** 2 : sorted.length > 1 ? interpolate(sorted[0], sorted[1], q) : p0;
  }
  const last = sorted[sorted.length - 1];
  if (q >= last[0]) return quadratic ? last[1] * (q / last[0]) ** 2 : sorted.length > 1 ? interpolate(sorted[sorted.length - 2], last, q) : last[1];
  for (let i = 1; i < sorted.length; i++) if (q <= sorted[i][0]) return interpolate(sorted[i - 1], sorted[i], q);
  return null;
}

const interpolate = ([x0, y0]: [number, number], [x1, y1]: [number, number], x: number) => (x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0));

/** Article number without spaces, as in the IGH catalogue. */
export const normalizeArticle = (number: string) => number.replace(/\s+/g, "");
