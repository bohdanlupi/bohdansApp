import { inflateSync } from "node:zlib";

import { Fragment, isValidElement, type ReactElement, type ReactNode } from "react";

import { Legend, TitleBlock } from "./kwl-schema-document";

// A plan document (react-pdf element tree: Document > Page > Svg … and the logo Image) as DXF R12 (ASCII), which
// AutoCAD / BricsCAD open directly and can save as DWG. The tree is walked like react-pdf renders it, so the DXF holds
// exactly what the PDF shows – frame, schema, legend, title block (Plankopf) and the logo – at 1:1 sheet size in mm
// (Y up). Lines and paths become POLYLINEs (arcs as bulges, dashes as separate pieces), small filled shapes SOLIDs,
// texts TEXT entities in Arial; the logo is vectorised into SOLID rectangles, since R12 has no raster images.

type Pt = { x: number; y: number };
/** Polyline vertex; bulge = tan(angle / 4) of the arc to the next vertex, negative = clockwise as seen. */
type Vtx = Pt & { b: number };
type Sub = { v: Vtx[]; closed: boolean };
type Rgb = [number, number, number];
/** Affine matrix [a, b, c, d, e, f] as in SVG: x' = a x + c y + e, y' = b x + d y + f. */
type Matrix = [number, number, number, number, number, number];

const MM = 25.4 / 72;
/** Layers by part of the plan; fills and texts of a part go to <part>_FLAECHEN / <part>_TEXT. */
const PARTS = ["RAHMEN", "SCHEMA", "LEGENDE", "PLANKOPF"] as const;
const LAYER_LOGO = "PLANKOPF_LOGO";
const STYLE = "ARIAL";
const STYLE_BOLD = "ARIAL_BOLD";
/** Strokes from this width [pt on the sheet] get a polyline width (insulation bands); thinner ones stay hairlines. */
const WIDE = 4;
/** Cap height of Helvetica / Arial per font size: DXF text heights are cap heights. */
const CAP = 0.718;

// --- Colours ------------------------------------------------------------------------------------------------------

const hsv = (h: number, s: number, v: number): Rgb => {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
};

/** Approximate RGB of the AutoCAD colours 1–254 (7 = black / white is set apart, 255 is white on paper). */
const aciTable: [number, Rgb][] = (() => {
  const t: [number, Rgb][] = [
    [1, [255, 0, 0]],
    [2, [255, 255, 0]],
    [3, [0, 255, 0]],
    [4, [0, 255, 255]],
    [5, [0, 0, 255]],
    [6, [255, 0, 255]],
    [8, [128, 128, 128]],
    [9, [192, 192, 192]],
  ];
  const values = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3];
  for (let i = 10; i <= 249; i++) t.push([i, hsv(((i - 10) / 10) * 15, i % 2 ? 0.5 : 1, values[i % 10])]);
  [51, 80, 105, 130, 190].forEach((g, k) => t.push([250 + k, [g, g, g]]));
  return t;
})();

const aciCache = new Map<string, number>();

/** Nearest AutoCAD colour; near black is 7 (black on paper, white on a dark screen). */
function aci([r, g, b]: Rgb): number {
  const key = `${r},${g},${b}`;
  const hit = aciCache.get(key);
  if (hit !== undefined) return hit;
  let best = 7;
  if (Math.max(r, g, b) >= 60) {
    let dist = Infinity;
    for (const [i, [cr, cg, cb]] of aciTable) {
      const d = 0.3 * (r - cr) ** 2 + 0.59 * (g - cg) ** 2 + 0.11 * (b - cb) ** 2;
      if (d < dist) [dist, best] = [d, i];
    }
  }
  aciCache.set(key, best);
  return best;
}

const named: Record<string, Rgb> = { black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], grey: [128, 128, 128], gray: [128, 128, 128] };

/** Colour value of a react-pdf prop → RGB, or null for none / transparent. */
function rgb(value: unknown): Rgb | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v || v === "none" || v === "transparent") return null;
  const hex = v.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const h = hex[1].length <= 4 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    if (h.length === 8 && parseInt(h.slice(6, 8), 16) < 40) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
  }
  const m = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/);
  if (m) return m[4] !== undefined && Number(m[4]) < 0.15 ? null : [Number(m[1]), Number(m[2]), Number(m[3])];
  return named[v] ?? [0, 0, 0];
}

