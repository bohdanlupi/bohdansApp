"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { NativeSelect } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { normalizeOptions } from "@/lib/kwl/attachments";
import { spiLimit, spiTarget } from "@/lib/kwl/calc";
import type { DeviceCheck } from "@/lib/kwl/network-device";
import type { PlanParams } from "@/lib/kwl/plan-schema";
import { datasheetDevice, productsOfKind } from "@/lib/kwl/products";
import type { KwlData } from "@/lib/kwl/schema";
import { externalPressureCheck } from "@/lib/kwl/sia3825";

import { AttachmentNotes, DeviceOptionsFields } from "../../device-options";
import { fmt, Notice, NumberField, Result, Section } from "../../fields";

/** SIA 382/5 Table 7: external pressure drop AUL → ZUL + ABL → FOL, examples of footnotes 1) and 2). */
const pressurePresets = [
  { key: "limit", supply: 80, extract: 70 },
  { key: "target", supply: 50, extract: 50 },
] as const;

const zehnderDevices = productsOfKind("device");

export function DeviceTab({
  device: input,
  result,
  datasheet,
  supplyFlow,
  extractFlow,
  planParams,
  drops,
  projectId,
  editable,
  onChange,
}: {
  device: KwlData["device"];
  result: { spi: number | null; spiFromInput: boolean };
  datasheet: DeviceCheck | null;
  supplyFlow: number;
  extractFlow: number;
  planParams: PlanParams;
  /** Effective external pressure drops (manual or from the duct network). */
  drops: {
    supply: number | null;
    extract: number | null;
    given: { supply: number | null; extract: number | null };
    fond: number | null;
    source: "manual" | "system";
    system: { systemId: string; name: string } | null;
  };
  projectId: string;
  editable: boolean;
  onChange: (device: KwlData["device"]) => void;
}) {
  const t = useTranslations("kwl");
  const tDevice = useTranslations("kwlDevice");
  const product = datasheetDevice(input.id);
  const { spi } = result;
  const fromNetwork = drops.source === "system";
  const totalDrop = drops.supply !== null || drops.extract !== null ? (drops.supply ?? 0) + (drops.extract ?? 0) : null;
  const pressure = externalPressureCheck(planParams.system, planParams.operation === "demand", totalDrop);
  const spiTone = spi === null ? undefined : spi < spiTarget ? "ok" : spi < spiLimit ? "warn" : "bad";

  return (
    <div className="space-y-4">
      <Section title={t("device.title")} description={t("device.description")}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="kwl-device">{t("device.device")}</Label>
            <NativeSelect
              id="kwl-device"
              value={input.id ?? ""}
              disabled={!editable}
              onChange={(e) => onChange({ ...input, id: e.target.value || null, options: normalizeOptions(e.target.value || null, input.options) })}
            >
              <option value="">{t("device.none")}</option>
              <optgroup label="Zehnder">
                {zehnderDevices.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            </NativeSelect>
            <DeviceOptionsFields deviceKey={product?.key ?? null} value={input.options} disabled={!editable} idPrefix="kwl" onChange={(options) => onChange({ ...input, options })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kwl-power">{t("device.power")}</Label>
            <NumberField
              id="kwl-power"
              value={input.power}
              decimals={1}
              label={t("device.power")}
              disabled={!editable}
              placeholder={t("device.powerPlaceholder")}
              onChange={(power) => onChange({ ...input, power })}
              className="h-8 max-w-40 rounded-lg"
            />
            <p className="text-xs text-muted-foreground">{t("device.powerHint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="kwl-supply-drop">{t("device.supplyDrop")}</Label>
            <NumberField id="kwl-supply-drop" value={fromNetwork ? drops.given.supply : input.supplyDrop} decimals={0} label={t("device.supplyDrop")} disabled={!editable || fromNetwork} onChange={(supplyDrop) => onChange({ ...input, supplyDrop })} className="h-8 max-w-40 rounded-lg" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kwl-extract-drop">{t("device.extractDrop")}</Label>
            <NumberField id="kwl-extract-drop" value={fromNetwork ? drops.given.extract : input.extractDrop} decimals={0} label={t("device.extractDrop")} disabled={!editable || fromNetwork} onChange={(extractDrop) => onChange({ ...input, extractDrop })} className="h-8 max-w-40 rounded-lg" />
          </div>
        </div>
        {drops.fond !== null && <p className="text-xs text-muted-foreground">{tDevice("inclFond", { dp: fmt(drops.fond, 0), total: fmt(drops.supply, 0) })}</p>}
        {fromNetwork && drops.system && (
          <Notice tone="info">
            {t("device.fromSystem", { name: drops.system.name })}{" "}
            <Link href={`/projekte/${projectId}/lueftung/anlagen/${drops.system.systemId}`} className="underline">
              {t("device.openSystem")}
            </Link>
          </Notice>
        )}
        {editable && !fromNetwork && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("device.presets")}</span>
            {pressurePresets.map((p) => (
              <Button
                key={p.key}
                variant="outline"
                size="sm"
                onClick={() => onChange({ ...input, supplyDrop: p.supply, extractDrop: p.extract })}
              >
                {t(`device.preset.${p.key}`, { supply: p.supply, extract: p.extract })}
              </Button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t("device.dropHint")}</p>
        {pressure.status !== null && (
          <Notice tone={pressure.status === "exceeded" ? "warn" : "info"}>
            {t(`device.pressure.${pressure.status}`, { total: fmt(totalDrop), limit: pressure.limit, target: pressure.target })}
          </Notice>
        )}
      </Section>

      {!product ? (
        <Notice tone="info">{t("device.choose")}</Notice>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Result
              label={t("device.spi")}
              value={fmt(spi, 2)}
              unit={t("device.spiUnit")}
              tone={spiTone}
              hint={spi === null ? t("device.spiUnknown") : t("device.spiLimits", { limit: fmt(spiLimit, 2), target: fmt(spiTarget, 2) })}
            />
            <Result
              label={t("device.spiCheck")}
              value={spi === null ? "" : `${spi < spiLimit ? t("yes") : t("no")} / ${spi < spiTarget ? t("yes") : t("no")}`}
              tone={spiTone}
              hint={t("device.spiCheckHint")}
            />
          </div>
          {result.spiFromInput && <p className="text-xs text-muted-foreground">{t("device.spiFromInput")}</p>}
          {datasheet?.source === "datasheet" && (
            <div className="space-y-2 rounded-xl border p-3">
              <div>
                <h3 className="text-sm font-semibold">{t("device.datasheet.title", { name: datasheet.name ?? "" })}</h3>
                <p className="text-xs text-muted-foreground">{t("device.datasheet.hint")}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(["supply", "extract"] as const).map((side) => (
                  <Result
                    key={side}
                    label={t(`device.datasheet.${side}`)}
                    value={fmt(datasheet[side].maxPressure, 0)}
                    unit="Pa"
                    tone={datasheet[side].ok === null ? undefined : datasheet[side].ok ? "ok" : "bad"}
                    hint={t("device.datasheet.sideHint", { flow: fmt(datasheet[side].flow), dp: fmt(datasheet[side].dp, 0) })}
                  />
                ))}
                <Result label={t("device.datasheet.power")} value={fmt(datasheet.powerW, 0)} unit="W" />
                <Result
                  label={t("device.spi")}
                  value={fmt(datasheet.spi, 2)}
                  unit={t("device.spiUnit")}
                  tone={datasheet.spiStatus === null ? undefined : datasheet.spiStatus === "target" ? "ok" : datasheet.spiStatus === "limit" ? "warn" : "bad"}
                />
              </div>
              <AttachmentNotes check={datasheet} />
              {(datasheet.supply.ok === false || datasheet.extract.ok === false) && <Notice>{t("device.datasheet.tooSmall")}</Notice>}
            </div>
          )}
          {(!supplyFlow || !extractFlow) && <Notice>{t("device.noFlows")}</Notice>}

        </>
      )}
    </div>
  );
}
