"use client";

import { useTranslations } from "next-intl";

import { NativeSelect } from "@/components/form";
import { availableOptions, type DeviceOptions, type FondOption, type FondSide, type Mount, normalizeOptions } from "@/lib/kwl/attachments";
import { controlKeys, controlUnits, filterSets, filterText, interfaceKeys, interfaceTypes, sensorTypes } from "@/lib/kwl/controls";
import type { filterConceptWarnings } from "@/lib/kwl/evaluate";
import type { DeviceCheck } from "@/lib/kwl/network-device";

import { fmt, Notice } from "@/components/planning/fields";

/** Attachments of the selected Zehnder device: enthalpy exchanger, ComfoFond-L Q, ComfoClime. */
export function DeviceOptionsFields({
  deviceKey,
  value,
  disabled,
  idPrefix,
  onChange,
}: {
  deviceKey: string | null;
  value: DeviceOptions;
  disabled: boolean;
  idPrefix: string;
  onChange: (options: DeviceOptions) => void;
}) {
  const t = useTranslations("kwlDevice");
  const available = availableOptions(deviceKey);
  if (!available.erv && !available.fond && !available.clime.length) return null;
  const o = normalizeOptions(deviceKey, value);
  const set = (patch: Partial<DeviceOptions>) => onChange({ ...o, ...patch });

  return (
    <fieldset className="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-lg border p-2.5">
      <legend className="px-1 text-xs text-muted-foreground">{t("attachments")}</legend>
      {available.erv && (
        <label className="flex h-8 items-center gap-2 text-sm">
          <input type="checkbox" checked={o.erv} disabled={disabled} onChange={(e) => set({ erv: e.target.checked })} />
          {t("erv")}
        </label>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {available.fond && (
          <div className="w-48 space-y-1">
            <label htmlFor={`${idPrefix}-fond`} className="text-xs text-muted-foreground">
              {t("fond")}
            </label>
            <NativeSelect id={`${idPrefix}-fond`} value={o.fond} disabled={disabled} onChange={(e) => set({ fond: e.target.value as FondOption })}>
              <option value="none">{t("without")}</option>
              <option value="filter">{t("fondFilter")}</option>
              <option value="noFilter">{t("fondNoFilter")}</option>
            </NativeSelect>
          </div>
        )}
        {available.fond && o.fond !== "none" && (
          <div className="w-48 space-y-1">
            <label htmlFor={`${idPrefix}-fond-side`} className="text-xs text-muted-foreground">
              {t("fondSide")}
            </label>
            <NativeSelect id={`${idPrefix}-fond-side`} value={o.fondSide} disabled={disabled} onChange={(e) => set({ fondSide: e.target.value as FondSide })}>
              <option value="right">{t("fondRight")}</option>
              <option value="left">{t("fondLeft")}</option>
            </NativeSelect>
          </div>
        )}
        {available.clime.length > 0 && (
          <div className="w-48 space-y-1">
            <label htmlFor={`${idPrefix}-clime`} className="text-xs text-muted-foreground">
              {t("clime")}
            </label>
            <NativeSelect id={`${idPrefix}-clime`} value={o.clime ?? ""} disabled={disabled} onChange={(e) => set({ clime: e.target.value || null })}>
              <option value="">{t("without")}</option>
              {available.clime.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
      </div>
    </fieldset>
  );
}

/**
 * ComfoAir Q: filter set (checked against the filter concept of the dwellings), control units, sensors (pieces) and
 * interfaces of a ventilation system. The Option Box for 0-10 V sensors is added automatically.
 */
export function ControlOptionsFields({
  deviceKey,
  value,
  disabled,
  warnings,
  onChange,
}: {
  deviceKey: string | null;
  value: DeviceOptions;
  disabled: boolean;
  warnings: ReturnType<typeof filterConceptWarnings>;
  onChange: (options: DeviceOptions) => void;
}) {
  const t = useTranslations("kwlDevice");
  if (!availableOptions(deviceKey).controls) return null;
  const o = normalizeOptions(deviceKey, value);
  const set = (patch: Partial<DeviceOptions>) => onChange({ ...o, ...patch });
  const needsBox = o.fond === "none" && (o.sensors.rff > 0 || o.sensors.v67 > 0);
  const countField = (label: string, count: number, onCount: (n: number) => void) => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="number"
        min={0}
        max={50}
        value={count}
        disabled={disabled}
        onChange={(e) => onCount(Math.min(50, Math.max(0, Math.round(Number(e.target.value) || 0))))}
        className="h-7 w-14 rounded border border-input bg-field px-1.5 text-right tabular-nums"
      />
      {label}
    </label>
  );
  const mountSelect = (key: "c67" | "v67") => (
    <NativeSelect
      aria-label={t("mount")}
      className="h-7 w-20"
      value={o.sensorMount[key]}
      disabled={disabled}
      onChange={(e) => set({ sensorMount: { ...o.sensorMount, [key]: e.target.value as Mount } })}
    >
      <option value="up">{t("mountUp")}</option>
      <option value="ap">{t("mountAp")}</option>
    </NativeSelect>
  );

  return (
    <fieldset className="space-y-3 rounded-lg border p-2.5">
      <legend className="px-1 text-xs text-muted-foreground">{t("controlsTitle")}</legend>
      <div className="w-72 space-y-1">
        <label htmlFor="system-filter-set" className="text-xs text-muted-foreground">
          {t("filterSet")}
        </label>
        <NativeSelect id="system-filter-set" value={o.filterSet ?? ""} disabled={disabled} onChange={(e) => set({ filterSet: e.target.value })}>
          {filterSets.map((f) => (
            <option key={f.key} value={f.key}>
              {f.name} – {t("filterClasses", { supply: filterText(f.supply), extract: filterText(f.extract) })}
            </option>
          ))}
        </NativeSelect>
      </div>
      {warnings.map((w) => (
        <Notice key={`${w.side}|${w.required}`}>
          {t(w.twoStage ? "filterTwoStage" : "filterMismatch", {
            set: w.set,
            side: t(w.side === "supply" ? "filterSupply" : "filterExtract"),
            actual: w.actual,
            required: w.required,
            dwellings: w.calcs.join(", "),
          })}
        </Notice>
      ))}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t("controlUnits")}</p>
          {controlKeys.map((k) => (
            <div key={k}>{countField(controlUnits[k].name, o.controls[k], (n) => set({ controls: { ...o.controls, [k]: n } }))}</div>
          ))}
          {o.controls.comfoSense + o.controls.comfoSwitch > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={o.surfaceHousing} disabled={disabled} onChange={(e) => set({ surfaceHousing: e.target.checked })} />
              {t("surfaceHousing")}
            </label>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t("sensors")}</p>
          {countField(sensorTypes.rff.name, o.sensors.rff, (n) => set({ sensors: { ...o.sensors, rff: n } }))}
          <div className="flex items-center gap-2">
            {countField(sensorTypes.c67.name, o.sensors.c67, (n) => set({ sensors: { ...o.sensors, c67: n } }))}
            {o.sensors.c67 > 0 && mountSelect("c67")}
          </div>
          <div className="flex items-center gap-2">
            {countField(sensorTypes.v67.name, o.sensors.v67, (n) => set({ sensors: { ...o.sensors, v67: n } }))}
            {o.sensors.v67 > 0 && mountSelect("v67")}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t("interfaces")}</p>
          {interfaceKeys.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={o.interfaces[k]} disabled={disabled} onChange={(e) => set({ interfaces: { ...o.interfaces, [k]: e.target.checked } })} />
              {interfaceTypes[k].name}
              {k === "pro" && <span className="text-xs text-muted-foreground">({t("notYetAvailable")})</span>}
            </label>
          ))}
          {needsBox && <p className="text-xs text-muted-foreground">{t("optionBoxAuto")}</p>}
        </div>
      </div>
    </fieldset>
  );
}