/** White: the paper, or masks that hide lines below them on screen – left out. */
const isPaper = ([r, g, b]: Rgb) => Math.min(r, g, b) > 245;
/** Very light fills (e.g. the storey bands) are drawn as an outline only, a SOLID would come out far too dark. */
const isLight = ([r, g, b]: Rgb) => Math.min(r, g, b) > 225;

// --- Geometry -----------------------------------------------------------------------------------------------------

const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** SVG transform list (translate, scale, rotate, matrix) → matrix. */
function parseTransform(transform: unknown): Matrix {
  if (typeof transform !== "string") return IDENTITY;
  let m = IDENTITY;
  for (const [, op, args] of transform.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const n = (args.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    if (op === "translate") m = mul(m, [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0]);
    else if (op === "scale") m = mul(m, [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0]);
    else if (op === "rotate") {
      const a = ((n[0] ?? 0) * Math.PI) / 180;
      const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
      m = mul(mul(mul(m, [1, 0, 0, 1, cx, cy]), [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (op === "matrix" && n.length === 6) m = mul(m, n as Matrix);
  }
  return m;
}

const nums = (s: string) => (s.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);

/** Bulge of a circular arc of radius r from a to b (SVG arc flags; screen coordinates). */
function arcBulge(a: Pt, b: Pt, r: number, large: boolean, sweep: boolean): number {
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  if (chord === 0) return 0;
  let angle = r <= chord / 2 ? Math.PI : 2 * Math.asin(chord / (2 * r));
  if (large) angle = 2 * Math.PI - angle;
  // Sweep flag 1 runs clockwise on screen, which is a negative bulge.
  return Math.tan(angle / 4) * (sweep ? -1 : 1);
}

/** Path data → sub-paths; curves are flattened, circular arcs kept as bulges. */
function parsePath(d: string): Sub[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const subs: Sub[] = [];
  let sub: Sub | null = null;
  let cur: Pt = { x: 0, y: 0 };
  let start: Pt = cur;
  let ctrl: Pt | null = null;
  let cmd = "";
  let i = 0;
  const num = () => Number(tokens[i++]);
  const add = (p: Pt) => {
    if (!sub) {
      sub = { v: [{ ...cur, b: 0 }], closed: false };
      subs.push(sub);
    }
    sub.v.push({ ...p, b: 0 });
    cur = p;
  };
  const curve = (pts: Pt[]) => {
    for (let k = 1; k <= 12; k++) {
      const t = k / 12;
      // De Casteljau
      let q = pts;
      while (q.length > 1) q = q.slice(1).map((p, j) => ({ x: q[j].x + (p.x - q[j].x) * t, y: q[j].y + (p.y - q[j].y) * t }));
      add(q[0]);
    }
  };

  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const o = rel ? cur : { x: 0, y: 0 };
    const pt = () => {
      const x = num();
      return { x: o.x + x, y: o.y + num() };
    };
    const lastCtrl: Pt | null = ctrl;
    ctrl = null;
    switch (cmd.toUpperCase()) {
      case "M":
        cur = start = pt();
        sub = null;
        cmd = rel ? "l" : "L";
        break;
      case "L":
        add(pt());
        break;
      case "H":
        add({ x: (rel ? cur.x : 0) + num(), y: cur.y });
        break;
      case "V":
        add({ x: cur.x, y: (rel ? cur.y : 0) + num() });
        break;
      case "C": {
        const c1 = pt();
        const c2 = pt();
        curve([cur, c1, c2, pt()]);
        ctrl = c2;
        break;
      }
      case "S": {
        const c1: Pt = lastCtrl ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y } : cur;
        const c2 = pt();
        curve([cur, c1, c2, pt()]);
        ctrl = c2;
        break;
      }
      case "Q": {
        const c = pt();
        curve([cur, c, pt()]);
        ctrl = c;
        break;
      }
      case "T": {
        const c: Pt = lastCtrl ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y } : cur;
        curve([cur, c, pt()]);
        ctrl = c;
        break;
      }
      case "A": {
        const rx = Math.abs(num());
        const ry = Math.abs(num());
        num(); // rotation – the schemas only draw circular arcs
        const large = num() !== 0;
        const sweep = num() !== 0;
        const from = cur;
        const to = pt();
        add(to);
        const v = sub!.v;
        v[v.length - 2].b = arcBulge(from, to, (rx + ry) / 2, large, sweep);
        break;
      }
      case "Z":
        if (sub) {
          const s: Sub = sub;
          s.closed = true;
          const last = s.v[s.v.length - 1];
          if (s.v.length > 1 && s.v[s.v.length - 2].b === 0 && Math.hypot(last.x - start.x, last.y - start.y) < 1e-9) s.v.pop();
        }
        cur = start;
        sub = null;
        break;
      default:
        i++; // unknown token: skip it
    }
  }
  return subs.filter((s) => s.v.length > 1);
}

/** Arcs replaced by short segments (for dashing); DXF space, Y up, positive bulge counter-clockwise. */
function flatten(s: Sub): Pt[] {
  const v = s.closed ? [...s.v, s.v[0]] : s.v;
  const out: Pt[] = [v[0]];
  for (let k = 1; k < v.length; k++) {
    const a = v[k - 1];
    const b = v[k];
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    if (a.b === 0 || chord === 0) {
      out.push(b);
      continue;
    }
    const theta = 4 * Math.atan(a.b);
    const r = Math.abs(chord / (2 * Math.sin(theta / 2)));
    // Centre on the left of the chord for a counter-clockwise arc below 180°.
    const off = chord / 2 / Math.tan(theta / 2);
    const cx = (a.x + b.x) / 2 - ((b.y - a.y) / chord) * off;
    const cy = (a.y + b.y) / 2 + ((b.x - a.x) / chord) * off;
    const a0 = Math.atan2(a.y - cy, a.x - cx);
    const steps = Math.max(4, Math.ceil(Math.abs(theta) / (Math.PI / 16)));
    for (let j = 1; j < steps; j++) {
      const ang = a0 + (theta * j) / steps;
      out.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
    }
    out.push(b);
  }
  return out;
}

/** Dash pattern applied along a point chain → the visible pieces. */
function dashes(pts: Pt[], pattern: number[]): Pt[][] {
  if (pattern.reduce((a, b) => a + b, 0) <= 0) return [pts];
  const out: Pt[][] = [];
  let idx = 0;
  let left = pattern[0];
  let on = true;
  let piece: Pt[] = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    let a = pts[k - 1];
    const b = pts[k];
    let seg = Math.hypot(b.x - a.x, b.y - a.y);
    while (seg > left) {
      const t = left / seg;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (on) {
        piece.push(p);
        out.push(piece);
      }
      piece = [p];
      seg -= left;
      a = p;
      on = !on;
      idx = (idx + 1) % pattern.length;
      left = pattern[idx];
    }
    left -= seg;
    if (on) piece.push(b);
  }
  if (on && piece.length > 1) out.push(piece);
  return out;
}

// --- PNG (logo) ---------------------------------------------------------------------------------------------------

/** 8-bit RGB / RGBA PNG, not interlaced → RGBA pixels; null for anything else. */
function decodePng(buf: Uint8Array): { w: number; h: number; px: Uint8Array } | null {
  const data = Buffer.from(buf);
  if (data.readUInt32BE(0) !== 0x89504e47) return null;
  let pos = 8;
  let w = 0;
  let h = 0;
  let type = 0;
  const idat: Buffer[] = [];
  while (pos < data.length) {
    const len = data.readUInt32BE(pos);
    const kind = data.toString("ascii", pos + 4, pos + 8);
    const body = data.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      type = body[9];
      if (body[8] !== 8 || (type !== 2 && type !== 6) || body[12] !== 0) return null;
    } else if (kind === "IDAT") idat.push(body);
    else if (kind === "IEND") break;
    pos += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const rows = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? rows[dst + x - bpp] : 0;
      const b = y > 0 ? rows[dst - stride + x] : 0;
      const c = x >= bpp && y > 0 ? rows[dst - stride + x - bpp] : 0;
      let p = 0;
      if (filter === 1) p = a;
      else if (filter === 2) p = b;
      else if (filter === 3) p = (a + b) >> 1;
      else if (filter === 4) {
        const e = a + b - c;
        const [pa, pb, pc] = [Math.abs(e - a), Math.abs(e - b), Math.abs(e - c)];
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      rows[dst + x] = (raw[src + x] + p) & 0xff;
    }
  }
  if (bpp === 4) return { w, h, px: rows };
  const px = new Uint8Array(w * h * 4);
  for (let k = 0; k < w * h; k++) px.set([rows[k * 3], rows[k * 3 + 1], rows[k * 3 + 2], 255], k * 4);
  return { w, h, px };
}

