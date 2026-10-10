import "server-only";

import { type CalcOption, type FloorOption, radiatorOptions } from "@/lib/heating/distribution-inputs";
import { evaluateFloor } from "@/lib/heating/floor";
import { evaluateSite } from "@/lib/heating/heat-load";
import { linkedRooms, roomLookup } from "@/lib/heating/links";
import { parseRadiatorPlan } from "@/lib/heating/radiator-schema";
import { evaluateRadiators } from "@/lib/heating/radiators";
import { createClient } from "@/lib/supabase/server";

import { loadHeatCalcs, loadHeatingPlan, loadHeatingPlants, loadHeatingSystems, type LoadedPlant } from "../../load-plan";

export type { CalcOption, FloorOption, RadiatorInputs, RadiatorOption } from "@/lib/heating/distribution-inputs";

/**
 * Inputs of the Strangschema of an Anlage, for the page and its PDF: rooms of the Wärmebedarf, the configured
 * Heizkörper of the Anlage (243 Heizkörper, evaluated), the Fussbodenheizungs-Verteiler of the Anlage (systems without an Anlage count to the first one), the Norm-
 * Aussentemperatur of the site.
 */
export async function loadDistributionInputs(projectId: string, plant: Pick<LoadedPlant, "id">) {
  const supabase = await createClient();
  const [plan, plants, calcs, systems, { data: row }] = await Promise.all([
    loadHeatingPlan(projectId),
    loadHeatingPlants(projectId),
    loadHeatCalcs(projectId),
    loadHeatingSystems(projectId),
    supabase.from("heating_plants").select("radiators").eq("id", plant.id).maybeSingle(),
  ]);
  const get = linkedRooms(calcs, plan.site, plan.catalog);
  const rooms: CalcOption[] = calcs.map((c) => ({
    id: c.id,
    name: c.name,
    rooms: c.data.rooms.flatMap((r) => {
      const linked = get(c.id, r.id);
      return linked ? [{ id: r.id, label: linked.name, floor: r.floor, load: linked.load, roomTemp: linked.roomTemp }] : [];
    }),
  }));
  const lookup = roomLookup(get);
  const floors: FloorOption[] = systems
    .filter((s) => s.data.plantId === plant.id || (s.data.plantId === null && plants[0]?.id === plant.id))
    .flatMap((s) => {
      const result = evaluateFloor(s.data, lookup);
      return s.data.distributors.map((d, i) => ({
        systemId: s.id,
        systemName: s.name,
        id: d.id,
        name: d.name,
        groupId: d.groupId,
        total: result.distributors[i].total,
        massFlow: result.distributors[i].massFlow,
        maxPressure: result.distributors[i].maxPressure,
        rings: result.distributors[i].rings,
      }));
    });
  const roomMap = new Map(rooms.flatMap((c) => c.rooms.map((r) => [`${c.id}:${r.id}`, { name: r.label, floor: r.floor, load: r.load, roomTemp: r.roomTemp }] as const)));
  const groups = plants.find((p) => p.id === plant.id)?.data.groups ?? [];
  const radiators = radiatorOptions(evaluateRadiators(parseRadiatorPlan(row?.radiators), groups, (calcId, roomId) => roomMap.get(`${calcId}:${roomId}`) ?? null));
  return { rooms, floors, radiators, outsideTemp: evaluateSite(plan.site).thetaE0 };
}