/** What the selected attachments change in the device check. */
export function AttachmentNotes({ check }: { check: DeviceCheck | null }) {
  const t = useTranslations("kwlDevice");
  const a = check?.attachments;
  if (!a || (!a.fond && !a.erv && !a.clime)) return null;
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {a.fond && (
        <p>
          {t("fondInfo", {
            dp: fmt(a.fond.dp, 0),
            pump: fmt(a.fond.pumpW, 0),
            filter: `${a.fond.withFilter ? t("fondFilter") : t("fondNoFilter")}, ${a.fond.side === "left" ? t("fondLeft") : t("fondRight")}`,
          })}
        </p>
      )}
      {a.erv && (
        <p>
          {a.erv.heatRecoveryPct !== null
            ? t("ervInfo", { heat: a.erv.heatRecoveryPct, humidity: a.erv.humidityRecoveryPct ?? "–" })
            : t("ervInfoEn", { temp: a.erv.tempEfficiencyPct ?? "–" })}
        </p>
      )}
      {a.clime && <p>{t("climeInfo", { name: a.clime.name, heating: fmt(a.clime.heatingKW, 1), cooling: fmt(a.clime.coolingKW, 1), power: fmt(a.clime.maxPowerW, 0) })}</p>}
      {check.attachmentFlowWarning && (
        <Notice>
          {t("flowWarning", {
            detail: [
              a.clime && `${a.clime.name} ${a.clime.flowRange[0]}–${a.clime.flowRange[1]} m³/h`,
              a.fond?.maxFlow && `${a.fond.name} ≤ ${a.fond.maxFlow} m³/h`,
            ]
              .filter(Boolean)
              .join(", "),
          })}
        </Notice>
      )}
    </div>
  );
}
