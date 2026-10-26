"use client";

import { Compass, Crosshair, DoorOpen, Hexagon, Maximize, MousePointer2, Pentagon, Plus, Ruler, Scaling, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import type { FormMessageKey } from "@/components/form";
import { NativeSelect } from "@/components/form";
import { fmt, NumberField } from "@/components/planning/fields";
import { SaveIndicator } from "@/components/planning/plan-ui";
import { usePlan } from "@/components/planning/use-plan";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { evaluateEnvelope, nearestSegment, orientations8, pointAt, type SegmentEval } from "@/lib/building/envelope";
import { angleDeg, bounds, distance, type Point, pointInPolygon, snapOrthogonal, snapToPoints } from "@/lib/building/geometry";
import { nextRoomNumber, roomMetrics } from "@/lib/building/model";
import {
  type BuildingEnvelope,
  type BuildingModel,
  type BuildingRoom,
  type EnvelopeAdjacency,
  type EnvelopeVertex,
  envelopeAdjacencies,
  newOpening,
  newVertex,
  type Opening,
  type OpeningKind,
  openingKinds,
  type PlanInfo,
  type RoomKind,
  roomKinds,
  storeyHeightOf,
  type UnheatedCase,
  unheatedCaseKeys,
} from "@/lib/building/schema";
import { roomUsages } from "@/lib/building/sia2024-data";
import type { Construction } from "@/lib/heating/heat-load";
import { parseNumber } from "@/lib/number-input";
import { cn } from "@/lib/utils";

import { saveBuildingModel, saveBuildingPlanCalibration } from "../../actions";

type Tool = "select" | "room" | "envelope" | "opening" | "calibrate" | "north" | "origin" | "measure";
type View = { cx: number; cy: number; zoom: number };
type Selection = { type: "room"; id: string } | { type: "segment"; vertexId: string } | null;
type Drag = { kind: "room"; roomId: string; index: number; before: BuildingModel } | { kind: "envelope"; index: number; before: BuildingModel };

const SNAP_PX = 10;
const HIT_PX = 8;
const HANDLE_PX = 5;
const MAX_HISTORY = 50;

const toolIcons = { select: MousePointer2, room: Pentagon, envelope: Hexagon, opening: DoorOpen, calibrate: Scaling, north: Compass, origin: Crosshair, measure: Ruler } as const;

const adjacencyStroke: Record<EnvelopeAdjacency, string> = { outside: "stroke-blue-700", unheated: "stroke-slate-500", ground: "stroke-amber-800" };

/** Fractions of a segment not covered by any match. */
function uncoveredIntervals(matches: { fromT: number; toT: number }[]): [number, number][] {
  const sorted = matches.map((m) => [Math.min(m.fromT, m.toT), Math.max(m.fromT, m.toT)] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let cursor = 0;
  for (const [a, b] of sorted) {
    if (a > cursor + 1e-6) out.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < 1 - 1e-6) out.push([cursor, 1]);
  return out;
}

/**
 * Tracing editor of one Geschoss: the plan snapshot as background, rooms as polygons along the inner wall faces, the
 * thermal envelope as one polygon along the external face with construction / adjacency / openings per segment, scale
 * calibration (two points + distance) and north arrow. Rooms and envelope are autosaved with the model; the calibration
 * is saved on the plan row. The envelope ↔ room matching (envelope.ts) is shown live.
 */
export function PlanEditor({
  projectId,
  floorKey,
  initial,
  plan: initialPlan,
  imageUrl,
  catalog,
  editable,
}: {
  projectId: string;
  floorKey: string;
  initial: BuildingModel;
  plan: PlanInfo;
  imageUrl: string;
  catalog: Construction[];
  editable: boolean;
}) {
  const t = useTranslations("building.editor");
  const tu = useTranslations("building.unheated");
  const tForms = useTranslations("forms");
  const { plan: model, update, status } = usePlan(projectId, initial, editable, saveBuildingModel);
  const [plan, setPlan] = useState(initialPlan);
  const floor = model.floors.find((f) => f.key === floorKey) ?? null;
  const rooms = useMemo(() => model.rooms.filter((r) => r.floor === floorKey), [model.rooms, floorKey]);
  const envelope = useMemo(() => model.envelopes.find((e) => e.floor === floorKey) ?? null, [model.envelopes, floorKey]);
  const segments = useMemo(() => evaluateEnvelope(envelope, rooms, floor, plan), [envelope, rooms, floor, plan]);
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  // --- view -------------------------------------------------------------------------------------------------------
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [view, setView] = useState<View>({ cx: plan.width / 2, cy: plan.height / 2, zoom: 0.1 });
  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const zoom = Math.min(el.clientWidth / plan.width, el.clientHeight / plan.height) * 0.95;
    setView({ cx: plan.width / 2, cy: plan.height / 2, zoom });
  }, [plan.width, plan.height]);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    fit();
    return () => observer.disconnect();
  }, [fit]);
  const vw = size.width / view.zoom;
  const vh = size.height / view.zoom;
  const viewBox = `${view.cx - vw / 2} ${view.cy - vh / 2} ${vw} ${vh}`;
  const px = (screenPx: number) => screenPx / view.zoom; // screen px → snapshot px

  // Wheel zoom around the cursor (native listener: React's onWheel is passive).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toPlanPoint(svg, e.clientX, e.clientY);
      setView((v) => {
        const zoom = Math.min(20, Math.max(0.01, v.zoom * Math.exp(-e.deltaY * 0.0015)));
        const k = v.zoom / zoom;
        return { cx: p[0] - (p[0] - v.cx) * k, cy: p[1] - (p[1] - v.cy) * k, zoom };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // --- tools / drafts ---------------------------------------------------------------------------------------------
  const [tool, setToolState] = useState<Tool>("select");
  const [draft, setDraft] = useState<Point[]>([]);
  const [hover, setHover] = useState<Point | null>(null);
  const [ortho, setOrtho] = useState(true);
  const [selection, setSelection] = useState<Selection>(null);
  const [openingStart, setOpeningStart] = useState<{ vertexId: string; t: number } | null>(null);
  const [calibrating, setCalibrating] = useState<{ points: [Point, Point] } | null>(null);
  const [distanceText, setDistanceText] = useState("");
  const [pending, startTransition] = useTransition();
  const pan = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const [history, setHistory] = useState<BuildingModel[]>([]);
  const shift = useRef(false);

  const setTool = (next: Tool) => {
    setToolState(next);
    setDraft([]);
    setHover(null);
    setOpeningStart(null);
  };

  const remember = (state: BuildingModel) => setHistory((h) => [...h.slice(-MAX_HISTORY + 1), state]);
  const commit = (change: (m: BuildingModel) => BuildingModel) => {
    remember(model);
    update(change);
  };
  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    update(() => prev);
  };

  const roomVertices = useMemo(() => rooms.flatMap((r) => r.polygon as Point[]), [rooms]);
  const envelopeVertices = useMemo(() => (envelope?.vertices.map((v) => v.p) ?? []) as Point[], [envelope]);
  const snap = (p: Point, last?: Point | null): Point => {
    const near = snapToPoints(p, [...roomVertices, ...envelopeVertices], px(SNAP_PX));
    if (near) return near;
    return last && ortho !== shift.current ? snapOrthogonal(last, p) : p;
  };
  const r1 = (p: Point): [number, number] => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];

  const selectedRoom = selection?.type === "room" ? (roomById.get(selection.id) ?? null) : null;
  const metrics = selectedRoom ? roomMetrics(selectedRoom, floor, plan) : null;
  const selectedSegment = selection?.type === "segment" ? (segments.find((s) => s.vertex.id === selection.vertexId) ?? null) : null;

  // --- rooms -------------------------------------------------------------------------------------------------------
  /** What the plan's text layer says inside a polygon: a room name and a printed area (BF / NGF / HNF … in m²). */
  const suggestionFor = (polygon: readonly Point[]): { name: string | null; area: number | null; areaLabel: string | null } => {
    const inside = plan.labels.filter((l) => pointInPolygon([l.x, l.y], polygon)).sort((a, b) => a.y - b.y || a.x - b.x);
    const text = inside.map((l) => l.text).join(" ");
    const area = /\b(BF|NGF|HNF|NF|GF)\s*:?\s*(\d+(?:[.,]\d+)?)\s*m/i.exec(text);
    const name = inside.map((l) => l.text).find((s) => /[A-Za-zÄÖÜäöüéè]{3,}/.test(s) && !/^(BF|NGF|HNF|NF|FF|GF|m²|m2)\b/i.test(s) && !/\d+(?:[.,]\d+)?\s*m/.test(s) && !/^\d/.test(s)) ?? null;
    return { name, area: area ? Number(area[2].replace(",", ".")) : null, areaLabel: area ? area[1].toUpperCase() : null };
  };

  const addRoom = (polygon: Point[]) => {
    const suggestion = suggestionFor(polygon);
    const room: BuildingRoom = {
      id: crypto.randomUUID(),
      number: nextRoomNumber(model.rooms, floor),
      name: suggestion.name ?? "",
      floor: floorKey,
      polygon: polygon.map(r1),
      kind: "heated",
      thetaInt: 20,
      height: null,
      zoneId: model.zones.length === 1 ? model.zones[0].id : null,
      unheatedCase: "cellarAbove",
      unheatedInsulated: false,
      usage: null,
    };
    commit((m) => ({ ...m, rooms: [...m.rooms, room] }));
    setSelection({ type: "room", id: room.id });
  };
  const setRoom = (id: string, patch: Partial<BuildingRoom>) => update((m) => ({ ...m, rooms: m.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const deleteRoom = (id: string) => {
    commit((m) => ({ ...m, rooms: m.rooms.filter((r) => r.id !== id) }));
    setSelection(null);
  };

  // --- envelope ----------------------------------------------------------------------------------------------------
  const addEnvelope = (polygon: Point[]) => {
    const env: BuildingEnvelope = { id: crypto.randomUUID(), floor: floorKey, vertices: polygon.map((p) => newVertex(r1(p))) };
    commit((m) => ({ ...m, envelopes: [...m.envelopes.filter((e) => e.floor !== floorKey), env] }));
    setSelection({ type: "segment", vertexId: env.vertices[0].id });
  };
  const setEnvelope = (change: (vertices: EnvelopeVertex[]) => EnvelopeVertex[], withHistory = false) =>
    (withHistory ? commit : update)((m) => ({ ...m, envelopes: m.envelopes.map((e) => (e.floor === floorKey ? { ...e, vertices: change(e.vertices) } : e)) }));
  const setVertex = (id: string, patch: Partial<EnvelopeVertex>) => setEnvelope((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const deleteEnvelope = () => {
    commit((m) => ({ ...m, envelopes: m.envelopes.filter((e) => e.floor !== floorKey) }));
    setSelection(null);
  };
  const insertVertex = (afterIndex: number, p: Point) => {
    const like = envelope?.vertices[afterIndex];
    const v = newVertex(r1(p), like);
    setEnvelope((vs) => [...vs.slice(0, afterIndex + 1), v, ...vs.slice(afterIndex + 1)], true);
    setSelection({ type: "segment", vertexId: v.id });
  };
  const removeVertex = (id: string) => {
    if (!envelope || envelope.vertices.length <= 3) return;
    setEnvelope((vs) => vs.filter((v) => v.id !== id), true);
    setSelection(null);
  };
  const setOpening = (vertexId: string, openingId: string, patch: Partial<Opening>) =>
    setVertex(vertexId, { openings: envelope!.vertices.find((v) => v.id === vertexId)!.openings.map((o) => (o.id === openingId ? { ...o, ...patch } : o)) });
  const addOpening = (vertexId: string, at: number, width: number | null) => {
    const v = envelope?.vertices.find((x) => x.id === vertexId);
    if (!v) return;
    const opening = newOpening(at, width, catalog.find((c) => /fenster|window|fen[êe]tre|finestr/i.test(c.name))?.id ?? null);
    setEnvelope((vs) => vs.map((x) => (x.id === vertexId ? { ...x, openings: [...x.openings, opening] } : x)), true);
    setSelection({ type: "segment", vertexId });
  };
  const removeOpening = (vertexId: string, openingId: string) => setEnvelope((vs) => vs.map((x) => (x.id === vertexId ? { ...x, openings: x.openings.filter((o) => o.id !== openingId) } : x)), true);

  const finishDraft = () => {
    // A double-click adds its second click as a duplicate vertex – drop repeated points.
    const points = draft.filter((p, i) => i === 0 || distance(p, draft[i - 1]) > px(2));
    if (points.length >= 3) (tool === "envelope" ? addEnvelope : addRoom)(points);
    setDraft([]);
  };

  // --- pointer events ---------------------------------------------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current!;
    svg.focus();
    const raw = toPlanPoint(svg, e.clientX, e.clientY);
    const panStart = () => {
      pan.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
      svg.setPointerCapture(e.pointerId);
    };
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) return panStart();
    if (e.button !== 0) return;

    if (tool === "select") {
      const seg = nearestSegment(segments, raw, px(HIT_PX));
      if (seg) return setSelection({ type: "segment", vertexId: seg.segment.vertex.id });
      const hit = [...rooms].reverse().find((r) => pointInPolygon(raw, r.polygon));
      setSelection(hit ? { type: "room", id: hit.id } : null);
      if (!hit) panStart();
      return;
    }
    if (!editable && tool !== "measure") return;
    if (tool === "origin") {
      const p = snap(raw);
      saveCalibration({ originX: Math.round(p[0] * 10) / 10, originY: Math.round(p[1] * 10) / 10 });
      setTool("select");
      return;
    }
    if (tool === "opening") {
      const seg = nearestSegment(segments, raw, px(HIT_PX * 1.5));
      if (!seg) return;
      if (!openingStart || openingStart.vertexId !== seg.segment.vertex.id) return setOpeningStart({ vertexId: seg.segment.vertex.id, t: seg.t });
      const at = Math.min(openingStart.t, seg.t);
      const width = seg.segment.length === null ? null : Math.round(Math.abs(seg.t - openingStart.t) * seg.segment.length * 100) / 100;
      addOpening(seg.segment.vertex.id, at, width && width >= 0.1 ? width : null);
      setOpeningStart(null);
      return;
    }
    const p = snap(raw, draft.at(-1));
    if (tool === "room" || tool === "envelope") {
      if (draft.length >= 3 && distance(p, draft[0]) <= px(SNAP_PX)) return finishDraft();
      setDraft((d) => [...d, p]);
      return;
    }
    if (tool === "calibrate" || tool === "north" || tool === "measure") {
      if (draft.length === 0) return setDraft([p]);
      const points: [Point, Point] = [draft[0], p];
      if (tool === "calibrate") {
        setCalibrating({ points });
        setDistanceText("");
      } else if (tool === "north") {
        saveCalibration({ north: angleDeg(points[0], points[1]) });
        setTool("select");
      } else setDraft(points);
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current!;
    if (pan.current) {
      const dx = (e.clientX - pan.current.x) / view.zoom;
      const dy = (e.clientY - pan.current.y) / view.zoom;
      setView((v) => ({ ...v, cx: pan.current!.cx - dx, cy: pan.current!.cy - dy }));
      return;
    }
    const raw = toPlanPoint(svg, e.clientX, e.clientY);
    if (drag.current) {
      const d = drag.current;
      if (d.kind === "room") {
        const room = roomById.get(d.roomId);
        if (!room) return;
        const others = [...roomVertices.filter((v) => !room.polygon.some((q) => q[0] === v[0] && q[1] === v[1])), ...envelopeVertices];
        const p = snapToPoints(raw, others, px(SNAP_PX)) ?? raw;
        setRoom(d.roomId, { polygon: room.polygon.map((q, i) => (i === d.index ? r1(p) : q)) });
      } else {
        const p = snapToPoints(raw, roomVertices, px(SNAP_PX)) ?? raw;
        setEnvelope((vs) => vs.map((v, i) => (i === d.index ? { ...v, p: r1(p) } : v)));
      }
      return;
    }
    if (tool === "select" || (tool === "measure" && draft.length === 2)) return setHover(null);
    if (tool === "opening") {
      const seg = nearestSegment(segments, raw, px(HIT_PX * 1.5));
      return setHover(seg ? pointAt(seg.segment, seg.t) : null);
    }
    setHover(snap(raw, draft.at(-1)));
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pan.current) {
      pan.current = null;
      svgRef.current?.releasePointerCapture(e.pointerId);
    }
    if (drag.current) {
      // The move itself went through `update`; record the state before the drag for undo.
      remember(drag.current.before);
      drag.current = null;
      svgRef.current?.releasePointerCapture(e.pointerId);
    }
  };

  const onHandleDown = (e: React.PointerEvent<SVGCircleElement>, d: Drag) => {
    if (!editable || tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    drag.current = d;
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool === "room" || tool === "envelope") return finishDraft();
    if (tool === "select" && editable && envelope) {
      // Double-click on an envelope segment inserts a vertex there.
      const raw = toPlanPoint(svgRef.current!, e.clientX, e.clientY);
      const seg = nearestSegment(segments, raw, px(HIT_PX));
      if (seg && seg.t > 0.02 && seg.t < 0.98) insertVertex(seg.segment.index, pointAt(seg.segment, seg.t));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "Shift") shift.current = true;
    const drawing = tool === "room" || tool === "envelope";
    if (e.key === "Escape") {
      setDraft([]);
      setOpeningStart(null);
      if (tool !== "select") setTool("select");
      else setSelection(null);
    } else if (e.key === "Enter" && drawing) finishDraft();
    else if (e.key === "Backspace" && drawing) setDraft((d) => d.slice(0, -1));
    else if ((e.key === "Delete" || e.key === "Backspace") && tool === "select" && editable && selection?.type === "room") deleteRoom(selection.id);
    else if (e.key === "z" && (e.ctrlKey || e.metaKey) && editable) {
      e.preventDefault();
      undo();
    } else if (e.key === "1") setTool("select");
    else if (e.key === "2" && editable) setTool("room");
    else if (e.key === "3" && editable && !envelope) setTool("envelope");
    else if (e.key === "4" && editable && envelope) setTool("opening");
    else if (e.key === "o") setOrtho((o) => !o);
  };
  const onKeyUp = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "Shift") shift.current = false;
  };

  // --- calibration -------------------------------------------------------------------------------------------------
  const saveCalibration = (patch: Partial<Pick<PlanInfo, "scale" | "north" | "rotation" | "originX" | "originY">>) => {
    const next = { ...plan, ...patch };
    setPlan(next);
    startTransition(async () => {
      const r = await saveBuildingPlanCalibration(plan.id, projectId, { scale: next.scale, rotation: next.rotation, north: next.north, originX: next.originX, originY: next.originY });
      if (r.error) toast.error(tForms(r.error as FormMessageKey));
      else toast.success(t("calibrationSaved"));
    });
  };
  const confirmCalibration = () => {
    const metres = parseNumber(distanceText);
    if (!calibrating || !metres || metres <= 0) return;
    const d = distance(calibrating.points[0], calibrating.points[1]);
    if (d <= 0) return;
    saveCalibration({ scale: metres / d });
    setCalibrating(null);
    setTool("select");
  };

  const zoomToRoom = (room: BuildingRoom) => {
    const b = bounds(room.polygon);
    if (!b) return;
    const w = Math.max(b[2] - b[0], 1);
    const h = Math.max(b[3] - b[1], 1);
    setView({ cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, zoom: Math.min(size.width / w, size.height / h) * 0.6 });
  };

  // --- rendering ---------------------------------------------------------------------------------------------------
  const r = px(HANDLE_PX);
  const stroke = px(1.5);
  const font = px(12);
  const labelStyle = { paintOrder: "stroke" as const, stroke: "white", strokeWidth: px(3) };
  const measure = tool === "measure" && draft.length >= 1 ? ([draft[0], draft[1] ?? hover] as const) : null;
  const measured = measure && measure[1] && plan.scale ? distance(measure[0], measure[1]) * plan.scale : null;
  const drawing = tool === "room" || tool === "envelope";
  const previewLength = drawing && draft.length && hover && plan.scale ? distance(draft.at(-1)!, hover) * plan.scale : null;
  const uncoveredTotal = segments.reduce((s, x) => s + (x.uncovered ?? 0), 0);
  const roomWalls = selectedRoom ? segments.flatMap((s) => s.matches.filter((m) => m.roomId === selectedRoom.id).map((m) => ({ s, m }))) : [];
  const elementConstructions = catalog.filter((c) => c.kind === "element" || c.kind === "ground");

  const tools: Tool[] = editable ? ["select", "room", "envelope", "opening", "calibrate", "north", "origin", "measure"] : ["select", "measure"];
  const toolDisabled = (k: Tool) => (k === "envelope" && !!envelope) || (k === "opening" && !envelope);

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-14rem)] lg:min-h-[560px] lg:flex-row">
      <div className="flex min-h-[480px] flex-1 flex-col overflow-hidden rounded-xl border">
        <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 px-2 py-1.5">
          {tools.map((k) => {
            const Icon = toolIcons[k];
            return (
              <Button key={k} size="sm" variant={tool === k ? "default" : "ghost"} disabled={toolDisabled(k)} onClick={() => setTool(k)} title={t(`tools.${k}Hint`)}>
                <Icon />
                {t(`tools.${k}`)}
              </Button>
            );
          })}
          <span className="mx-1 h-5 w-px bg-border" />
          <Button size="sm" variant={ortho ? "secondary" : "ghost"} onClick={() => setOrtho((o) => !o)} title={t("orthoHint")}>
            {t("ortho")}
          </Button>
          {editable && (
            <Button size="sm" variant="ghost" onClick={undo} disabled={history.length === 0} title="Ctrl+Z">
              <Undo2 />
              {t("undo")}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={fit} title={t("fit")}>
            <Maximize />
          </Button>
          <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {plan.scale ? t("scaleInfo", { px: fmt(1 / plan.scale, 1) }) : <span className="text-amber-700 dark:text-amber-400">{t("uncalibrated")}</span>}
            <SaveIndicator status={status} />
          </span>
        </div>
        <div ref={containerRef} className="relative flex-1 touch-none bg-neutral-200 dark:bg-neutral-800">
          <svg
            ref={svgRef}
            tabIndex={0}
            viewBox={viewBox}
            width={size.width}
            height={size.height}
            className={cn("block outline-none", tool === "select" ? "cursor-default" : "cursor-crosshair")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setHover(null)}
            onDoubleClick={onDoubleClick}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            onContextMenu={(e) => e.preventDefault()}
          >
            <image href={imageUrl} x={0} y={0} width={plan.width} height={plan.height} />

            {rooms.map((room) => {
              const m = roomMetrics(room, floor, plan);
              const isSel = selection?.type === "room" && selection.id === room.id;
              return (
                <g key={room.id}>
                  <polygon
                    points={room.polygon.map((p) => p.join(",")).join(" ")}
                    className={cn(room.kind === "heated" ? "fill-red-500/15" : "fill-sky-500/15", isSel ? "stroke-brand" : room.kind === "heated" ? "stroke-red-600" : "stroke-sky-600")}
                    strokeWidth={isSel ? stroke * 2 : stroke}
                    strokeLinejoin="round"
                  />
                  <text x={m.centroid[0]} y={m.centroid[1]} textAnchor="middle" fontSize={font} className="pointer-events-none select-none fill-neutral-900" style={labelStyle}>
                    <tspan x={m.centroid[0]} dy={-font * 0.6} fontWeight={600}>
                      {[room.number, room.name].filter(Boolean).join(" ")}
                    </tspan>
                    <tspan x={m.centroid[0]} dy={font * 1.2}>
                      {m.area === null ? "" : `${fmt(m.area, 2)} m²`}
                    </tspan>
                  </text>
                  {isSel &&
                    tool === "select" &&
                    room.polygon.map((p, i) => (
                      <circle key={i} cx={p[0]} cy={p[1]} r={r} className="fill-white stroke-brand" strokeWidth={stroke} style={{ cursor: editable ? "move" : "default" }} onPointerDown={(e) => onHandleDown(e, { kind: "room", roomId: room.id, index: i, before: model })} />
                    ))}
                </g>
              );
            })}

            {segments.map((s) => {
              const isSel = selectedSegment?.vertex.id === s.vertex.id;
              const mid = pointAt(s, 0.5);
              const label: Point = [mid[0] + s.outward[0] * px(14), mid[1] + s.outward[1] * px(14)];
              return (
                <g key={s.vertex.id}>
                  <line x1={s.from[0]} y1={s.from[1]} x2={s.to[0]} y2={s.to[1]} className={isSel ? "stroke-brand" : adjacencyStroke[s.vertex.adjacency]} strokeWidth={isSel ? stroke * 3.5 : stroke * 2.5} strokeDasharray={s.vertex.adjacency === "unheated" ? `${px(8)} ${px(4)}` : undefined} strokeLinecap="round" />
                  {plan.scale &&
                    uncoveredIntervals(s.matches).map(([a, b], i) => {
                      const p = pointAt(s, a);
                      const q = pointAt(s, b);
                      return <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} className="stroke-red-500" strokeWidth={stroke * 2.5} strokeDasharray={`${px(3)} ${px(3)}`} />;
                    })}
                  {s.openings.map((o) => {
                    const p = pointAt(s, o.fromT);
                    const q = pointAt(s, o.toT);
                    return <line key={o.opening.id} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} className={o.opening.kind === "door" ? "stroke-amber-600" : "stroke-cyan-400"} strokeWidth={stroke * 5} strokeLinecap="butt" />;
                  })}
                  {s.length !== null && s.lengthPx * view.zoom > 60 && (
                    <text x={label[0]} y={label[1]} textAnchor="middle" dominantBaseline="middle" fontSize={font * 0.9} className="pointer-events-none select-none fill-blue-900" style={labelStyle}>
                      {[s.orientation, `${fmt(s.length, 2)} m`].filter(Boolean).join(" · ")}
                    </text>
                  )}
                </g>
              );
            })}
            {envelope &&
              tool === "select" &&
              envelope.vertices.map((v, i) => (
                <circle key={v.id} cx={v.p[0]} cy={v.p[1]} r={r} className="fill-white stroke-blue-800" strokeWidth={stroke} style={{ cursor: editable ? "move" : "default" }} onPointerDown={(e) => onHandleDown(e, { kind: "envelope", index: i, before: model })} />
              ))}

            {drawing && draft.length > 0 && (
              <g>
                <polyline points={[...draft, ...(hover ? [hover] : [])].map((p) => p.join(",")).join(" ")} fill="none" className={tool === "envelope" ? "stroke-blue-700" : "stroke-brand"} strokeWidth={stroke} strokeDasharray={`${px(6)} ${px(4)}`} />
                {draft.length >= 2 && hover && <line x1={hover[0]} y1={hover[1]} x2={draft[0][0]} y2={draft[0][1]} className="stroke-brand/40" strokeWidth={stroke} strokeDasharray={`${px(2)} ${px(4)}`} />}
                {draft.map((p, i) => (
                  <circle key={i} cx={p[0]} cy={p[1]} r={i === 0 ? r * 1.4 : r} className={i === 0 ? "fill-brand" : "fill-white stroke-brand"} strokeWidth={stroke} />
                ))}
                {hover && previewLength !== null && (
                  <text x={hover[0] + r * 2} y={hover[1] - r * 2} fontSize={font} className="fill-neutral-900" style={labelStyle}>
                    {fmt(previewLength, 2)} m
                  </text>
                )}
              </g>
            )}
            {(tool === "calibrate" || tool === "north") && draft.length === 1 && (
              <g>
                <line x1={draft[0][0]} y1={draft[0][1]} x2={(hover ?? draft[0])[0]} y2={(hover ?? draft[0])[1]} className="stroke-emerald-600" strokeWidth={stroke * 1.5} />
                <circle cx={draft[0][0]} cy={draft[0][1]} r={r} className="fill-emerald-600" />
              </g>
            )}
            {calibrating && <line x1={calibrating.points[0][0]} y1={calibrating.points[0][1]} x2={calibrating.points[1][0]} y2={calibrating.points[1][1]} className="stroke-emerald-600" strokeWidth={stroke * 1.5} />}
            {measure && measure[1] && (
              <g>
                <line x1={measure[0][0]} y1={measure[0][1]} x2={measure[1][0]} y2={measure[1][1]} className="stroke-amber-600" strokeWidth={stroke * 1.5} />
                <text x={(measure[0][0] + measure[1][0]) / 2} y={(measure[0][1] + measure[1][1]) / 2 - r} textAnchor="middle" fontSize={font} className="fill-neutral-900" style={labelStyle}>
                  {measured === null ? t("uncalibrated") : `${fmt(measured, 2)} m`}
                </text>
              </g>
            )}
            <g className="pointer-events-none">
              <line x1={plan.originX - r * 3} y1={plan.originY} x2={plan.originX + r * 3} y2={plan.originY} className="stroke-fuchsia-600" strokeWidth={stroke} />
              <line x1={plan.originX} y1={plan.originY - r * 3} x2={plan.originX} y2={plan.originY + r * 3} className="stroke-fuchsia-600" strokeWidth={stroke} />
              <circle cx={plan.originX} cy={plan.originY} r={r * 1.5} fill="none" className="stroke-fuchsia-600" strokeWidth={stroke} />
            </g>
            {openingStart && (() => {
              const s = segments.find((x) => x.vertex.id === openingStart.vertexId);
              if (!s) return null;
              const p = pointAt(s, openingStart.t);
              return <circle cx={p[0]} cy={p[1]} r={r * 1.3} className="fill-cyan-400" />;
            })()}
            {hover && tool !== "select" && <circle cx={hover[0]} cy={hover[1]} r={r} fill="none" className="stroke-brand" strokeWidth={stroke} />}
          </svg>
          {plan.north !== null && (
            <div className="pointer-events-none absolute right-3 top-3 flex size-12 items-center justify-center rounded-full bg-white/85 shadow dark:bg-neutral-900/85" title={t("northSet")}>
              <Compass className="size-7 text-brand" style={{ transform: `rotate(${plan.north + 90}deg)` }} />
            </div>
          )}
          <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/85 px-2 py-1 text-xs text-neutral-700 dark:bg-neutral-900/85 dark:text-neutral-200">{t(`hints.${tool}`)}</p>
        </div>
      </div>

      <aside className="w-full space-y-4 lg:w-80 lg:overflow-y-auto">
        <section className="space-y-2 rounded-xl border p-3 text-sm">
          <h2 className="font-semibold">{floor?.name ?? floorKey}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">{t("plan")}</dt>
            <dd>
              {plan.name || "–"} · {t("pageN", { n: plan.page })}
            </dd>
            <dt className="text-muted-foreground">{t("scale")}</dt>
            <dd className={cn(!plan.scale && "text-amber-700 dark:text-amber-400")}>{plan.scale ? t("scaleInfo", { px: fmt(1 / plan.scale, 1) }) : t("uncalibrated")}</dd>
            <dt className="text-muted-foreground">{t("north")}</dt>
            <dd>{plan.north === null ? t("northUnset") : t("northSet")}</dd>
            <dt className="text-muted-foreground">{t("origin")}</dt>
            <dd className={cn(plan.originX === 0 && plan.originY === 0 && "text-amber-700 dark:text-amber-400")}>{plan.originX === 0 && plan.originY === 0 ? t("originUnset") : `${fmt(plan.originX, 0)} / ${fmt(plan.originY, 0)} px`}</dd>
            <dt className="text-muted-foreground">{t("floorHeight")}</dt>
            <dd>
              {floor?.height === null || floor?.height === undefined ? "–" : `${fmt(floor.height, 2)} m`} · {t("storeyHeight")} {storeyHeightOf(floor) === null ? "–" : `${fmt(storeyHeightOf(floor), 2)} m`}
            </dd>
            <dt className="text-muted-foreground">{t("envelope")}</dt>
            <dd>
              {envelope ? t("envelopeInfo", { n: envelope.vertices.length }) : t("noEnvelope")}
              {envelope && plan.scale && uncoveredTotal > 0.05 && (
                <span className="ml-1 inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="size-3" />
                  {t("uncoveredTotal", { m: fmt(uncoveredTotal, 1) })}
                </span>
              )}
            </dd>
          </dl>
          {editable && !plan.scale && <p className="text-xs text-amber-700 dark:text-amber-400">{t("calibrateFirst")}</p>}
          {editable && plan.north === null && <p className="text-xs text-amber-700 dark:text-amber-400">{t("northFirst")}</p>}
          {editable && envelope && (
            <Button size="sm" variant="ghost" onClick={deleteEnvelope}>
              <Trash2 />
              {t("deleteEnvelope")}
            </Button>
          )}
        </section>

        {selectedSegment ? (
          <SegmentPanel
            segment={selectedSegment}
            floor={floor}
            rooms={roomById}
            constructions={elementConstructions}
            editable={editable}
            canRemove={(envelope?.vertices.length ?? 0) > 3}
            onChange={(patch) => setVertex(selectedSegment.vertex.id, patch)}
            onOpening={(id, patch) => setOpening(selectedSegment.vertex.id, id, patch)}
            onAddOpening={() => addOpening(selectedSegment.vertex.id, 0.4, 1.2)}
            onRemoveOpening={(id) => removeOpening(selectedSegment.vertex.id, id)}
            onRemoveVertex={() => removeVertex(selectedSegment.vertex.id)}
          />
        ) : selectedRoom && metrics ? (
          <section className="space-y-3 rounded-xl border p-3 text-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t("room")}</h2>
              {editable && (
                <Button size="icon-sm" variant="ghost" onClick={() => deleteRoom(selectedRoom.id)} title={t("deleteRoom")} aria-label={t("deleteRoom")}>
                  <Trash2 />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-[5rem_1fr] gap-2">
              <div className="space-y-1">
                <Label htmlFor="rm-number" className="text-xs">
                  {t("fields.number")}
                </Label>
                <Input id="rm-number" value={selectedRoom.number} maxLength={20} disabled={!editable} className="h-8" onChange={(e) => setRoom(selectedRoom.id, { number: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rm-name" className="text-xs">
                  {t("fields.name")}
                </Label>
                <Input id="rm-name" value={selectedRoom.name} maxLength={120} disabled={!editable} className="h-8" onChange={(e) => setRoom(selectedRoom.id, { name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="rm-kind" className="text-xs">
                  {t("fields.kind")}
                </Label>
                <NativeSelect id="rm-kind" value={selectedRoom.kind} disabled={!editable} className="h-8 text-xs" onChange={(e) => setRoom(selectedRoom.id, { kind: e.target.value as RoomKind })}>
                  {roomKinds.map((k) => (
                    <option key={k} value={k}>
                      {t(`kinds.${k}`)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rm-theta" className="text-xs">
                  θi [°C]
                </Label>
                <NumberField id="rm-theta" value={selectedRoom.thetaInt} decimals={1} negative label="θi" disabled={!editable || selectedRoom.kind !== "heated"} onChange={(v) => setRoom(selectedRoom.id, { thetaInt: v })} className="h-8 rounded-lg" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rm-height" className="text-xs">
                  h [m]
                </Label>
                <NumberField id="rm-height" value={selectedRoom.height} decimals={2} label="h" disabled={!editable} placeholder={floor?.height === null || floor?.height === undefined ? "" : fmt(floor.height, 2)} onChange={(v) => setRoom(selectedRoom.id, { height: v })} className="h-8 rounded-lg" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="rm-zone" className="text-xs">
                  {t("fields.zone")}
                </Label>
                <NativeSelect id="rm-zone" value={selectedRoom.zoneId ?? ""} disabled={!editable || selectedRoom.kind !== "heated"} className="h-8 text-xs" onChange={(e) => setRoom(selectedRoom.id, { zoneId: e.target.value || null })}>
                  <option value="">{model.zones.length === 1 ? t("zoneAuto", { name: model.zones[0].name }) : t("zoneNone")}</option>
                  {model.zones.map((zn) => (
                    <option key={zn.id} value={zn.id}>
                      {zn.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {selectedRoom.kind === "passive" && (
                <div className="space-y-1">
                  <Label htmlFor="rm-unheated" className="text-xs">
                    {t("fields.unheatedCase")}
                  </Label>
                  <div className="flex items-center gap-1">
                    <NativeSelect id="rm-unheated" value={selectedRoom.unheatedCase} disabled={!editable} className="h-8 text-xs" onChange={(e) => setRoom(selectedRoom.id, { unheatedCase: e.target.value as UnheatedCase })}>
                      {unheatedCaseKeys.map((k) => (
                        <option key={k} value={k}>
                          {tu(`cases.${k}`)}
                        </option>
                      ))}
                    </NativeSelect>
                    <label className="flex items-center gap-1 whitespace-nowrap text-xs" title={tu("insulatedHint")}>
                      <input type="checkbox" checked={selectedRoom.unheatedInsulated} disabled={!editable} onChange={(e) => setRoom(selectedRoom.id, { unheatedInsulated: e.target.checked })} />
                      {tu("insulated")}
                    </label>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="rm-usage" className="text-xs">
                {t("fields.usage")}
              </Label>
              <NativeSelect id="rm-usage" value={selectedRoom.usage ?? ""} disabled={!editable} className="h-8 text-xs" onChange={(e) => setRoom(selectedRoom.id, { usage: e.target.value || null })}>
                <option value="">–</option>
                {roomUsages.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.code} {u.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {(() => {
              const sg = suggestionFor(selectedRoom.polygon);
              if (!sg.name && sg.area === null) return null;
              const diff = sg.area !== null && metrics.area !== null && sg.area > 0 ? ((metrics.area - sg.area) / sg.area) * 100 : null;
              return (
                <p className="rounded-lg bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                  {t("planSays")} {[sg.name, sg.area === null ? null : `${sg.areaLabel} ${fmt(sg.area, 2)} m²`].filter(Boolean).join(" · ")}
                  {diff !== null && <span className={cn("ml-1 tabular-nums", Math.abs(diff) > 5 && "text-amber-700 dark:text-amber-400")}>({diff >= 0 ? "+" : ""}{fmt(diff, 1)} %)</span>}
                  {editable && sg.name && sg.name !== selectedRoom.name && (
                    <button type="button" className="ml-2 underline" onClick={() => setRoom(selectedRoom.id, { name: sg.name! })}>
                      {t("adoptName")}
                    </button>
                  )}
                </p>
              );
            })()}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">{t("fields.area")}</dt>
              <dd className="tabular-nums">{metrics.area === null ? t("uncalibrated") : `${fmt(metrics.area, 2)} m²`}</dd>
              <dt className="text-muted-foreground">{t("fields.perimeter")}</dt>
              <dd className="tabular-nums">{metrics.perimeter === null ? "–" : `${fmt(metrics.perimeter, 2)} m`}</dd>
              <dt className="text-muted-foreground">{t("fields.volume")}</dt>
              <dd className="tabular-nums">{metrics.volume === null ? "–" : `${fmt(metrics.volume, 1)} m³`}</dd>
              <dt className="text-muted-foreground">{t("fields.vertices")}</dt>
              <dd className="tabular-nums">{selectedRoom.polygon.length}</dd>
              <dt className="text-muted-foreground">{t("fields.walls")}</dt>
              <dd className="tabular-nums">
                {roomWalls.length === 0
                  ? t("noWalls")
                  : roomWalls.map(({ s, m }, i) => (
                      <button key={i} type="button" className="mr-2 underline-offset-2 hover:underline" onClick={() => setSelection({ type: "segment", vertexId: s.vertex.id })}>
                        {s.orientation ?? "?"} {m.length === null ? "" : `${fmt(m.length, 2)} m`}
                      </button>
                    ))}
              </dd>
            </dl>
          </section>
        ) : (
          <section className="rounded-xl border p-3 text-sm text-muted-foreground">{editable ? t("noSelection") : t("noSelectionReadOnly")}</section>
        )}

        <section className="rounded-xl border text-sm">
          <h2 className="border-b px-3 py-2 font-semibold">{t("rooms", { count: rooms.length })}</h2>
          {rooms.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">{t("noRooms")}</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {[...rooms]
                .sort((a, b) => a.number.localeCompare(b.number, "de-CH", { numeric: true }))
                .map((room) => {
                  const m = roomMetrics(room, floor, plan);
                  return (
                    <li key={room.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelection({ type: "room", id: room.id });
                          zoomToRoom(room);
                        }}
                        className={cn("flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left hover:bg-muted/50", selection?.type === "room" && selection.id === room.id && "bg-muted/60")}
                      >
                        <span className="truncate">
                          <span className="font-medium tabular-nums">{room.number}</span> {room.name}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{m.area === null ? "" : `${fmt(m.area, 1)} m²`}</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border p-3 text-xs text-muted-foreground">
          <p>{t("help.pan")}</p>
          <p>{t("help.snap")}</p>
          <p>{t("help.envelope")}</p>
          <p>{t("help.keys")}</p>
        </section>
      </aside>

      <Dialog open={calibrating !== null} onOpenChange={(open) => !open && setCalibrating(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("calibrateTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("calibrateText", { px: calibrating ? fmt(distance(calibrating.points[0], calibrating.points[1]), 0) : "" })}</p>
          <div className="space-y-2">
            <Label htmlFor="cal-distance">{t("calibrateDistance")}</Label>
            <Input id="cal-distance" inputMode="decimal" autoFocus value={distanceText} onChange={(e) => setDistanceText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmCalibration()} />
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
            <Button type="button" disabled={pending || !parseNumber(distanceText)} onClick={confirmCalibration}>
              {t("calibrateConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Attributes of the selected envelope segment: construction, adjacency, orientation, tolerance, openings, matches. */
function SegmentPanel({
  segment: s,
  floor,
  rooms,
  constructions,
  editable,
  canRemove,
  onChange,
  onOpening,
  onAddOpening,
  onRemoveOpening,
  onRemoveVertex,
}: {
  segment: SegmentEval;
  floor: { wallThickness: number | null; windowHeight: number | null } | null;
  rooms: Map<string, BuildingRoom>;
  constructions: Construction[];
  editable: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<EnvelopeVertex>) => void;
  onOpening: (id: string, patch: Partial<Opening>) => void;
  onAddOpening: () => void;
  onRemoveOpening: (id: string) => void;
  onRemoveVertex: () => void;
}) {
  const t = useTranslations("building.editor");
  const tu = useTranslations("building.unheated");
  const v = s.vertex;
  return (
    <section className="space-y-3 rounded-xl border p-3 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t("segment")}</h2>
        {editable && canRemove && (
          <Button size="icon-sm" variant="ghost" onClick={onRemoveVertex} title={t("removeVertex")} aria-label={t("removeVertex")}>
            <Trash2 />
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t("fields.length")}</dt>
        <dd className="tabular-nums">{s.length === null ? t("uncalibrated") : `${fmt(s.length, 2)} m`}</dd>
        <dt className="text-muted-foreground">{t("fields.bearing")}</dt>
        <dd className="tabular-nums">{s.bearing === null ? t("northUnset") : `${fmt(s.bearing, 0)}° → ${s.orientation}`}</dd>
        <dt className="text-muted-foreground">{t("fields.rooms")}</dt>
        <dd>
          {s.matches.length === 0 ? (
            <span className="text-amber-700 dark:text-amber-400">{t("noMatch")}</span>
          ) : (
            s.matches.map((m, i) => {
              const room = rooms.get(m.roomId);
              return (
                <span key={i} className="mr-2 tabular-nums">
                  {room ? [room.number, room.name].filter(Boolean).join(" ") : "?"} {m.length === null ? "" : `(${fmt(m.length, 2)} m)`}
                </span>
              );
            })
          )}
          {s.uncovered !== null && s.uncovered > 0.05 && s.matches.length > 0 && <span className="text-amber-700 dark:text-amber-400">{t("uncovered", { m: fmt(s.uncovered, 2) })}</span>}
        </dd>
      </dl>
      <div className="space-y-1">
        <Label htmlFor="sg-construction" className="text-xs">
          {t("fields.construction")}
        </Label>
        <NativeSelect id="sg-construction" value={v.constructionId ?? ""} disabled={!editable} className="h-8 text-xs" onChange={(e) => onChange({ constructionId: e.target.value || null })}>
          <option value="">–</option>
          {constructions.map((c) => (
            <option key={c.id} value={c.id}>
              {[c.code, c.name].filter(Boolean).join(" ")} {c.value !== null && c.kind !== "ground" ? `(${fmt(c.value, 3)})` : ""}
            </option>
          ))}
        </NativeSelect>
        {constructions.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-400">{t("noCatalog")}</p>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label htmlFor="sg-adjacency" className="text-xs">
            {t("fields.adjacency")}
          </Label>
          <NativeSelect id="sg-adjacency" value={v.adjacency} disabled={!editable} className="h-8 text-xs" onChange={(e) => onChange({ adjacency: e.target.value as EnvelopeAdjacency })}>
            {envelopeAdjacencies.map((a) => (
              <option key={a} value={a}>
                {t(`adjacency.${a}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sg-orientation" className="text-xs">
            {t("fields.orientation")}
          </Label>
          <NativeSelect id="sg-orientation" value={v.orientation ?? ""} disabled={!editable} className="h-8 text-xs" onChange={(e) => onChange({ orientation: e.target.value || null })}>
            <option value="">{t("auto")}</option>
            {orientations8.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sg-tolerance" className="text-xs">
            {t("fields.tolerance")}
          </Label>
          <NumberField id="sg-tolerance" value={v.tolerance} decimals={2} label={t("fields.tolerance")} disabled={!editable} placeholder={floor?.wallThickness === null || floor?.wallThickness === undefined ? "0.50" : fmt(floor.wallThickness, 2)} onChange={(tol) => onChange({ tolerance: tol })} className="h-8 rounded-lg" />
        </div>
      </div>
      {v.adjacency === "unheated" && (
        <div className="space-y-1">
          <Label htmlFor="sg-unheated" className="text-xs">
            {t("fields.unheatedCase")}
          </Label>
          <div className="flex items-center gap-1">
            <NativeSelect id="sg-unheated" value={v.unheatedCase} disabled={!editable} className="h-8 text-xs" onChange={(e) => onChange({ unheatedCase: e.target.value as UnheatedCase })}>
              {unheatedCaseKeys.map((k) => (
                <option key={k} value={k}>
                  {tu(`cases.${k}`)}
                </option>
              ))}
            </NativeSelect>
            <label className="flex items-center gap-1 whitespace-nowrap text-xs" title={tu("insulatedHint")}>
              <input type="checkbox" checked={v.unheatedInsulated} disabled={!editable} onChange={(e) => onChange({ unheatedInsulated: e.target.checked })} />
              {tu("insulated")}
            </label>
          </div>
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium">{t("openings", { count: v.openings.length })}</h3>
          {editable && (
            <Button size="sm" variant="ghost" onClick={onAddOpening}>
              <Plus />
              {t("addOpening")}
            </Button>
          )}
        </div>
        {v.openings.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noOpenings")}</p>
        ) : (
          <ul className="space-y-2">
            {s.openings.map(({ opening: o, roomId, height, area }) => {
              const room = roomId ? rooms.get(roomId) : null;
              return (
                <li key={o.id} className="space-y-1 rounded-lg border p-2">
                  <div className="grid grid-cols-[1fr_4rem_4rem_3rem_auto] items-end gap-1">
                    <NativeSelect value={o.kind} disabled={!editable} className="h-7 text-xs" aria-label={t("fields.kind")} onChange={(e) => onOpening(o.id, { kind: e.target.value as OpeningKind, height: null })}>
                      {openingKinds.map((k) => (
                        <option key={k} value={k}>
                          {t(`openingKinds.${k}`)}
                        </option>
                      ))}
                    </NativeSelect>
                    <NumberField value={o.width} decimals={2} label={t("fields.width")} disabled={!editable} onChange={(w) => onOpening(o.id, { width: w })} />
                    <NumberField value={o.height} decimals={2} label={t("fields.height")} disabled={!editable} placeholder={fmt(height, 2)} onChange={(h) => onOpening(o.id, { height: h })} />
                    <NumberField value={o.count} decimals={0} label={t("fields.count")} disabled={!editable} placeholder="1" onChange={(n) => onOpening(o.id, { count: n })} />
                    {editable && (
                      <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={t("removeOpening")} title={t("removeOpening")} onClick={() => onRemoveOpening(o.id)}>
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-[1fr_4rem] items-center gap-1">
                    <NativeSelect value={o.constructionId ?? ""} disabled={!editable} className="h-7 text-xs" aria-label={t("fields.construction")} onChange={(e) => onOpening(o.id, { constructionId: e.target.value || null })}>
                      <option value="">–</option>
                      {constructions
                        .filter((c) => c.kind === "element")
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {[c.code, c.name].filter(Boolean).join(" ")} {c.value !== null ? `(${fmt(c.value, 3)})` : ""}
                          </option>
                        ))}
                    </NativeSelect>
                    <NumberField value={o.at} decimals={2} label={t("fields.at")} disabled={!editable} onChange={(at) => onOpening(o.id, { at: Math.min(1, Math.max(0, at ?? 0)) })} />
                  </div>
                  {o.kind === "window" && (
                    <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] items-center gap-1 text-xs">
                      <span className="text-muted-foreground" title={t("fields.shadingHint")}>
                        {t("fields.shading")}
                      </span>
                      {(["horizon", "overhang", "finLeft", "finRight"] as const).map((k) => (
                        <NumberField key={k} value={o[k]} decimals={0} label={t(`fields.${k}`)} disabled={!editable} placeholder={t(`fields.${k}`)} onChange={(v) => onOpening(o.id, { [k]: v })} />
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {area === null ? "" : `${fmt(area, 2)} m² · `}
                    {room ? [room.number, room.name].filter(Boolean).join(" ") : <span className="text-amber-700 dark:text-amber-400">{t("openingNoRoom")}</span>}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function toPlanPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const ctm = svg.getScreenCTM();
  if (!ctm) return [0, 0];
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return [p.x, p.y];
}
