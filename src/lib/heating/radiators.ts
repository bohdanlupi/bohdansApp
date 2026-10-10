// 243 Heizkörper of an Anlage: per Heizgruppe the heated rooms of the Wärmebedarf with 1..n Heizkörper each.
//   Load:       room Qh (Wärmebedarf) split over its Heizkörper (evenly, or by share).
//   Output:     Φ = Φ50 · ((θVL + θRL)/2 − θi) / 50 K)^n · f_Anschluss  (Zehnder catalogues, arithmetic mean
//               over-temperature as their correction table CK; Φ50 per element / per 1000 mm / per radiator).
//   Sizing:     the shortest size of the chosen model whose output covers the load (elements, length steps of the
//               ZehnderHK articles); a size entered by hand overrides it.
//   Mass flow:  Q / (cp · (θVL − θRL)) of the group.
//   Armatures:  Oventrop (Meier Tobler articles): Thermostatventil by series and form, Rücklaufverschraubung Combi 2/3,
//               Thermostatkopf; Ventilheizkörper (Anschluss unten) with Anschlussarmatur Multiflex F / Multiblock;
//               Entlüftungsventil and Entleerhahn. The forms follow from where the pipe comes from:
//                 side connection,  pipe from Boden / Decke → Eck,  from the Wand → Winkeleck (Thermostatventil) / Eck
//                 bottom connection, pipe from Boden → Durchgang,  from Wand / Decke → Eck
//               and can be chosen per Heizkörper.

import {
  drainCocks,
  drainTool,
  type MtArticle,
  type RadiatorModel,
  radiatorSeries,
  type RadiatorSeries,
  returnValves,
  thermoValves,
  thermostatHeads,
  type ValveForm,
  valveBlocks,
  ventValves,
} from "./radiator-data";
import { CP_WATER } from "./water";

export type SeriesKey = RadiatorSeries["key"];
/** Gleichseitig (VL top, RL bottom on one side), wechselseitig (diagonal), unten (Ventilheizkörper), unten beidseitig. */
export const radiatorConnections = ["same", "cross", "bottom", "bottomBoth"] as const;
export type RadiatorConnection = (typeof radiatorConnections)[number];
/** Side of the Vorlauf connection (Ventilheizkörper: side of the Anschlussarmatur). */
export type RadiatorSide = "left" | "right";
export const pipeSources = ["floor", "wall", "ceiling"] as const;
export type PipeSource = (typeof pipeSources)[number];
export const valveSeries = ["aq", "av9", "a"] as const;
export type ValveSeries = (typeof valveSeries)[number];
export type DrainMode = "return" | "separate";
export const valveForms = ["eck", "durchgang", "axial", "winkeleckL", "winkeleckR"] as const;
export const valveDns = [10, 15, 20] as const;
/** «No Thermostatkopf» (Stellantrieb or head planned separately). */
export const NO_HEAD = "none";

export type Radiator = {
  id: string;
  label: string;
  /** Share of the room load (0..1); null = even split over the Heizkörper of the room without a share. */
  share: number | null;
  /** Model code of radiator-data (e.g. «3060», «ZNXHL-021/014»); null = the default model. */
  model: string | null;
  /** Elements or length [mm] by hand; null = sized by the load. */
  size: number | null;
  connection: RadiatorConnection | null;
  side: RadiatorSide | null;
  pipeFrom: PipeSource | null;
  /** Output factor of the connection (Zehnder: values for gleichseitig; others «from the literature»); null = 1. */
  connFactor: number | null;
  valveSeries: ValveSeries | null;
  vlForm: ValveForm | null;
  rlForm: "eck" | "durchgang" | null;
  /** Thermostatkopf article, NO_HEAD, or null = the default. */
  head: string | null;
  drain: DrainMode | null;
  vent: boolean;
};

export type RadiatorRoom = {
  id: string;
  calcId: string | null;
  roomId: string | null;
  /** Heizgruppe of the Anlage (242). */
  groupId: string | null;
  name: string;
  floor: string;
  /** Manual load [W] / room temperature [°C] instead of the Wärmebedarf. */
  load: number | null;
  roomTemp: number | null;
  radiators: Radiator[];
};

/** Defaults of the Anlage, used where a Heizkörper leaves a field empty. */
export type RadiatorDefaults = {
  model: string;
  connection: RadiatorConnection;
  side: RadiatorSide;
  pipeFrom: PipeSource;
  valveSeries: ValveSeries;
  head: string;
  drain: DrainMode;
  dn: (typeof valveDns)[number];
  vent: string;
  drainCock: string;
};