// --- DXF writer ---------------------------------------------------------------------------------------------------

const fmt = (n: number) => (Math.abs(n) < 1e-9 ? "0" : String(Math.round(n * 1e4) / 1e4));

/** Non-ASCII as \U+XXXX, which AutoCAD reads in any code page. */
const dxfText = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^\x20-\x7e]/g, (c) => `\\U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`);

class Writer {
  out: string[] = [];

  g(code: number, value: string | number) {
    this.out.push(String(code), typeof value === "number" ? fmt(value) : value);
  }

  head(type: string, layer: string, color: number) {
    this.g(0, type);
    this.g(8, layer);
    this.g(62, color);
  }

  polyline(v: Vtx[], closed: boolean, layer: string, color: number, width = 0) {
    if (v.length < 2) return;
    if (v.length === 2 && !closed && v[0].b === 0 && width === 0) {
      this.head("LINE", layer, color);
      this.g(10, v[0].x);
      this.g(20, v[0].y);
      this.g(30, 0);
      this.g(11, v[1].x);
      this.g(21, v[1].y);
      this.g(31, 0);
      return;
    }
    this.head("POLYLINE", layer, color);
    this.g(66, 1);
    this.g(10, 0);
    this.g(20, 0);
    this.g(30, 0);
    this.g(70, closed ? 1 : 0);
    if (width > 0) {
      this.g(40, width);
      this.g(41, width);
    }
    for (const p of v) {
      this.g(0, "VERTEX");
      this.g(8, layer);
      this.g(10, p.x);
      this.g(20, p.y);
      this.g(30, 0);
      if (p.b !== 0) this.g(42, p.b);
    }
    this.g(0, "SEQEND");
    this.g(8, layer);
  }

