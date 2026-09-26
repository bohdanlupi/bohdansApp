// Climate stations of SIA 2028 as listed in the LUPI template «384-2_2020_Vorlage.xlsx» (Datenbank): design
// outdoor temperature θe,clm [°C], station altitude [m ü. M.] and annual mean temperature θm,e [°C]. The values can be
// overridden per project (newer SIA 2028 data).

export type ClimateStation = { name: string; thetaE: number; altitude: number; thetaMean: number };

export const climateStations: ClimateStation[] = [
  { name: "Adelboden", thetaE: -10, altitude: 1320, thetaMean: 6.1 },
  { name: "Aigle", thetaE: -6, altitude: 381, thetaMean: 10.1 },
  { name: "Altdorf", thetaE: -6, altitude: 449, thetaMean: 9.9 },
  { name: "Basel-Binningen", thetaE: -7, altitude: 316, thetaMean: 10.5 },
  { name: "Bern-Liebefeld", thetaE: -7, altitude: 565, thetaMean: 9.1 },
  { name: "Buchs-Aarau", thetaE: -7, altitude: 387, thetaMean: 9.7 },
  { name: "Chur", thetaE: -7, altitude: 555, thetaMean: 9.6 },
  { name: "Davos", thetaE: -13, altitude: 1590, thetaMean: 3.6 },
  { name: "Disentis", thetaE: -10, altitude: 1190, thetaMean: 6.7 },
  { name: "Engelberg", thetaE: -11, altitude: 1035, thetaMean: 6.4 },
  { name: "Genève-Cointrin", thetaE: -4, altitude: 420, thetaMean: 10.7 },
  { name: "Glarus", thetaE: -8, altitude: 515, thetaMean: 8.8 },
  { name: "Grand-St-Bernard", thetaE: -15, altitude: 2472, thetaMean: -0.5 },
  { name: "Güttingen", thetaE: -7, altitude: 440, thetaMean: 9.2 },
  { name: "Interlaken", thetaE: -7, altitude: 580, thetaMean: 8.7 },
  { name: "La Chaux-de-Fonds", thetaE: -10, altitude: 1019, thetaMean: 6.5 },
  { name: "La Frétaz", thetaE: -10, altitude: 1202, thetaMean: 6 },
  { name: "Locarno-Monti", thetaE: -1, altitude: 366, thetaMean: 12.3 },
  { name: "Lugano", thetaE: -1, altitude: 273, thetaMean: 12.4 },
  { name: "Luzern", thetaE: -6, altitude: 456, thetaMean: 9.7 },
  { name: "Magadino", thetaE: -3, altitude: 197, thetaMean: 11.7 },
  { name: "Montana", thetaE: -10, altitude: 1508, thetaMean: 5.9 },
  { name: "Neuchâtel", thetaE: -5, altitude: 485, thetaMean: 10.3 },
  { name: "Payerne", thetaE: -7, altitude: 490, thetaMean: 9.4 },
  { name: "Piotta", thetaE: -7, altitude: 1007, thetaMean: 7.8 },
  { name: "Pully", thetaE: -4, altitude: 461, thetaMean: 10.9 },
  { name: "Robbia", thetaE: -8, altitude: 1078, thetaMean: 7 },
  { name: "Rünenberg", thetaE: -8, altitude: 610, thetaMean: 9.1 },
  { name: "Samedan", thetaE: -18, altitude: 1705, thetaMean: 1.8 },
  { name: "San Bernardino", thetaE: -11, altitude: 1639, thetaMean: 3.9 },
  { name: "St. Gallen", thetaE: -9, altitude: 779, thetaMean: 8.2 },
  { name: "Schaffhausen", thetaE: -8, altitude: 437, thetaMean: 9.4 },
  { name: "Scuol", thetaE: -12, altitude: 1298, thetaMean: 5.5 },
  { name: "Sion", thetaE: -6, altitude: 482, thetaMean: 10.1 },
  { name: "Ulrichen", thetaE: -16, altitude: 1345, thetaMean: 3.7 },
  { name: "Vaduz", thetaE: -8, altitude: 460, thetaMean: 10 },
  { name: "Wynau", thetaE: -7, altitude: 422, thetaMean: 9 },
  { name: "Zermatt", thetaE: -11, altitude: 1638, thetaMean: 4.3 },
  { name: "Zürich-Kloten", thetaE: -8, altitude: 425, thetaMean: 9.4 },
  { name: "Zürich-MeteoSchweiz", thetaE: -8, altitude: 556, thetaMean: 9.4 },
];

export const findStation = (name: string | null | undefined) => climateStations.find((s) => s.name === name) ?? null;