export type RadiatorPlan = { defaults: RadiatorDefaults; rooms: RadiatorRoom[]; notes: string };

const findHead = (re: RegExp) => thermostatHeads.find((h) => re.test(h.text))?.number ?? thermostatHeads[0]?.number ?? NO_HEAD;
const findVent = () => ventValves.find((v) => v.dn === 15)?.number ?? ventValves[0]?.number ?? "";
const findDrainCock = () => drainCocks.find((v) => v.dn === 15)?.number ?? drainCocks[0]?.number ?? "";

export const defaultRadiatorDefaults = (): RadiatorDefaults => ({
  model: "3060",
  connection: "same",
  side: "left",
  pipeFrom: "floor",
  valveSeries: "aq",
  head: findHead(/^Oventrop UNI-LH Thermostatkopf weiss/),
  drain: "return",
  dn: 15,
  vent: findVent(),
  drainCock: findDrainCock(),
});

export const emptyRadiatorPlan = (): RadiatorPlan => ({ defaults: defaultRadiatorDefaults(), rooms: [], notes: "" });

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

export const newRadiator = (patch: Partial<Radiator> = {}): Radiator => ({
  id: newId(),
  label: "",
  share: null,
  model: null,
  size: null,
  connection: null,
  side: null,
  pipeFrom: null,
  connFactor: null,
  valveSeries: null,
  vlForm: null,
  rlForm: null,
  head: null,
  drain: null,
  vent: true,
  ...patch,
});

export const newRadiatorRoom = (patch: Partial<RadiatorRoom> = {}): RadiatorRoom => ({
  id: newId(),
  calcId: null,
  roomId: null,
  groupId: null,
  name: "",
  floor: "",
  load: null,
  roomTemp: null,
  radiators: [newRadiator()],
  ...patch,
});

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export type ModelRef = { series: RadiatorSeries; model: RadiatorModel };
const modelIndex = new Map<string, ModelRef>(radiatorSeries.flatMap((series) => series.models.map((model) => [model.code, { series, model }] as const)));
export const findModel = (code: string | null | undefined): ModelRef | null => (code ? (modelIndex.get(code) ?? null) : null);

/** Length [mm] of a radiator of the model at a size (elements or length). */
export function radiatorLength(ref: ModelRef, size: number): number {
  const { series, model } = ref;
  if (series.unit === "element") return (series.base ?? 0) + (series.pitch ?? 0) * size;
  if (series.unit === "fixed") return model.length ?? size;
  return size;
}

/** Output [W] at the size under the Norm conditions (Φ50). */
export function phi50Of(ref: ModelRef, size: number): number {
  const { series, model } = ref;
  if (series.unit === "element") return model.phi50 * size;
  if (series.unit === "length") return (model.phi50 * size) / 1000;
  return model.phi50;
}

/** Correction to the design temperatures: (ΔT / 50 K)^n with ΔT = (θVL + θRL)/2 − θi; 0 when ΔT ≤ 0. */
export const outputFactor = (n: number, supply: number, ret: number, room: number) => {
  const dT = (supply + ret) / 2 - room;
  return dT > 0 ? (dT / 50) ** n : 0;
};

/** Short text of a model: «Charleston 3060», «Nova Jet ZNXHL-021/014». */
export const modelText = (ref: ModelRef | null) => (ref ? `${ref.series.name.replace(/^Zehnder /, "").replace(/ (horizontal|vertikal)$/, "")} ${ref.model.code}` : "");

/** Zehnder article (head + length in mm) of the size. */
export function radiatorArticle(ref: ModelRef, size: number): MtArticle {
  const length = Math.round(radiatorLength(ref, size));
  const sizeText = ref.series.unit === "element" ? `-${size}` : "";
  return { number: `${ref.model.head}${String(length).padStart(5, "0")}`, text: `Zehnder ${modelText(ref)}${sizeText}, L ${length} mm, H ${ref.model.height} mm` };
}

// ---------------------------------------------------------------------------
// Armatures
// ---------------------------------------------------------------------------

/** Proposed form of the Thermostatventil from the connection and where the pipe comes from. */
export function proposedVlForm(connection: RadiatorConnection, pipeFrom: PipeSource, side: RadiatorSide): ValveForm {
  if (connection === "bottom" || connection === "bottomBoth") return pipeFrom === "floor" ? "durchgang" : "eck";
  if (pipeFrom === "wall") return side === "left" ? "winkeleckL" : "winkeleckR";
  return "eck";
}

