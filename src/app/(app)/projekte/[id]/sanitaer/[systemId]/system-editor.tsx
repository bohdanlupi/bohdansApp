"use client";

import { Save, Trash2, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/confirm-button";
import { type FormMessageKey, NativeSelect } from "@/components/form";
import { fmt, Notice, NumberField, Result, Section } from "@/components/planning/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SchemaPlan } from "@/lib/kwl/schema-plan";
import { biralPumps } from "@/lib/sanitary/catalog-data";
import { exampleNetwork } from "@/lib/sanitary/defaults";
import { type Central, evaluateSystem, findNode, type SanitaryData, type Settings, type SystemResult, type Warning } from "@/lib/sanitary/network";
import { insulationMaterials, insulationStyle, sizeText } from "@/lib/sanitary/pipes";
import { systemQuantities } from "@/lib/sanitary/quantities";
import { layoutSchema } from "@/lib/sanitary/schema";

import type { LvWithChapters } from "../../lueftung/anlagen/[systemId]/quantities-panel";
import { SchemaPrintButton } from "../../lueftung/anlagen/[systemId]/schema-print-dialog";
import { deleteSanitarySystem, saveSanitarySchemaPlan, saveSanitarySystem } from "../actions";
import { SanitaryQuantitiesPanel } from "./quantities-panel";
import { SanitarySchemaView } from "./schema-view";
import { TreeEditor } from "./tree-editor";

export function SanitaryEditor({
  id,
  projectId,
  initialName,
  initialData,
  schemaPlan,
  lvs,
  editable,
}: {
  id: string;
  projectId: string;
  initialName: string;
  initialData: SanitaryData;
  schemaPlan: SchemaPlan;
  lvs: LvWithChapters[];
  editable: boolean;
}) {
  const t = useTranslations("sanitary");
  const tForms = useTranslations("forms");
  const [name, setName] = useState(initialName);
  const [data, setData] = useState(initialData);
  const [saved, setSaved] = useState({ name: initialName, data: initialData });
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = name !== saved.name || data !== saved.data;

  const result = useMemo(() => evaluateSystem(data), [data]);
  const schemaText = {
    kw: t("schemaText.kw"),
    ww: t("schemaText.ww"),
    zk: t("schemaText.zk"),
    insulation: t("schemaText.insulation"),
    none: t("schemaText.none"),
    inShared: t("schemaText.inShared"),
    material: t(`schemaText.materials.${data.settings.insulationMaterial}`),
    strang: t("schemaText.strang"),
    heater: t("schemaText.heater"),
    house: t("schemaText.house"),
    meter: t("schemaText.meter"),
    battery: t("schemaText.battery"),
    softener: t("schemaText.softener"),
    lu: "LU",
  };
  const schema = useMemo(() => layoutSchema(data, result, schemaText), [data, result]); // eslint-disable-line react-hooks/exhaustive-deps
  const quantities = useMemo(() => systemQuantities(data, result), [data, result]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = () =>
    startTransition(async () => {
      const res = await saveSanitarySystem(id, projectId, name, data);
      if (res.error) toast.error(tForms(res.error as FormMessageKey));
      else {
        setSaved({ name, data });
        toast.success(tForms("saved"));
      }
    });
  const setCentral = (p: Partial<Central>) => setData((d) => ({ ...d, central: { ...d.central, ...p } }));
  const setSettings = (p: Partial<Settings>) => setData((d) => ({ ...d, settings: { ...d.settings, ...p } }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-sm space-y-1">
          <label htmlFor="sanitary-system-name" className="text-xs text-muted-foreground">
            {t("name")}
          </label>
          <Input id="sanitary-system-name" value={name} maxLength={200} disabled={!editable} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <SchemaPrintButton
            systemId={id}
            projectId={projectId}
            plan={schemaPlan}
            editable={editable}
            dirty={dirty}
            url={`/api/pdf/sanitary-schema/${id}`}
            save={saveSanitarySchemaPlan}
          />
          {editable && (
            <>
              <ConfirmButton
                variant="outline"
                label={t("delete")}
                trigger={<Trash2 />}
                title={t("deleteTitle")}
                text={t("deleteText", { name })}
                confirmLabel={t("delete")}
                onConfirm={() => deleteSanitarySystem(id, projectId)}
              />
              <Button onClick={save} disabled={!dirty || pending || !name.trim()}>
                <Save />
                {dirty ? t("save") : t("saved")}
              </Button>
            </>
          )}
        </div>
      </div>

      {data.network.length === 0 && editable && (
        <Notice tone="info">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{t("emptyNetwork")}</span>
            <Button
              size="sm"
              onClick={() =>
                setData((d) => ({
                  ...d,
                  network: exampleNetwork({ section: (n) => t("example.section", { n }), apartment: (floor, n) => t("example.apartment", { floor, n }) }),
                }))
              }
            >
              <Wand2 />
              {t("createExample")}
            </Button>
          </div>
        </Notice>
      )}

      {/* Zentrale, Zirkulation and Berechnung together above the Schema. */}
      <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <CentralForm central={data.central} result={result} editable={editable} onChange={setCentral} />
        <SettingsForm settings={data.settings} editable={editable} onChange={setSettings} />
        <div className="lg:col-span-2 2xl:col-span-1">
          <ResultsPanel data={data} result={result} editable={editable} onPump={(pump) => setSettings({ pump })} />
        </div>
      </div>

      {/* Prinzipschema with the Verteilung below it and the element panel («Leitung») to their right. */}
      <TreeEditor
        network={data.network}
        result={result}
        selected={selected}
        editable={editable}
        onSelect={setSelected}
        onChange={(fn) => setData((d) => ({ ...d, network: fn(d.network) }))}
        top={
          data.network.length > 0 && (
            <section className="min-w-0 space-y-2 rounded-xl border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">{t("schema")}</h2>
                <p className="text-xs text-muted-foreground">{t("schemaHint")}</p>
              </div>
              <SanitarySchemaView schema={schema} selected={selected} label={name} onSelect={setSelected} />
              {schema.insulated && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block h-2.5 w-6 rounded-sm border border-dotted" style={{ backgroundColor: insulationStyle.fill, borderColor: insulationStyle.edge }} />
                  {t("legend.insulationBand")}
                </p>
              )}
            </section>
          )
        }
      />
      <SanitaryQuantitiesPanel quantities={quantities} systemId={id} projectId={projectId} systemName={name} lvs={lvs} dirty={dirty} editable={editable} />
    </div>
  );
}

function ResultsPanel({ data, result, editable, onPump }: { data: SanitaryData; result: SystemResult; editable: boolean; onPump: (pump: string | null) => void }) {
  const t = useTranslations("sanitary.results");
  const tw = useTranslations("sanitary.warnings");
  const labelOf = (nodeId: string) => {
    const n = findNode(data.network, nodeId);
    const r = result.pipes.get(nodeId);
    return n?.label || (r?.strang ? `${t("strang")} ${r.strang}` : [n?.floor, n?.length ? `${fmt(n.length, 1)} m` : ""].filter(Boolean).join(" · ") || "–");
  };
  const warning = (w: Warning) => {
    switch (w.kind) {
      case "fast":
        return tw("fast", { element: labelOf(w.id), medium: w.medium.toUpperCase(), v: fmt(w.velocity, 2), limit: fmt(w.limit, 1) });
      case "tableExceeded":
        return tw("tableExceeded", { element: labelOf(w.id), medium: w.medium.toUpperCase() });
      case "circulationGap":
        return tw("circulationGap", { element: labelOf(w.id) });
      case "deltaT":
        return tw("deltaT", { value: fmt(w.value, 1) });
      case "pumpHead":
        return tw("pumpHead", { head: fmt(w.head, 0) });
      default:
        return tw(w.kind);
    }
  };
  // Table overruns are listed once per element.
  const warnings = [...new Map(result.warnings.map((w) => [warning(w), w])).keys()];
  const pump = result.pump;

  return (
    <Section title={t("title")}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Result label={t("lu")} value={`${result.lu.cold} / ${result.lu.warm}`} />
        <Result label={t("qd")} value={fmt(result.qd.total, 2)} unit="l/s" hint={`${fmt(result.qd.cold, 2)} / ${fmt(result.qd.warm, 2)} l/s`} />
        <Result label={t("houseDn")} value={result.house.dn ? `DN ${result.house.dn}` : ""} hint={t("houseHint")} />
        <Result label={t("distLength")} value={fmt(result.distLength, 1)} unit="m" hint={t("distHint")} />
        <Result label={t("heatLoss")} value={pump ? fmt(pump.heatLoss, 2) : ""} unit="kWh/d" />
        <Result label={t("pumpFlow")} value={pump ? fmt(pump.flow, 0) : ""} unit="l/h" />
        <Result label={t("critical")} value={pump ? fmt(pump.critical, 0) : ""} unit="mbar" />
        <Result label={t("head")} value={pump ? fmt(pump.head, 0) : ""} unit="mbar" tone={pump && !pump.ok ? "bad" : undefined} hint={t("headHint", { check: fmt(data.settings.dpCheck, 0), valve: fmt(data.settings.dpValve, 0) })} />
      </div>
      {pump && (
        <div className="space-y-1">
          <Label htmlFor="sanitary-pump" className="text-xs">
            {t("pump")}
          </Label>
          <NativeSelect id="sanitary-pump" value={data.settings.pump ?? ""} disabled={!editable} onChange={(e) => onPump(e.target.value || null)}>
            <option value="">{t("pumpAuto", { name: pump.suggested?.name ?? "–" })}</option>
            {biralPumps.map((p) => (
              <option key={p.number} value={p.number}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">{t("pumpHint")}</p>
        </div>
      )}
      {warnings.length > 0 && (
        <Notice>
          <ul className="list-disc space-y-0.5 pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}
      {result.circuits.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1 font-normal">{t("circuit")}</th>
              <th className="py-1 text-right font-normal">{t("circFlow")}</th>
              <th className="py-1 text-right font-normal">Δp</th>
              <th className="py-1 text-right font-normal">{t("throttle")}</th>
            </tr>
          </thead>
          <tbody>
            {result.circuits.map((c) => (
              <tr key={c.endId} className="border-b last:border-0">
                <td className="py-1">{labelOf(c.footId ?? c.endId)}</td>
                <td className="py-1 text-right tabular-nums">{fmt(c.flow, 1)} l/h</td>
                <td className="py-1 text-right tabular-nums">{fmt(c.path, 1)} mbar</td>
                <td className="py-1 text-right tabular-nums">{c.throttle > 0.05 ? `${fmt(c.throttle, 1)} mbar` : t("criticalCircuit")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function CentralForm({ central, result, editable, onChange }: { central: Central; result: SystemResult; editable: boolean; onChange: (p: Partial<Central>) => void }) {
  const t = useTranslations("sanitary.central");
  const check = (key: "meter" | "reducer" | "safetyGroup" | "mixer", label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={central[key]} disabled={!editable || (key === "reducer" && central.filter === "redfil")} onChange={(e) => onChange({ [key]: e.target.checked })} className="size-4 accent-brand" />
      {label}
    </label>
  );
  const number = (key: "houseLength" | "centralLength" | "trunkLength" | "heaterLength" | "heaterVolume", label: string, decimals = 1) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <NumberField value={central[key]} decimals={decimals} label={label} disabled={!editable} onChange={(v) => onChange({ [key]: v })} className="h-8 rounded-lg" />
    </div>
  );
  return (
    <Section title={t("title")} description={t("description")}>
      <div className="grid grid-cols-2 gap-2">
        {number("houseLength", t("houseLength"))}
        {number("centralLength", t("centralLength"))}
        {number("trunkLength", t("trunkLength"))}
        {number("heaterLength", t("heaterLength"))}
        <div className="space-y-1">
          <Label htmlFor="central-filter" className="text-xs">
            {t("filter")}
          </Label>
          <NativeSelect id="central-filter" value={central.filter} disabled={!editable} onChange={(e) => onChange({ filter: e.target.value as Central["filter"] })}>
            {(["none", "fine", "redfil"] as const).map((f) => (
              <option key={f} value={f}>
                {t(`filters.${f}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="central-softener" className="text-xs">
            {t("softener")}
          </Label>
          <NativeSelect id="central-softener" value={central.softener} disabled={!editable} onChange={(e) => onChange({ softener: e.target.value as Central["softener"] })}>
            {(["none", "heater", "all"] as const).map((f) => (
              <option key={f} value={f}>
                {t(`softeners.${f}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="central-heater" className="text-xs">
            {t("heaterLabel")}
          </Label>
          <input
            id="central-heater"
            defaultValue={central.heaterLabel}
            maxLength={80}
            placeholder={t("heaterPlaceholder")}
            disabled={!editable}
            onBlur={(e) => e.target.value !== central.heaterLabel && onChange({ heaterLabel: e.target.value.trim() })}
            className="h-8 w-full rounded-lg border border-input bg-field px-2.5 text-sm outline-none focus:border-ring"
          />
        </div>
        {number("heaterVolume", t("heaterVolume"), 0)}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {check("meter", t("meter"))}
        {check("reducer", t("reducer"))}
        {check("safetyGroup", t("safetyGroup"))}
        {check("mixer", t("mixer"))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("sizes", {
          trunk: sizeText(result.central.trunk?.size) || "–",
          supply: sizeText(result.central.supply?.size) || "–",
          feed: sizeText(result.central.feed?.size) || "–",
        })}
      </p>
    </Section>
  );
}

function SettingsForm({ settings, editable, onChange }: { settings: Settings; editable: boolean; onChange: (p: Partial<Settings>) => void }) {
  const t = useTranslations("sanitary.settings");
  const number = (key: "tHot" | "tReturn" | "lossConventional" | "lossRar" | "dpCheck" | "dpValve" | "vCirc", label: string, decimals: number) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <NumberField value={settings[key]} decimals={decimals} label={label} disabled={!editable} onChange={(v) => v !== null && onChange({ [key]: v })} className="h-8 rounded-lg" />
    </div>
  );
  return (
    <Section title={t("title")} description={t("description")}>
      <div className="grid grid-cols-2 gap-2">
        {number("tHot", t("tHot"), 1)}
        {number("tReturn", t("tReturn"), 1)}
        {number("lossConventional", t("lossConventional"), 3)}
        {number("lossRar", t("lossRar"), 3)}
        <div className="space-y-1">
          <Label className="text-xs">{t("allowance")}</Label>
          <NumberField
            value={Math.round(settings.allowance * 1000) / 10}
            decimals={0}
            label={t("allowance")}
            disabled={!editable}
            onChange={(v) => v !== null && onChange({ allowance: v / 100 })}
            className="h-8 rounded-lg"
          />
        </div>
        {number("vCirc", t("vCirc"), 2)}
        {number("dpCheck", t("dpCheck"), 0)}
        {number("dpValve", t("dpValve"), 0)}
        <div className="space-y-1">
          <Label htmlFor="settings-material" className="text-xs">
            {t("material")}
          </Label>
          <NativeSelect id="settings-material" value={settings.insulationMaterial} disabled={!editable} onChange={(e) => onChange({ insulationMaterial: e.target.value as Settings["insulationMaterial"] })}>
            {insulationMaterials.map((m) => (
              <option key={m} value={m}>
                {t(`materials.${m}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={settings.pwcInsulation} disabled={!editable} onChange={(e) => onChange({ pwcInsulation: e.target.checked })} className="size-4 accent-brand" />
        {t("pwcInsulation")}
      </label>
      <p className="text-xs text-muted-foreground">{t("insulationHint")}</p>
    </Section>
  );
}
