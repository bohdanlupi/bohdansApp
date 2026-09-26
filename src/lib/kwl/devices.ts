// Fan stage curves of the Zehnder units (LUPI dimensioning workbook, sheet "KWL-Gerät"), used for the stage
// selection and the fan diagram only. Device data proper (max. external pressure, power, SPI) comes from the Zehnder
// datasheets (products.ts, zehnder-data.ts), which have priority. Keys = datasheet product keys.
// Each stage: available pressure p = a·V² + b·V + c [Pa] at air flow V [m³/h];
// power = electrical power at that stage [W].

export type FanStage = { stage: number; a: number; b: number; c: number; power: number | null };

export type KwlDevice = {
  id: string;
  name: string;
  /** Chart axis ranges (air flow m³/h, pressure Pa). */
  xMax: number;
  yMax: number;
  /** Highest stage first. */
  stages: FanStage[];
};

const s = (stage: number, a: number, b: number, c: number, power: number | null = null): FanStage => ({ stage, a, b, c, power });

export const kwlDevices: KwlDevice[] = [
  {
    id: "zehnder-comfoair-sl-220",
    name: "Zehnder, ComfoAir SL 220",
    xMax: 400,
    yMax: 450,
    stages: [
      s(9, -0.0016, -0.4122, 381.95, 85),
      s(8, -0.0026, -0.24, 340.7, 66),
      s(7, -0.0023, -0.3219, 289.41, 50),
      s(6, -0.0023, -0.3373, 237.18, 37),
      s(5, -0.002, -0.4867, 199.28, 26),
      s(4, -0.0019, -0.4763, 145.14, 18),
      s(3, -0.0018, -0.5057, 108.03, 13),
      s(2, -0.0017, -0.4547, 71.039, 10),
      s(1, -2e-17, -0.5326, 40.086, 8),
      s(0, -3e-17, -0.416, 19.8, 7),
    ],
  },
  {
    id: "zehnder-comfoair-sl-330",
    name: "Zehnder, ComfoAir SL 330",
    xMax: 500,
    yMax: 1000,
    stages: [
      s(9, -0.001, -1.5633, 926.13, 85),
      s(8, -0.0013, -1.2788, 780.85, 66),
      s(7, -0.0015, -1.0705, 619.52, 50),
      s(6, -0.0019, -0.8278, 475.24, 37),
      s(5, -0.002, -0.6988, 344.31, 26),
      s(4, -0.0018, -0.6515, 239.06, 18),
      s(3, -0.0013, -0.6778, 163.53, 13),
      s(2, -0.0019, -0.5005, 93.38, 10),
    ],
  },
  {
    id: "zehnder-comfoair-q350",
    name: "Zehnder, ComfoAir Q350",
    xMax: 500,
    yMax: 1000,
    stages: [
      s(9, -0.0019, -1.2006, 882.95, 85),
      s(8, -0.0016, -1.0655, 730.18, 66),
      s(7, -0.0012, -1.0881, 595.71, 50),
      s(6, -0.0015, -0.8693, 464, 37),
      s(5, -0.0011, -0.7971, 332, 26),
      s(4, -0.0015, -0.575, 223.75, 18),
      s(3, -0.004, -6e-14, 120, 13),
      s(2, -0.0056, -0.06, 77, 10),
      s(1, -0.0064, -0.24, 20, 8),
    ],
  },
  {
    id: "zehnder-comfoair-q450",
    name: "Zehnder, ComfoAir Q450",
    xMax: 600,
    yMax: 1000,
    stages: [
      s(9, -0.0019, -0.6475, 858.75, 85),
      s(8, -0.0015, -0.7, 755, 66),
      s(7, -0.0017, -0.475, 580, 50),
      s(6, -0.0016, -0.4875, 457.5, 37),
      s(5, -0.0018, -0.31, 319, 26),
      s(4, -0.0015, -0.375, 225, 18),
      s(3, -0.003, -0.05, 130, 13),
      s(2, -0.0044, 0.01, 75.5, 10),
    ],
  },
  {
    id: "zehnder-comfoair-q600",
    name: "Zehnder, ComfoAir Q600",
    xMax: 800,
    yMax: 1000,
    stages: [
      s(9, -0.0016, -0.2011, 846, 85),
      s(8, -0.0018, -0.1721, 764, 66),
      s(7, -0.0019, -0.0329, 583, 50),
      s(6, -0.0023, 0.095, 432.5, 37),
      s(5, -0.002, -0.0119, 320.16, 26),
      s(4, -0.0026, 0.1991, 197.27, 18),
      s(3, -0.0025, -0.005, 136.25, 13),
      s(2, -0.001, -0.25, 85, 10),
    ],
  },
];

export const findDevice = (id: string | null | undefined) => kwlDevices.find((d) => d.id === id) ?? null;
