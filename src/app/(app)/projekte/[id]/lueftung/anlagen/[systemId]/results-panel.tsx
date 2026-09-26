"use client";

import { useTranslations } from "next-intl";

import { type RoomFlow, type SystemData, type SystemResult, systemChecks } from "@/lib/kwl/network";
import type { DeviceCheck } from "@/lib/kwl/network-device";
import type { PlanParams } from "@/lib/kwl/plan-schema";
import { externalPressureCheck } from "@/lib/kwl/sia3825";
import { cn } from "@/lib/utils";

import { AttachmentNotes } from "../../device-options";
import { fmt, Notice, Result } from "../../fields";

export function ResultsPanel({
  result,
  device,
  rooms,
  data,
  planParams,
}: {
  result: SystemResult;
  device: DeviceCheck;
  rooms: RoomFlow[];
  data: SystemData;
  planParams: PlanParams;
}) {
  const t = useTranslations("kwlSystem");
  // ComfoFond-L Q in the outdoor air: its pressure drop belongs to the external pressure on the supply side.
  const fondDp = device.attachments?.fond?.dp ?? null;
  const supplyTotal = result.external.supply !== null || fondDp !== null ? (result.external.supply ?? 0) + (fondDp ?? 0) : null;
  const total = supplyTotal !== null || result.external.extract !== null ? (supplyTotal ?? 0) + (result.external.extract ?? 0) : null;
  const table7 = externalPressureCheck(planParams.system, planParams.operation === "demand", total);
  const tone = (s: string | null) => (s === null ? undefined : s === "target" ? "ok" : s === "limit" ? "warn" : "bad");
  const sideTone = (ok: boolean | null) => (ok === null ? undefined : ok ? "ok" : "bad");

  const checks = systemChecks(data, rooms, result);
  const missing = checks.missing.map((m) => `${m.room} (${t(`air.${m.side}`)})`);
  const { fast, noData } = checks;

  const above = checks.overRange;

  return (
    <section className="space-y-3 rounded-xl border p-3">
      <h2 className="font-semibold">{t("results")}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Result
          label={t("externalSupply")}
          value={fmt(supplyTotal, 0)}
          unit="Pa"
          tone={sideTone(device.supply.ok)}
          hint={t("sideHint", { flow: fmt(result.supply.flow), max: device.supply.maxPressure === null ? "–" : fmt(device.supply.maxPressure) })}
        />
        <Result
          label={t("externalExtract")}
          value={fmt(result.external.extract, 0)}
          unit="Pa"
          tone={sideTone(device.extract.ok)}
          hint={t("sideHint", { flow: fmt(result.extract.flow), max: device.extract.maxPressure === null ? "–" : fmt(device.extract.maxPressure) })}
        />
        <Result
          label={t("sumExternal")}
          value={fmt(total, 0)}
          unit="Pa"
          tone={tone(table7.status)}
          hint={table7.limit ? t("table7", { limit: table7.limit, target: table7.target }) : undefined}
        />
        <Result
          label={t("spi")}
          value={fmt(device.spi, 2)}
          unit="W/(m³/h)"
          tone={tone(device.spiStatus)}
          hint={device.powerW !== null ? t("power", { w: fmt(device.powerW, 0) }) : device.source ? undefined : t("chooseDevice")}
        />
      </div>
      <AttachmentNotes check={device} />
      {device.source === "datasheet" && (device.supply.ok === false || device.extract.ok === false) && <Notice>{t("deviceTooSmall")}</Notice>}
      {missing.length > 0 && <Notice>{t("missingTerminals", { rooms: missing.join(", ") })}</Notice>}
      {fast > 0 && <Notice>{t("tooFast", { count: fast })}</Notice>}
      {above.length > 0 && (
        <Notice>{t("overRange", { items: above.map((a) => `${a.label} ${fmt(a.flow)}/${fmt(a.max)} m³/h`).join(", ") })}</Notice>
      )}
      {noData > 0 && <Notice tone="info">{t("noDataHint", { count: noData })}</Notice>}

      {(result.supply.leaves.length > 0 || result.extract.leaves.length > 0) && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">{t("paths")}</summary>
          <div className="mt-2 grid gap-4 lg:grid-cols-2">
            {(["supply", "extract"] as const).map((side) => (
              <table key={side} className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-1 text-left font-medium">{t(`air.${side}`)}</th>
                    <th className="px-2 text-right font-medium">m³/h</th>
                    <th className="px-2 text-right font-medium">{t("pathPa")}</th>
                    <th className="text-right font-medium">{t("throttle")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result[side].leaves.map((l) => (
                    <tr key={l.id} className={cn("border-b last:border-0", l.id === result[side].criticalLeaf && "font-semibold")}>
                      <td className="py-1">{l.roomLabel}</td>
                      <td className="px-2 text-right tabular-nums">{fmt(l.flow)}</td>
                      <td className="px-2 text-right tabular-nums">{fmt(l.path, 1) || "0"}</td>
                      <td className="text-right text-muted-foreground tabular-nums">{l.throttle > 0.05 ? fmt(l.throttle, 1) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("pathsHint")}</p>
        </details>
      )}
    </section>
  );
}
