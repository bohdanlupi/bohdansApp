"use client";

import { Compass, Maximize, MousePointer2, Pentagon, Ruler, Scaling, Trash2, Undo2 } from "lucide-react";
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
import { angleDeg, bounds, distance, type Point, pointInPolygon, snapOrthogonal, snapToPoints } from "@/lib/building/geometry";
import { nextRoomNumber, roomMetrics } from "@/lib/building/model";
import { type BuildingModel, type BuildingRoom, type PlanInfo, type RoomKind, roomKinds } from "@/lib/building/schema";
import { parseNumber } from "@/lib/number-input";
import { cn } from "@/lib/utils";

import { saveBuildingModel, saveBuildingPlanCalibration } from "../../actions";

type Tool = "select" | "room" | "calibrate" | "north" | "measure";
type View = { cx: number; cy: number; zoom: number };

const SNAP_PX = 10;
const HANDLE_PX = 5;
const MAX_HISTORY = 50;

const toolIcons = { select: MousePointer2, room: Pentagon, calibrate: Scaling, north: Compass, measure: Ruler } as const;

/**
 * Tracing editor of one Geschoss: the plan snapshot as background, rooms drawn as polygons along the inner wall faces,
 * scale calibration (two points + distance) and north arrow. Rooms are autosaved with the model; the calibration is
 * saved on the plan row.
 */