  /** Filled triangle / quad; DXF wants the corners in Z order. */
  solid(p: Pt[], layer: string, color: number) {
    const [a, b, c, d = p[2]] = p;
    this.head("SOLID", layer, color);
    [a, b, d, c].forEach((q, k) => {
      this.g(10 + k, q.x);
      this.g(20 + k, q.y);
      this.g(30 + k, 0);
    });
  }

  circle(c: Pt, r: number, layer: string, color: number) {
    this.head("CIRCLE", layer, color);
    this.g(10, c.x);
    this.g(20, c.y);
    this.g(30, 0);
    this.g(40, r);
  }

  text(p: Pt, height: number, text: string, align: 0 | 1 | 2, rotation: number, bold: boolean, layer: string, color: number) {
    this.head("TEXT", layer, color);
    this.g(10, p.x);
    this.g(20, p.y);
    this.g(30, 0);
    this.g(40, height);
    this.g(1, text);
    if (Math.abs(rotation) > 1e-6) this.g(50, rotation);
    this.g(7, bold ? STYLE_BOLD : STYLE);
    if (align) {
      this.g(72, align);
      this.g(11, p.x);
      this.g(21, p.y);
      this.g(31, 0);
    }
  }

  file(width: number, height: number): string {
    const ents = this.out;
    this.out = [];
    this.g(0, "SECTION");
    this.g(2, "HEADER");
    this.g(9, "$ACADVER");
    this.g(1, "AC1009");
    this.g(9, "$DWGCODEPAGE");
    this.g(3, "ANSI_1252");
    this.g(9, "$INSBASE");
    [10, 20, 30].forEach((c) => this.g(c, 0));
    for (const [name, x, y] of [
      ["$EXTMIN", 0, 0],
      ["$EXTMAX", width, height],
      ["$LIMMIN", 0, 0],
      ["$LIMMAX", width, height],
    ] as const) {
      this.g(9, name);
      this.g(10, x);
      this.g(20, y);
      if (name.startsWith("$EXT")) this.g(30, 0);
    }
    this.g(0, "ENDSEC");
    this.g(0, "SECTION");
    this.g(2, "TABLES");
    this.g(0, "TABLE");
    this.g(2, "STYLE");
    this.g(70, 2);
    for (const [name, font] of [
      [STYLE, "arial.ttf"],
      [STYLE_BOLD, "arialbd.ttf"],
    ]) {
      this.g(0, "STYLE");
      this.g(2, name);
      this.g(70, 0);
      this.g(40, 0);
      this.g(41, 1);
      this.g(50, 0);
      this.g(71, 0);
      this.g(42, 2.5);
      this.g(3, font);
      this.g(4, "");
    }
    this.g(0, "ENDTAB");
    this.g(0, "TABLE");
    this.g(2, "LAYER");
    const layers = [...PARTS.flatMap((p) => [p, `${p}_FLAECHEN`, `${p}_TEXT`]), LAYER_LOGO];
    this.g(70, layers.length);
    for (const name of layers) {
      this.g(0, "LAYER");
      this.g(2, name);
      this.g(70, 0);
      this.g(62, 7);
      this.g(6, "CONTINUOUS");
    }
    this.g(0, "ENDTAB");
    this.g(0, "ENDSEC");
    this.g(0, "SECTION");
    this.g(2, "ENTITIES");
    this.out.push(...ents);
    this.g(0, "ENDSEC");
    this.g(0, "EOF");
    return this.out.join("\r\n") + "\r\n";
  }
}

