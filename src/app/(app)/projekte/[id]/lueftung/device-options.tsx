"use client";

import { useTranslations } from "next-intl";

import { NativeSelect } from "@/components/form";
import { availableOptions, type DeviceOptions, type FondOption, type FondSide, normalizeOptions } from "@/lib/kwl/attachments";
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