/** Proposed form of the Rücklaufverschraubung. */
export function proposedRlForm(connection: RadiatorConnection, pipeFrom: PipeSource): "eck" | "durchgang" {
  if (connection === "bottom" || connection === "bottomBoth") return pipeFrom === "floor" ? "durchgang" : "eck";
  return "eck";
}

const thermoValveFor = (series: ValveSeries, form: ValveForm, dn: number) =>
  thermoValves.find((v) => v.series === series && v.form === form && v.dn === dn) ?? null;

/** Rücklaufverschraubung: Combi 3 (with Entleerung) when the radiator is drained through it, else Combi 2 if listed. */
const returnValveFor = (form: "eck" | "durchgang", dn: number, drain: DrainMode) => {
  const of = (model: string) => returnValves.find((v) => v.model === model && v.form === form && v.dn === dn) ?? null;
  return drain === "separate" ? (of("combi2") ?? of("combi3")) : (of("combi3") ?? of("combi4"));
};

const valveBlockFor = (form: "eck" | "durchgang") => valveBlocks.find((b) => /Multiflex F/.test(b.text) && b.form === form) ?? valveBlocks.find((b) => b.form === form) ?? null;

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** A room of the Wärmebedarf as input. */
export type RadiatorRoomInput = { name: string; floor: string; load: number; roomTemp: number };
/** A Heizgruppe with its design temperatures. */
export type RadiatorGroup = { id: string; name: string; supplyTemp: number | null; returnTemp: number | null };

export type RadiatorWarning = "noModel" | "noTemps" | "noOverTemp" | "tooSmall" | "maxSize" | "noValve" | "noReturnValve" | "noRoom" | "factor";

export type RadiatorResult = {
  id: string;
  roomId: string;
  label: string;
  roomName: string;
  floor: string;
  groupId: string | null;
  /** Effective settings (defaults applied). */
  connection: RadiatorConnection;
  side: RadiatorSide;
  pipeFrom: PipeSource;
  drain: DrainMode;
  vent: boolean;
  ref: ModelRef | null;
  /** Elements / length [mm] (by hand or sized); length of the radiator [mm]. */
  size: number | null;
  sized: boolean;
  length: number | null;
  /** Share of the room load and the required output [W]. */
  share: number;
  load: number;
  /** Design output [W] and factor (ΔT / 50)^n · f_Anschluss. */
  output: number;
  factor: number;
  coverage: number | null;
  massFlow: number;
  supplyTemp: number;
  returnTemp: number;
  roomTemp: number;
  /** Articles: Zehnder radiator, Thermostatventil (or Anschlussarmatur), Rücklaufverschraubung, Kopf, Entlüftung, Entleerung. */
  radiatorArticle: MtArticle | null;
  vlValve: (MtArticle & { form: ValveForm }) | null;
  vlForm: ValveForm;
  rlValve: (MtArticle & { form: "eck" | "durchgang" }) | null;
  rlForm: "eck" | "durchgang";
  valveBlock: MtArticle | null;
  head: MtArticle | null;
  ventValve: MtArticle | null;
  drainCock: MtArticle | null;
  warnings: RadiatorWarning[];
};

export type RadiatorPlanResult = {
  radiators: RadiatorResult[];
  byId: Map<string, RadiatorResult>;
  /** Oventrop Entleerungs- und Füllwerkzeug, once when a Rücklaufverschraubung is used for draining. */
  drainTool: MtArticle | null;
};

const DEFAULT_TEMPS = { supply: 55, ret: 45 };

