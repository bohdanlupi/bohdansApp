import "server-only";

import { linkedRooms, roomLookup } from "@/lib/heating/links";

import { loadHeatCalcs, loadHeatingPlan } from "../load-plan";
import type { CalcRooms } from "./[systemId]/floor-editor";

/** Heat load calculations with their heated rooms as floor heating input (Qh without the floor loss). */
export async function loadCalcRooms(projectId: string): Promise<{ calcRooms: CalcRooms[]; lookup: ReturnType<typeof roomLookup> }> {
  const [plan, calcs] = await Promise.all([loadHeatingPlan(projectId), loadHeatCalcs(projectId)]);
  const get = linkedRooms(calcs, plan.site, plan.catalog);
  const calcRooms = calcs.map((c) => ({
    id: c.id,
    name: c.name,
    rooms: c.data.rooms.flatMap((r) => {
      const linked = get(c.id, r.id);
      return linked ? [{ id: r.id, label: linked.name, linked }] : [];
    }),
  }));
  return { calcRooms, lookup: roomLookup(get) };
}
