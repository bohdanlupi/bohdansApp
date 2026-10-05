import type { EmitterType, GeneratorType, HeatingParams } from "./plan-schema";
import type { PlantData } from "./plant-schema";

/**
 * Parameters that filter the SIA 108 checklists, taken from the chapters: generators, cooling and storage from the
 * Anlagen (242), emitters from their Heizgruppen and the floor heating systems (243), power from the heat load
 * calculations; the building data (type, construction, standard, EBF, several units) from 242 Wärmeerzeugung
 * (heating_plans.params).
 */
export function effectiveHeatingParams(
  building: HeatingParams,
  plants: { data: PlantData }[],
  floorSystems: number,
  /** Building heat loads of the calculations [W]. */
  heatLoads: number[],
): HeatingParams {
  const generators = [...new Set(plants.flatMap((p) => p.data.generators))] as GeneratorType[];
  const fromGroups = plants.flatMap((p) => p.data.groups.flatMap((g) => (g.emitter ? [g.emitter] : [])));
  const emitters = [...new Set<EmitterType>([...(floorSystems > 0 ? ["floor" as const] : []), ...fromGroups])];
  const total = heatLoads.reduce((s, w) => s + w, 0);
  return {
    ...building,
    generators,
    emitters,
    storage: plants.some((p) => p.data.storage),
    cooling: plants.some((p) => p.data.cooling),
    power: total > 0 ? Math.round(total / 100) / 10 : building.power,
  };
}