// --- Element tree walk --------------------------------------------------------------------------------------------

/** Inherited SVG presentation attributes (react-pdf passes them from G to the shapes). */
type Ctx = { m: Matrix; fill?: unknown; stroke?: unknown; strokeWidth?: unknown; strokeDasharray?: unknown; layer: string };
type Props = Record<string, unknown> & { children?: ReactNode; style?: Record<string, unknown> };

const num = (v: unknown, fallback = 0) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : fallback);

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<Props>(node)) return textOf(node.props.children);
  return "";
}

class Converter {
  w = new Writer();
  sheet = { w: 0, h: 0 };

  /** Sheet point [pt, Y down] → DXF [mm, Y up]. */
  out(m: Matrix, p: Pt): Pt {
    const x = m[0] * p.x + m[2] * p.y + m[4];
    const y = m[1] * p.x + m[3] * p.y + m[5];
    return { x: x * MM, y: (this.sheet.h - y) * MM };
  }

  walk(node: ReactNode, ctx: Ctx) {
    if (Array.isArray(node)) {
      node.forEach((n) => this.walk(n, ctx));
      return;
    }
    if (!isValidElement<Props>(node)) return;
    const { type, props } = node;
    if (typeof type === "function") {
      // The legend and the title block (Plankopf) on their own layers.
      const layer = type === Legend ? "LEGENDE" : type === TitleBlock ? "PLANKOPF" : ctx.layer;
      this.walk((type as (p: Props) => ReactNode)(props), { ...ctx, layer });
      return;
    }
    if ((type as unknown) === Fragment) {
      this.walk(props.children, ctx);
      return;
    }
    const inherit = (extra: Partial<Ctx> = {}): Ctx => ({
      ...ctx,
      fill: props.fill ?? ctx.fill,
      stroke: props.stroke ?? ctx.stroke,
      strokeWidth: props.strokeWidth ?? ctx.strokeWidth,
      strokeDasharray: props.strokeDasharray ?? ctx.strokeDasharray,
      ...extra,
    });
    switch (type) {
      case "DOCUMENT":
      case "VIEW":
        this.walk(props.children, ctx);
        break;
      case "PAGE": {
        // One sheet: the first page only.
        if (this.sheet.h) break;
        const size = props.size as [number, number];
        this.sheet = { w: size[0], h: size[1] };
        this.walk(props.children, ctx);
        break;
      }
      case "SVG": {
        const style = props.style ?? {};
        const width = num(props.width, this.sheet.w);
        const height = num(props.height, this.sheet.h);
        const [vx, vy, vw, vh] = typeof props.viewBox === "string" ? nums(props.viewBox) : [0, 0, width, height];
        let m = mul(ctx.m, [1, 0, 0, 1, num(style.left), num(style.top)]);
        m = mul(m, [width / (vw || width), 0, 0, height / (vh || height), -vx * (width / (vw || width)), -vy * (height / (vh || height))]);
        // Shapes right in the Svg are the frame; its groups hold the schema.
        this.walk(props.children, { m, layer: "RAHMEN" });
        break;
      }
      case "G":
        this.walk(props.children, inherit({ m: mul(ctx.m, parseTransform(props.transform)), layer: ctx.layer === "RAHMEN" ? "SCHEMA" : ctx.layer }));
        break;
      case "TEXT":
        this.text(props, inherit());
        break;
      case "IMAGE":
        this.image(props);
        break;
      case "RECT":
      case "LINE":
      case "CIRCLE":
      case "ELLIPSE":
      case "PATH":
      case "POLYGON":
      case "POLYLINE":
        this.shape(type, props, inherit({ m: mul(ctx.m, parseTransform(props.transform)) }));
        break;
    }
  }

