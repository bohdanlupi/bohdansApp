/**
 * Export of a rendered schema SVG as DXF (R12, ASCII), which AutoCAD / BricsCAD open directly and can save as DWG.
 * Works on the live DOM, so the CSS colours and sizes are resolved as on screen: lines and paths become POLYLINEs
 * (arcs as bulges, dashes as separate segments), filled shapes SOLIDs or wide POLYLINEs, texts TEXT entities.
 * One drawing unit is one schema unit; Y points up. Elements inside [data-dxf="skip"] (e.g. selection marks) are left out.
 */

type Pt = { x: number; y: number };
/** Polyline vertex; bulge = tan(angle / 4) of the arc to the next vertex, negative = clockwise as seen. */
type Vtx = Pt & { b: number };
type Sub = { v: Vtx[]; closed: boolean };
type Rgb = [number, number, number];

const LAYER_LINES = "SCHEMA_LINIEN";
const LAYER_FILLS = "SCHEMA_FLAECHEN";
const LAYER_TEXT = "SCHEMA_TEXT";
/** Strokes from this width on get a polyline width (insulation bands); thinner ones stay hairlines. */
const WIDE = 4;

// --- AutoCAD colour index -----------------------------------------------------------------------------------------

const hsv = (h: number, s: number, v: number): Rgb => {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
};

/** Approximate RGB of the ACI colours 1–254 (7 = black / white is set apart, 255 is white on paper). */
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

function aci([r, g, b]: Rgb): number {
  const key = `${r},${g},${b}`;
  const hit = aciCache.get(key);
  if (hit !== undefined) return hit;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Ink in light and dark mode (near black / near white, unsaturated) → 7, black on paper.
  let best = 7;
  if (!(max - min < 30 && (max < 60 || min > 225))) {
    let dist = Infinity;
    for (const [i, [cr, cg, cb]] of aciTable) {
      const d = 0.3 * (r - cr) ** 2 + 0.59 * (g - cg) ** 2 + 0.11 * (b - cb) ** 2;
      if (d < dist) [dist, best] = [d, i];
    }
  }
  aciCache.set(key, best);
  return best;
}

/** Computed CSS colour (rgb / rgba / color(srgb …)) → RGB, or null when none or (nearly) transparent. */
function parseColor(css: string): Rgb | null {
  if (!css || css === "none" || css === "transparent") return null;
  const srgb = css.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?/);
  if (srgb) {
    if (srgb[4] !== undefined && alpha(srgb[4]) < 0.15) return null;
    return [srgb[1], srgb[2], srgb[3]].map((n) => Math.round(Number(n) * 255)) as Rgb;
  }
  const m = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/);
  if (!m) return null;
  if (m[4] !== undefined && alpha(m[4]) < 0.15) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])].map(Math.round) as Rgb;
}

const alpha = (s: string) => (s.endsWith("%") ? Number(s.slice(0, -1)) / 100 : Number(s));

// --- Geometry -----------------------------------------------------------------------------------------------------

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
    const n = 12;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
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
          if (s.v.length > 1 && last.b === 0 && Math.hypot(last.x - start.x, last.y - start.y) < 1e-9) s.v.pop();
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