export function PlanEditor({
  projectId,
  floorKey,
  initial,
  plan: initialPlan,
  imageUrl,
  editable,
}: {
  projectId: string;
  floorKey: string;
  initial: BuildingModel;
  plan: PlanInfo;
  imageUrl: string;
  editable: boolean;
}) {
  const t = useTranslations("building.editor");
  const tForms = useTranslations("forms");
  const { plan: model, update, status } = usePlan(projectId, initial, editable, saveBuildingModel);
  const [plan, setPlan] = useState(initialPlan);
  const floor = model.floors.find((f) => f.key === floorKey) ?? null;
  const rooms = useMemo(() => model.rooms.filter((r) => r.floor === floorKey), [model.rooms, floorKey]);

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
  const [selected, setSelected] = useState<string | null>(null);
  const [calibrating, setCalibrating] = useState<{ points: [Point, Point] } | null>(null);
  const [distanceText, setDistanceText] = useState("");
  const [pending, startTransition] = useTransition();
  const pan = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const drag = useRef<{ roomId: string; index: number; before: BuildingModel } | null>(null);
  const [history, setHistory] = useState<BuildingModel[]>([]);
  const shift = useRef(false);

  const setTool = (next: Tool) => {
    setToolState(next);
    setDraft([]);
    setHover(null);
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

  const vertices = useMemo(() => rooms.flatMap((r) => r.polygon as Point[]), [rooms]);
  const snap = (p: Point, last?: Point | null): Point => {
    const near = snapToPoints(p, vertices, px(SNAP_PX));
    if (near) return near;
    return last && (ortho !== shift.current) ? snapOrthogonal(last, p) : p;
  };

  const selectedRoom = rooms.find((r) => r.id === selected) ?? null;
  const metrics = selectedRoom ? roomMetrics(selectedRoom, floor, plan) : null;

  const addRoom = (polygon: Point[]) => {
    const room: BuildingRoom = {
      id: crypto.randomUUID(),
      number: nextRoomNumber(model.rooms, floor),
      name: "",
      floor: floorKey,
      polygon: polygon.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]),
      kind: "heated",
      thetaInt: 20,
      height: null,
    };
    commit((m) => ({ ...m, rooms: [...m.rooms, room] }));
    setSelected(room.id);
  };
  const setRoom = (id: string, patch: Partial<BuildingRoom>) => update((m) => ({ ...m, rooms: m.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const deleteRoom = (id: string) => {
    commit((m) => ({ ...m, rooms: m.rooms.filter((r) => r.id !== id) }));
    setSelected(null);
  };

  const finishDraft = () => {
    // A double-click adds its second click as a duplicate vertex – drop repeated points.
    const points = draft.filter((p, i) => i === 0 || distance(p, draft[i - 1]) > px(2));
    if (points.length >= 3) addRoom(points);
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
      const hit = [...rooms].reverse().find((r) => pointInPolygon(raw, r.polygon));
      setSelected(hit?.id ?? null);
      if (!hit) panStart();
      return;
    }
    if (!editable && tool !== "measure") return;
    const p = snap(raw, draft.at(-1));
    if (tool === "room") {
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
      } else {
        setDraft(points);
      }
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
      const { roomId, index } = drag.current;
      const room = rooms.find((r) => r.id === roomId);
      if (!room) return;
      const others = vertices.filter((v) => !room.polygon.some((q) => q[0] === v[0] && q[1] === v[1]));
      const p = snapToPoints(raw, others, px(SNAP_PX)) ?? raw;
      setRoom(roomId, { polygon: room.polygon.map((q, i) => (i === index ? [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10] : q)) });
      return;
    }
    if (tool === "select" || (tool === "measure" && draft.length === 2)) return setHover(null);
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

  const onVertexDown = (e: React.PointerEvent<SVGCircleElement>, roomId: string, index: number) => {
    if (!editable || tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    drag.current = { roomId, index, before: model };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onDoubleClick = () => {
    if (tool === "room") finishDraft();
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "Shift") shift.current = true;
    if (e.key === "Escape") {
      setDraft([]);
      if (tool !== "select") setTool("select");
      else setSelected(null);
    } else if (e.key === "Enter" && tool === "room") finishDraft();
    else if (e.key === "Backspace" && tool === "room") setDraft((d) => d.slice(0, -1));
    else if ((e.key === "Delete" || e.key === "Backspace") && tool === "select" && selected && editable) deleteRoom(selected);
    else if (e.key === "z" && (e.ctrlKey || e.metaKey) && editable) {
      e.preventDefault();
      undo();
    } else if (e.key === "1") setTool("select");
    else if (e.key === "2" && editable) setTool("room");
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
  const measure = tool === "measure" && draft.length >= 1 ? ([draft[0], draft[1] ?? hover] as const) : null;
  const measured = measure && measure[1] && plan.scale ? distance(measure[0], measure[1]) * plan.scale : null;
  const previewLength = tool === "room" && draft.length && hover && plan.scale ? distance(draft.at(-1)!, hover) * plan.scale : null;

  const tools: Tool[] = editable ? ["select", "room", "calibrate", "north", "measure"] : ["select", "measure"];

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-14rem)] lg:min-h-[560px] lg:flex-row">
      <div className="flex min-h-[480px] flex-1 flex-col overflow-hidden rounded-xl border">
        <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 px-2 py-1.5">
          {tools.map((k) => {
            const Icon = toolIcons[k];
            return (
              <Button key={k} size="sm" variant={tool === k ? "default" : "ghost"} onClick={() => setTool(k)} title={t(`tools.${k}Hint`)}>
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
              const isSel = room.id === selected;
              const pts = room.polygon.map((p) => p.join(",")).join(" ");
              return (
                <g key={room.id}>
                  <polygon
                    points={pts}
                    className={cn(room.kind === "heated" ? "fill-red-500/15" : "fill-sky-500/15", isSel ? "stroke-brand" : room.kind === "heated" ? "stroke-red-600" : "stroke-sky-600")}
                    strokeWidth={isSel ? stroke * 2 : stroke}
                    strokeLinejoin="round"
                  />
                  <text x={m.centroid[0]} y={m.centroid[1]} textAnchor="middle" fontSize={font} className="pointer-events-none select-none fill-neutral-900" style={{ paintOrder: "stroke", stroke: "white", strokeWidth: px(3) }}>
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
                      <circle key={i} cx={p[0]} cy={p[1]} r={r} className="fill-white stroke-brand" strokeWidth={stroke} style={{ cursor: editable ? "move" : "default" }} onPointerDown={(e) => onVertexDown(e, room.id, i)} />
                    ))}
                </g>
              );
            })}
            {tool === "room" && draft.length > 0 && (
              <g>
                <polyline points={[...draft, ...(hover ? [hover] : [])].map((p) => p.join(",")).join(" ")} fill="none" className="stroke-brand" strokeWidth={stroke} strokeDasharray={`${px(6)} ${px(4)}`} />
                {draft.length >= 2 && hover && <line x1={hover[0]} y1={hover[1]} x2={draft[0][0]} y2={draft[0][1]} className="stroke-brand/40" strokeWidth={stroke} strokeDasharray={`${px(2)} ${px(4)}`} />}
                {draft.map((p, i) => (
                  <circle key={i} cx={p[0]} cy={p[1]} r={i === 0 ? r * 1.4 : r} className={i === 0 ? "fill-brand" : "fill-white stroke-brand"} strokeWidth={stroke} />
                ))}
                {hover && previewLength !== null && (
                  <text x={hover[0] + r * 2} y={hover[1] - r * 2} fontSize={font} className="fill-neutral-900" style={{ paintOrder: "stroke", stroke: "white", strokeWidth: px(3) }}>
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
                <text x={(measure[0][0] + measure[1][0]) / 2} y={(measure[0][1] + measure[1][1]) / 2 - r} textAnchor="middle" fontSize={font} className="fill-neutral-900" style={{ paintOrder: "stroke", stroke: "white", strokeWidth: px(3) }}>
                  {measured === null ? t("uncalibrated") : `${fmt(measured, 2)} m`}
                </text>
              </g>
            )}
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
            <dt className="text-muted-foreground">{t("floorHeight")}</dt>
            <dd>{floor?.height === null || floor?.height === undefined ? "–" : `${fmt(floor.height, 2)} m`}</dd>
          </dl>
          {editable && !plan.scale && <p className="text-xs text-amber-700 dark:text-amber-400">{t("calibrateFirst")}</p>}
        </section>

        {selectedRoom && metrics ? (
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
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">{t("fields.area")}</dt>
              <dd className="tabular-nums">{metrics.area === null ? t("uncalibrated") : `${fmt(metrics.area, 2)} m²`}</dd>
              <dt className="text-muted-foreground">{t("fields.perimeter")}</dt>
              <dd className="tabular-nums">{metrics.perimeter === null ? "–" : `${fmt(metrics.perimeter, 2)} m`}</dd>
              <dt className="text-muted-foreground">{t("fields.volume")}</dt>
              <dd className="tabular-nums">{metrics.volume === null ? "–" : `${fmt(metrics.volume, 1)} m³`}</dd>
              <dt className="text-muted-foreground">{t("fields.vertices")}</dt>
              <dd className="tabular-nums">{selectedRoom.polygon.length}</dd>
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
                          setSelected(room.id);
                          zoomToRoom(room);
                        }}
                        className={cn("flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left hover:bg-muted/50", room.id === selected && "bg-muted/60")}
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

function toPlanPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const ctm = svg.getScreenCTM();
  if (!ctm) return [0, 0];
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return [p.x, p.y];
}