  shape(type: string, props: Props, ctx: Ctx) {
    const { m } = ctx;
    const det = m[0] * m[3] - m[1] * m[2];
    const scale = Math.sqrt(Math.abs(det)) || 1;
    // Bulges keep their sign: the Y flip keeps the sense of turning as seen on the sheet.
    const mirror = det < 0 ? -1 : 1;
    const tv = (p: Vtx): Vtx => ({ ...this.out(m, p), b: p.b * mirror });
    const fill = rgb(ctx.fill);
    const stroke = rgb(ctx.stroke);
    const sw = num(ctx.strokeWidth, 1) * scale; // pt on the sheet
    const dash = typeof ctx.strokeDasharray === "string" ? nums(ctx.strokeDasharray).map((n) => n * scale * MM) : [];
    const layer = ctx.layer;

    const outline = (subs: Sub[]) => {
      if (!stroke || isPaper(stroke) || sw <= 0) return;
      const color = aci(stroke);
      const width = sw >= WIDE ? sw * MM : 0;
      for (const s of subs) {
        const v = s.v.map(tv);
        if (dash.some((n) => n > 0))
          for (const piece of dashes(flatten({ v, closed: s.closed }), dash.length % 2 ? [...dash, ...dash] : dash))
            this.w.polyline(
              piece.map((p) => ({ ...p, b: 0 })),
              false,
              layer,
              color,
              width,
            );
        else this.w.polyline(v, s.closed, layer, color, width);
      }
    };
    const area = (subs: Sub[]) => {
      if (!fill || isPaper(fill)) return;
      const color = aci(fill);
      for (const s of subs) {
        const v = s.v.map(tv);
        if (!isLight(fill) && v.length >= 3 && v.length <= 4 && v.every((p) => p.b === 0)) this.w.solid(v, `${layer}_FLAECHEN`, color);
        // Larger, rounded or very light shapes: outline in the fill colour (DXF R12 has no hatch entity).
        else if (!stroke || isPaper(stroke)) this.w.polyline(v, true, `${layer}_FLAECHEN`, color);
      }
    };
    const poly = (pts: Pt[], closed: boolean): Sub[] => [{ v: pts.map((p) => ({ ...p, b: 0 })), closed }];

    switch (type) {
      case "LINE":
        outline(
          poly(
            [
              { x: num(props.x1), y: num(props.y1) },
              { x: num(props.x2), y: num(props.y2) },
            ],
            false,
          ),
        );
        break;
      case "RECT": {
        const [x, y, w, h] = [num(props.x), num(props.y), num(props.width), num(props.height)];
        if (w <= 0 || h <= 0) break;
        const rad = Math.min(num(props.rx, num(props.ry)), w / 2, h / 2);
        const k = -Math.tan(Math.PI / 8);
        const subs: Sub[] =
          rad > 0.01
            ? [
                {
                  v: [
                    { x: x + rad, y, b: 0 },
                    { x: x + w - rad, y, b: k },
                    { x: x + w, y: y + rad, b: 0 },
                    { x: x + w, y: y + h - rad, b: k },
                    { x: x + w - rad, y: y + h, b: 0 },
                    { x: x + rad, y: y + h, b: k },
                    { x, y: y + h - rad, b: 0 },
                    { x, y: y + rad, b: k },
                  ],
                  closed: true,
                },
              ]
            : poly(
                [
                  { x, y },
                  { x: x + w, y },
                  { x: x + w, y: y + h },
                  { x, y: y + h },
                ],
                true,
              );
        area(subs);
        outline(subs);
        break;
      }
      case "CIRCLE":
      case "ELLIPSE": {
        const [cx, cy] = [num(props.cx), num(props.cy)];
        const r = type === "CIRCLE" ? num(props.r) : (num(props.rx) + num(props.ry)) / 2;
        if (r <= 0) break;
        const centre = this.out(m, { x: cx, y: cy });
        const R = r * scale * MM;
        // Filled: a donut (closed polyline of two half circles, as wide as the radius).
        if (fill && !isPaper(fill))
          this.w.polyline(
            [
              { x: centre.x - R / 2, y: centre.y, b: 1 },
              { x: centre.x + R / 2, y: centre.y, b: 1 },
            ],
            true,
            `${layer}_FLAECHEN`,
            aci(fill),
            R,
          );
        if (stroke && !isPaper(stroke) && sw > 0) {
          if (dash.length || sw >= WIDE)
            outline([
              {
                v: [
                  { x: cx - r, y: cy, b: 1 },
                  { x: cx + r, y: cy, b: 1 },
                ],
                closed: true,
              },
            ]);
          else this.w.circle(centre, R, layer, aci(stroke));
        }
        break;
      }
      case "PATH": {
        const subs = parsePath(typeof props.d === "string" ? props.d : "");
        area(subs);
        outline(subs);
        break;
      }
      case "POLYGON":
      case "POLYLINE": {
        const n = nums(typeof props.points === "string" ? props.points : "");
        const pts: Pt[] = [];
        for (let k = 0; k + 1 < n.length; k += 2) pts.push({ x: n[k], y: n[k + 1] });
        const subs = poly(pts, type === "POLYGON");
        area(subs);
        outline(subs);
        break;
      }
    }
  }