function parsePoints(points: string): Pt[] {
  const n = (points.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  const out: Pt[] = [];
  for (let k = 0; k + 1 < n.length; k += 2) out.push({ x: n[k], y: n[k + 1] });
  return out;
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
  const total = pattern.reduce((a, b) => a + b, 0);
  if (total <= 0) return [pts];
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
  min: Pt = { x: Infinity, y: Infinity };
  max: Pt = { x: -Infinity, y: -Infinity };

  g(code: number, value: string | number) {
    this.out.push(String(code), typeof value === "number" ? fmt(value) : value);
  }

  ext(p: Pt) {
    this.min = { x: Math.min(this.min.x, p.x), y: Math.min(this.min.y, p.y) };
    this.max = { x: Math.max(this.max.x, p.x), y: Math.max(this.max.y, p.y) };
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
      v.forEach((p) => this.ext(p));
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
      this.ext(p);
    }
    this.g(0, "SEQEND");
    this.g(8, layer);
  }

  /** Filled triangle / quad; DXF wants the corners in Z order. */
  solid(p: Pt[], color: number) {
    const [a, b, c, d = p[2]] = p;
    this.head("SOLID", LAYER_FILLS, color);
    [a, b, d, c].forEach((q, k) => {
      this.g(10 + k, q.x);
      this.g(20 + k, q.y);
      this.g(30 + k, 0);
      this.ext(q);
    });
  }

  circle(c: Pt, r: number, color: number) {
    this.head("CIRCLE", LAYER_LINES, color);
    this.g(10, c.x);
    this.g(20, c.y);
    this.g(30, 0);
    this.g(40, r);
    this.ext({ x: c.x - r, y: c.y - r });
    this.ext({ x: c.x + r, y: c.y + r });
  }

  text(p: Pt, height: number, text: string, align: 0 | 1 | 2, color: number) {
    this.head("TEXT", LAYER_TEXT, color);
    this.g(10, p.x);
    this.g(20, p.y);
    this.g(30, 0);
    this.g(40, height);
    this.g(1, text);
    if (align) {
      this.g(72, align);
      this.g(11, p.x);
      this.g(21, p.y);
      this.g(31, 0);
    }
    this.ext(p);
  }

  file(): string {
    const ents = this.out;
    this.out = [];
    const min = Number.isFinite(this.min.x) ? this.min : { x: 0, y: 0 };
    const max = Number.isFinite(this.max.x) ? this.max : { x: 0, y: 0 };
    this.g(0, "SECTION");
    this.g(2, "HEADER");
    this.g(9, "$ACADVER");
    this.g(1, "AC1009");
    this.g(9, "$DWGCODEPAGE");
    this.g(3, "ANSI_1252");
    this.g(9, "$INSBASE");
    [10, 20, 30].forEach((c) => this.g(c, 0));
    this.g(9, "$EXTMIN");
    this.g(10, min.x);
    this.g(20, min.y);
    this.g(30, 0);
    this.g(9, "$EXTMAX");
    this.g(10, max.x);
    this.g(20, max.y);
    this.g(30, 0);
    this.g(0, "ENDSEC");
    this.g(0, "SECTION");
    this.g(2, "ENTITIES");
    this.out.push(...ents);
    this.g(0, "ENDSEC");
    this.g(0, "EOF");
    return this.out.join("\r\n") + "\r\n";
  }
}

// --- SVG walk -----------------------------------------------------------------------------------------------------

