import "server-only";

import type { CalcOption, FloorOption } from "@/lib/heating/distribution-inputs";
import { evaluateFloor } from "@/lib/heating/floor";
import { evaluateSite } from "@/lib/heating/heat-load";
import { linkedRooms, roomLookup } from "@/lib/heating/links";

import { loadHeatCalcs, loadHeatingPlan, loadHeatingPlants, loadHeatingSystems, type LoadedPlant } from "../../load-plan";

export type { CalcOption, FloorOption } from "@/lib/heating/distribution-inputs";

/**
 * Inputs of the Strangschema of an Anlage, for the page and its PDF: rooms of the Wärmebedarf, the
 * Fussbodenheizungs-Verteiler of the Anlage (systems without an Anlage count to the first one), the Norm-
 * Aussentemperatur of the site.
 */
export async function loadDistributionInputs(projectId: string, plant: Pick<LoadedPlant, "id">) {
  const [plan, plants, calcs, systems] = await Promise.all([loadHeatingPlan(projectId), loadHeatingPlants(projectId), loadHeatCalcs(projectId), loadHeatingSystems(projectId)]);
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
  return { rooms, floors, outsideTemp: evaluateSite(plan.site).thetaE0 };
}

