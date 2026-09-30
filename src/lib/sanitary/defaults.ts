import { newNode, type SanNode } from "./network";

/**
 * Starting network of a multi-family house: a Verteilleitung in the basement with two Stränge (Zirkulation
 * konventionell / Rohr an Rohr), per storey an apartment (Optiflex Stockwerkverteilung with Wohnungswasserzähler,
 * bathroom and kitchen). Everything is edited afterwards.
 */
export function exampleNetwork(labels: { section: (n: number) => string; apartment: (floor: string, strang: number) => string }): SanNode[] {
  const floors = ["EG", "1.OG", "2.OG"];
  const strang = (n: number, circulation: "conventional" | "rar") => {
    let chain: SanNode | null = null;
    for (let i = floors.length - 1; i >= 0; i--) {
      const floor = floors[i];
      const apartment = newNode("pipe", {
        floor,
        length: 8,
        system: "optiflex",
        meter: true,
        children: [newNode("consumer", { label: labels.apartment(floor, n), floor, appliances: { wc: 1, basin: 1, shower: 1, dishwasher: 1, washer: 1 } })],
      });
      chain = newNode("pipe", { floor, length: i === 0 ? 4 : 3, riser: true, circulation, children: chain ? [apartment, chain] : [apartment] });
    }
    return chain!;
  };
  return [
    newNode("pipe", {
      label: labels.section(1),
      length: 8,
      circulation: "conventional",
      children: [strang(1, "conventional"), newNode("pipe", { label: labels.section(2), length: 6, circulation: "conventional", children: [strang(2, "rar")] })],
    }),
  ];
}