/** DXF document of the drawing in an SVG element as rendered. */
export function svgToDxf(svg: SVGSVGElement): string {
  const w = new Writer();
  const root = svg.getScreenCTM();
  if (!root) return w.file();
  const rootInv = root.inverse();
  const height = svg.viewBox.baseVal?.height || svg.getBBox().height;
  const background = parseColor(getComputedStyle(document.body).backgroundColor);
  const same = (a: Rgb | null, b: Rgb | null) => !!a && !!b && a.every((v, k) => Math.abs(v - b[k]) < 4);

  const elements = svg.querySelectorAll<SVGGraphicsElement>("line, rect, circle, ellipse, path, polygon, polyline, text");
  for (const el of elements) {
    if (el.closest('[data-dxf="skip"]')) continue;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
    const screen = el.getScreenCTM();
    if (!screen) continue;
    const m = rootInv.multiply(screen);
    const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
    const mirror = m.a * m.d - m.b * m.c < 0 ? -1 : 1;
    // Local → schema units, Y up.
    const tp = (p: Pt): Pt => ({ x: m.a * p.x + m.c * p.y + m.e, y: height - (m.b * p.x + m.d * p.y + m.f) });
    // Bulges keep their sign: the Y flip keeps the sense of turning as seen on screen.
    const tv = (p: Vtx): Vtx => ({ ...tp(p), b: p.b * mirror });

    const stroke = parseColor(style.stroke);
    const fillRaw = parseColor(style.fill);
    // Fills in the page background only mask lines below them on screen; on paper they are left out.
    const fill = same(fillRaw, background) ? null : fillRaw;
    const sw = (parseFloat(style.strokeWidth) || 0) * scale;
    const dash = style.strokeDasharray === "none" ? [] : (style.strokeDasharray.match(/[\d.]+/g) ?? []).map((n) => Number(n) * scale);

    const outline = (subs: Sub[]) => {
      if (!stroke || sw === 0) return;
      const color = aci(stroke);
      const width = sw >= WIDE ? sw : 0;
      for (const s of subs) {
        const v = s.v.map(tv);
        if (dash.length && dash.some((n) => n > 0)) {
          for (const piece of dashes(flatten({ v, closed: s.closed }), dash.length % 2 ? [...dash, ...dash] : dash))
            w.polyline(
              piece.map((p) => ({ ...p, b: 0 })),
              false,
              LAYER_LINES,
              color,
              width,
            );
        } else w.polyline(v, s.closed, LAYER_LINES, color, width);
      }
    };
    const area = (subs: Sub[]) => {
      if (!fill) return;
      const color = aci(fill);
      for (const s of subs) {
        const v = s.v.map(tv);
        if (v.length >= 3 && v.length <= 4 && v.every((p) => p.b === 0)) w.solid(v, color);
        // Larger or rounded shapes: outline in the fill colour (DXF R12 has no hatch entity).
        else if (!stroke) w.polyline(v, true, LAYER_FILLS, color);
      }
    };
    const poly = (pts: Pt[], closed: boolean): Sub[] => [{ v: pts.map((p) => ({ ...p, b: 0 })), closed }];

    switch (el.tagName.toLowerCase()) {
      case "line": {
        const l = el as SVGLineElement;
        outline(
          poly(
            [
              { x: l.x1.baseVal.value, y: l.y1.baseVal.value },
              { x: l.x2.baseVal.value, y: l.y2.baseVal.value },
            ],
            false,
          ),
        );
        break;
      }
      case "rect": {
        const r = el as SVGRectElement;
        const [x, y, rw, rh] = [r.x.baseVal.value, r.y.baseVal.value, r.width.baseVal.value, r.height.baseVal.value];
        if (rw <= 0 || rh <= 0) break;
        const rad = Math.min(r.rx.baseVal.value || r.ry.baseVal.value, rw / 2, rh / 2);
        const k = -Math.tan(Math.PI / 8);
        const subs: Sub[] =
          rad > 0.01
            ? [
                {
                  v: [
                    { x: x + rad, y, b: 0 },
                    { x: x + rw - rad, y, b: k },
                    { x: x + rw, y: y + rad, b: 0 },
                    { x: x + rw, y: y + rh - rad, b: k },
                    { x: x + rw - rad, y: y + rh, b: 0 },
                    { x: x + rad, y: y + rh, b: k },
                    { x, y: y + rh - rad, b: 0 },
                    { x, y: y + rad, b: k },
                  ],
                  closed: true,
                },
              ]
            : poly(
                [
                  { x, y },
                  { x: x + rw, y },
                  { x: x + rw, y: y + rh },
                  { x, y: y + rh },
                ],
                true,
              );
        area(subs);
        outline(subs);
        break;
      }
      case "circle":
      case "ellipse": {
        const c = el as SVGCircleElement & SVGEllipseElement;
        const centre = tp({ x: c.cx.baseVal.value, y: c.cy.baseVal.value });
        const r = (el.tagName.toLowerCase() === "circle" ? c.r.baseVal.value : (c.rx.baseVal.value + c.ry.baseVal.value) / 2) * scale;
        if (r <= 0) break;
        // Filled: a donut (closed polyline of two half circles, as wide as the radius).
        if (fill)
          w.polyline(
            [
              { x: centre.x - r / 2, y: centre.y, b: 1 },
              { x: centre.x + r / 2, y: centre.y, b: 1 },
            ],
            true,
            LAYER_FILLS,
            aci(fill),
            r,
          );
        if (stroke && sw > 0) {
          if (dash.length || sw >= WIDE)
            outline([
              {
                v: [
                  { x: c.cx.baseVal.value - r / scale, y: c.cy.baseVal.value, b: 1 },
                  { x: c.cx.baseVal.value + r / scale, y: c.cy.baseVal.value, b: 1 },
                ],
                closed: true,
              },
            ]);
          else w.circle(centre, r, aci(stroke));
        }
        break;
      }
      case "path": {
        const subs = parsePath(el.getAttribute("d") ?? "");
        area(subs);
        outline(subs);
        break;
      }
      case "polygon":
      case "polyline": {
        const subs = poly(parsePoints(el.getAttribute("points") ?? ""), el.tagName.toLowerCase() === "polygon");
        area(subs);
        outline(subs);
        break;
      }
      case "text": {
        const t = el as SVGTextElement;
        const text = dxfText(t.textContent ?? "");
        const color = fill ?? stroke;
        if (!text || !color) break;
        const x = t.x.baseVal.numberOfItems ? t.x.baseVal.getItem(0).value : 0;
        const y = t.y.baseVal.numberOfItems ? t.y.baseVal.getItem(0).value : 0;
        const anchor = style.textAnchor;
        // DXF text height is the cap height, about 0.7 of the font size.
        w.text(tp({ x, y }), (parseFloat(style.fontSize) || 10) * scale * 0.7, text, anchor === "middle" ? 1 : anchor === "end" ? 2 : 0, aci(color));
        break;
      }
    }
  }
  return w.file();
}

/** Saves the SVG as a .dxf file. */
export function downloadDxf(svg: SVGSVGElement, name: string) {
  const blob = new Blob([svgToDxf(svg)], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "Prinzipschema"}.dxf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