  text(props: Props, ctx: Ctx) {
    const text = dxfText(textOf(props.children));
    // Texts without fill are black in react-pdf.
    const color = ctx.fill === undefined ? [0, 0, 0] : rgb(ctx.fill);
    if (!text || !color || isPaper(color as Rgb)) return;
    const { m } = ctx;
    const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
    const style = props.style ?? {};
    const size = num(style.fontSize ?? props.fontSize, 12);
    const anchor = props.textAnchor;
    const rotation = (-Math.atan2(m[1], m[0]) * 180) / Math.PI;
    this.w.text(
      this.out(m, { x: num(props.x), y: num(props.y) }),
      size * scale * MM * CAP,
      text,
      anchor === "middle" ? 1 : anchor === "end" ? 2 : 0,
      rotation,
      String(style.fontFamily ?? props.fontFamily ?? "").includes("Bold"),
      `${ctx.layer}_TEXT`,
      aci(color as Rgb),
    );
  }

  /** The logo (PNG, positioned like react-pdf: absolute box, objectFit contain, objectPosition left) as SOLIDs. */
  image(props: Props) {
    const src = props.src as { data?: Uint8Array } | undefined;
    const style = props.style ?? {};
    if (!src?.data) return;
    const png = decodePng(src.data);
    if (!png) return;
    const [left, top, bw, bh] = [num(style.left), num(style.top), num(style.width), num(style.height)];
    const s = style.objectFit === "contain" ? Math.min(bw / png.w, bh / png.h) : bw / png.w;
    const sy = style.objectFit === "contain" ? s : bh / png.h;
    const y0 = top + (bh - png.h * sy) / 2;
    // Cells of `step` pixels (≈ 0.15 mm), coloured by their opaque pixels; runs of one colour joined to rectangles.
    const step = Math.max(1, Math.round(0.4 / s));
    const cols = Math.ceil(png.w / step);
    const rows = Math.ceil(png.h / step);
    const shade = (cx: number, cy: number): Rgb | null => {
      let [r, g, b, a, n] = [0, 0, 0, 0, 0];
      for (let y = cy * step; y < Math.min(png.h, (cy + 1) * step); y++)
        for (let x = cx * step; x < Math.min(png.w, (cx + 1) * step); x++) {
          const k = (y * png.w + x) * 4;
          const alpha = png.px[k + 3] / 255;
          r += png.px[k] * alpha;
          g += png.px[k + 1] * alpha;
          b += png.px[k + 2] * alpha;
          a += alpha;
          n++;
        }
      if (a / n < 0.5) return null;
      const c: Rgb = [r / a, g / a, b / a].map(Math.round) as Rgb;
      return isLight(c) ? null : c;
    };
    const shades = Array.from({ length: rows }, (_, cy) => Array.from({ length: cols }, (_, cx) => shade(cx, cy)));
    // The main colours of the logo (each at least 3 % of its area); edge shades go to the nearest of them.
    const count = new Map<number, { n: number; sum: Rgb }>();
    for (const c of shades.flat()) {
      if (!c) continue;
      const e = count.get(aci(c)) ?? { n: 0, sum: [0, 0, 0] };
      e.n++;
      e.sum = e.sum.map((v, k) => v + c[k]) as Rgb;
      count.set(aci(c), e);
    }
    const total = [...count.values()].reduce((s, e) => s + e.n, 0);
    const main = [...count].filter(([, e]) => e.n >= total * 0.03).map(([color, e]) => ({ color, rgb: e.sum.map((v) => v / e.n) }));
    const colors = shades.map((row) =>
      row.map((c) => {
        if (!c) return 0;
        if (!main.length) return aci(c);
        return main.reduce((best, m) => (m.rgb.reduce((d, v, k) => d + (v - c[k]) ** 2, 0) < best.rgb.reduce((d, v, k) => d + (v - c[k]) ** 2, 0) ? m : best)).color;
      }),
    );
    const cell = (cx: number, cy: number) => colors[cy][cx];
    type Open = { x0: number; x1: number; y0: number; y1: number; color: number };
    let open = new Map<string, Open>();
    const emit = (o: Open) => {
      const id: Matrix = IDENTITY;
      const p = (x: number, y: number) => this.out(id, { x: left + Math.min(x * step, png.w) * s, y: y0 + Math.min(y * step, png.h) * sy });
      this.w.solid([p(o.x0, o.y0), p(o.x1, o.y0), p(o.x1, o.y1), p(o.x0, o.y1)], LAYER_LOGO, o.color);
    };
    for (let cy = 0; cy <= rows; cy++) {
      const next = new Map<string, Open>();
      if (cy < rows) {
        let cx = 0;
        while (cx < cols) {
          const color = cell(cx, cy);
          let end = cx + 1;
          while (end < cols && cell(end, cy) === color) end++;
          if (color) {
            const key = `${cx}-${end}-${color}`;
            const prev = open.get(key);
            if (prev) {
              prev.y1 = cy + 1;
              open.delete(key);
              next.set(key, prev);
            } else next.set(key, { x0: cx, x1: end, y0: cy, y1: cy + 1, color });
          }
          cx = end;
        }
      }
      open.forEach(emit);
      open = next;
    }
  }
}

/** DXF of a react-pdf plan document (one page). */
export function documentToDxf(doc: ReactElement): string {
  const c = new Converter();
  c.walk(doc, { m: IDENTITY, layer: "RAHMEN" });
  return c.w.file(c.sheet.w * MM, c.sheet.h * MM);
}