export function evaluateRadiators(plan: RadiatorPlan, groups: RadiatorGroup[], rooms: (calcId: string, roomId: string) => RadiatorRoomInput | null): RadiatorPlanResult {
  const d = plan.defaults;
  const out: RadiatorResult[] = [];
  let usesDrainTool = false;

  for (const room of plan.rooms) {
    const linked = room.calcId && room.roomId ? rooms(room.calcId, room.roomId) : null;
    const roomLoad = room.load ?? linked?.load ?? 0;
    const roomTemp = room.roomTemp ?? linked?.roomTemp ?? 20;
    const group = groups.find((g) => g.id === room.groupId) ?? null;
    const noTemps = !group || group.supplyTemp === null || group.returnTemp === null || group.supplyTemp <= group.returnTemp;
    const supplyTemp = noTemps ? DEFAULT_TEMPS.supply : group!.supplyTemp!;
    const returnTemp = noTemps ? DEFAULT_TEMPS.ret : group!.returnTemp!;
    const fixedShare = room.radiators.reduce((s, r) => s + (r.share ?? 0), 0);
    const open = room.radiators.filter((r) => r.share === null).length;

    room.radiators.forEach((r, i) => {
      const warnings: RadiatorWarning[] = [];
      if (!linked && room.load === null) warnings.push("noRoom");
      if (noTemps) warnings.push("noTemps");
      const share = r.share ?? (open ? Math.max(0, 1 - fixedShare) / open : 0);
      const load = roomLoad * share;
      const connection = r.connection ?? d.connection;
      const side = r.side ?? d.side;
      const pipeFrom = r.pipeFrom ?? d.pipeFrom;
      const connFactor = r.connFactor ?? 1;
      if (connFactor !== 1 || connection !== "same") warnings.push("factor");
      const ref = findModel(r.model ?? d.model);
      if (!ref) warnings.push("noModel");

      // Output and size.
      const factor = ref ? outputFactor(ref.model.n, supplyTemp, returnTemp, roomTemp) * connFactor : 0;
      if (ref && factor <= 0) warnings.push("noOverTemp");
      let size: number | null = r.size;
      let sized = false;
      if (ref && size === null && factor > 0) {
        const sizes = ref.model.sizes;
        size = sizes.find((s) => phi50Of(ref, s) * factor >= load - 1e-9) ?? null;
        if (size === null) {
          size = sizes[sizes.length - 1] ?? null;
          warnings.push("maxSize");
        }
        sized = true;
      }
      const output = ref && size !== null ? phi50Of(ref, size) * factor : 0;
      if (ref && size !== null && !sized && output < load - 1e-6) warnings.push("tooSmall");

      // Armatures.
      const drain: DrainMode = connection === "bottom" ? "separate" : (r.drain ?? d.drain);
      const series = r.valveSeries ?? d.valveSeries;
      const vlForm = r.vlForm ?? proposedVlForm(connection, pipeFrom, side);
      const rlForm = r.rlForm ?? proposedRlForm(connection, pipeFrom);
      let vlValve: RadiatorResult["vlValve"] = null;
      let rlValve: RadiatorResult["rlValve"] = null;
      let valveBlock: MtArticle | null = null;
      if (connection === "bottom") {
        // Ventilheizkörper: built-in valve insert of the radiator, Anschlussarmatur with shut-off for VL and RL.
        valveBlock = valveBlockFor(rlForm);
      } else {
        vlValve = thermoValveFor(series, vlForm, d.dn);
        if (!vlValve) warnings.push("noValve");
        rlValve = returnValveFor(rlForm, d.dn, drain);
        if (!rlValve) warnings.push("noReturnValve");
        if (drain === "return" && rlValve) usesDrainTool = true;
      }
      const headNo = r.head ?? d.head;
      const head = headNo === NO_HEAD ? null : (thermostatHeads.find((h) => h.number === headNo) ?? null);
      const ventValve = r.vent ? (ventValves.find((v) => v.number === d.vent) ?? null) : null;
      const drainCock = drain === "separate" ? (drainCocks.find((v) => v.number === d.drainCock) ?? null) : null;

      out.push({
        id: r.id,
        roomId: room.id,
        label: r.label || (room.radiators.length > 1 ? `${room.name} ${i + 1}` : room.name) || linked?.name || "",
        roomName: room.name || linked?.name || "",
        floor: room.floor || linked?.floor || "",
        groupId: room.groupId,
        connection,
        side,
        pipeFrom,
        drain,
        vent: r.vent,
        ref,
        size,
        sized,
        length: ref && size !== null ? radiatorLength(ref, size) : null,
        share,
        load,
        output,
        factor,
        coverage: load > 0 ? output / load : null,
        massFlow: (load * 3.6) / (CP_WATER * (supplyTemp - returnTemp)),
        supplyTemp,
        returnTemp,
        roomTemp,
        radiatorArticle: ref && size !== null ? radiatorArticle(ref, size) : null,
        vlValve,
        vlForm,
        rlValve,
        rlForm,
        valveBlock,
        head,
        ventValve,
        drainCock,
        warnings,
      });
    });
  }
  return { radiators: out, byId: new Map(out.map((r) => [r.id, r])), drainTool: usesDrainTool ? drainTool : null };
}
