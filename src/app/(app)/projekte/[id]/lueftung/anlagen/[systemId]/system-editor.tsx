"use client";

import { FileText, ListPlus, Save, Trash2, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/confirm-button";
import type { FormMessageKey } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeOptions, optionsList } from "@/lib/kwl/attachments";
import { evaluateSystem, type NetNode, pathTo, roomFlows, type SystemData } from "@/lib/kwl/network";
import { defaultSystem, starToSystem } from "@/lib/kwl/network-defaults";
import { checkDevice } from "@/lib/kwl/network-device";
import type { PlanParams } from "@/lib/kwl/plan-schema";
import { productsOfKind } from "@/lib/kwl/products";
import type { KwlData } from "@/lib/kwl/schema";
import { layoutSystem } from "@/lib/kwl/schema-layout";

import { DeviceOptionsFields } from "../../device-options";
import { deleteSystem, saveSystem } from "../actions";
import { Notice } from "@/components/planning/fields";
import { type LvWithChapters, QuantitiesPanel } from "./quantities-panel";
import { ResultsPanel } from "./results-panel";
import { SchemaView, shortInfo } from "./schema-view";
import { TreeEditor } from "./tree-editor";

export type EditorCalc = { id: string; name: string; data: KwlData };

export function SystemEditor({
  id,
  projectId,
  initialName,
  initialData,
  calcs,
  lvs,
  planParams,
  editable,
}: {
  id: string;
  projectId: string;
  initialName: string;
  initialData: SystemData;
  calcs: EditorCalc[];
  lvs: LvWithChapters[];
  planParams: PlanParams;
  editable: boolean;
}) {
  const t = useTranslations("kwlSystem");
  const tForms = useTranslations("forms");
  const tDevice = useTranslations("kwlDevice");
  const [name, setName] = useState(initialName);
  const [data, setData] = useState(initialData);
  const [saved, setSaved] = useState({ name: initialName, data: initialData });
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = name !== saved.name || data !== saved.data;

  const rooms = useMemo(() => roomFlows(calcs, data.calcIds), [calcs, data.calcIds]);
  const result = useMemo(() => evaluateSystem(data, rooms), [data, rooms]);
  const device = useMemo(
    () =>
      checkDevice(
        data.device,
        { flow: result.supply.flow, dp: result.external.supply ?? 0 },
        { flow: result.extract.flow, dp: result.external.extract ?? 0 },
        data.deviceOptions,
      ),
    [data.device, data.deviceOptions, result],
  );
  const roomLabel = (n: NetNode) => rooms.find((r) => r.calcId === n.calcId && r.roomId === n.roomId)?.name ?? (n.label || t("unassigned"));
  const schemaOptions = normalizeOptions(data.device, data.deviceOptions);
  const schemaAttachments = { fond: schemaOptions.fond !== "none", clime: schemaOptions.clime !== null };
  const layout = useMemo(() => layoutSystem(data, rooms, roomLabel), [data, rooms]); // eslint-disable-line react-hooks/exhaustive-deps
  const highlight = useMemo(() => {
    const ids = new Set<string>();
    if (result.supply.criticalLeaf) pathTo(data.supply, result.supply.criticalLeaf).forEach((x) => ids.add(x));
    if (result.extract.criticalLeaf) pathTo(data.extract, result.extract.criticalLeaf).forEach((x) => ids.add(x));
    [...data.outdoor, ...data.exhaust].forEach((n) => ids.add(n.id));
    return ids;
  }, [data, result]);
  const nodeResult = (nodeId: string) =>
    result.supply.nodes.get(nodeId) ?? result.extract.nodes.get(nodeId) ?? result.outdoor.nodes.get(nodeId) ?? result.exhaust.nodes.get(nodeId);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = () =>
    startTransition(async () => {
      const res = await saveSystem(id, projectId, name, data);
      if (res.error) toast.error(tForms(res.error as FormMessageKey));
      else {
        setSaved({ name, data });
        toast.success(tForms("saved"));
      }
    });

  const empty = !data.outdoor.length && !data.supply.length && !data.extract.length && !data.exhaust.length;
  const starCalc = calcs.find(
    (c) => data.calcIds.includes(c.id) && (c.data.network.supply.main.length || Object.keys(c.data.network.supply.branches).length),
  );
  const zehnderDevices = productsOfKind("device");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-2 ultra:max-w-none ultra:flex-1 ultra:grid-cols-[18rem_18rem_minmax(0,1fr)] ultra:items-start">
          <div className="space-y-1">
            <label htmlFor="system-name" className="text-xs text-muted-foreground">
              {t("name")}
            </label>
            <Input id="system-name" value={name} maxLength={200} disabled={!editable} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="system-device" className="text-xs text-muted-foreground">
              {t("device")}
            </label>
            <select
              id="system-device"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={data.device ?? ""}
              disabled={!editable}
              onChange={(e) => setData((d) => ({ ...d, device: e.target.value || null, deviceOptions: normalizeOptions(e.target.value || null, d.deviceOptions) }))}
            >
              <option value="">{t("noDevice")}</option>
              {zehnderDevices.length > 0 && (
                <optgroup label={t("datasheetDevices")}>
                  {zehnderDevices.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div className="sm:col-span-2 ultra:col-span-1">
            <DeviceOptionsFields
              deviceKey={data.device}
              value={data.deviceOptions}
              disabled={!editable}
              idPrefix="system"
              onChange={(deviceOptions) => setData((d) => ({ ...d, deviceOptions }))}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/pdf/kwl-system/${id}`}
            target="_blank"
            rel="noopener"
            className={buttonVariants({ variant: "outline" })}
            onClick={(e) => {
              if (dirty) {
                e.preventDefault();
                toast.error(t("saveFirst"));
              }
            }}
          >
            <FileText />
            {t("pdf")}
          </a>
          {editable && (
            <>
              <ConfirmButton
                variant="outline"
                label={t("delete")}
                trigger={<Trash2 />}
                title={t("deleteTitle")}
                text={t("deleteText", { name })}
                confirmLabel={t("delete")}
                onConfirm={() => deleteSystem(id, projectId)}
              />
              <Button onClick={save} disabled={!dirty || pending || !name.trim()}>
                <Save />
                {dirty ? t("save") : t("saved")}
              </Button>
            </>
          )}
        </div>
      </div>

      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <legend className="mb-1 text-xs text-muted-foreground">{t("servedDwellings")}</legend>
        {calcs.length === 0 && <span className="text-muted-foreground">{t("noDwellings")}</span>}
        {calcs.map((c) => (
          <label key={c.id} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={data.calcIds.includes(c.id)}
              disabled={!editable}
              onChange={(e) =>
                setData((d) => ({ ...d, calcIds: e.target.checked ? [...d.calcIds, c.id] : d.calcIds.filter((x) => x !== c.id) }))
              }
            />
            {c.name}
          </label>
        ))}
      </fieldset>

      {empty && editable && (
        <Notice tone="info">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{t("emptyNetwork")}</span>
            <span className="flex gap-2">
              {starCalc && (
                <Button variant="outline" size="sm" onClick={() => setData((d) => starToSystem(starCalc.data.network, starCalc.id, d))}>
                  <ListPlus />
                  {t("fromStar", { name: starCalc.name })}
                </Button>
              )}
              <Button
                size="sm"
                disabled={!rooms.length}
                onClick={() =>
                  setData((d) =>
                    defaultSystem(
                      rooms,
                      {
                        intake: t("defaults.intake"),
                        exhaust: t("defaults.exhaust"),
                        outdoorDuct: t("defaults.outdoorDuct"),
                        exhaustDuct: t("defaults.exhaustDuct"),
                        mainDuct: t("defaults.mainDuct"),
                        silencer: t("defaults.silencer"),
                        distributor: t("defaults.distributor"),
                        roomDuct: t("defaults.roomDuct"),
                      },
                      d,
                    ),
                  )
                }
              >
                <Wand2 />
                {t("createDefault")}
              </Button>
            </span>
          </div>
        </Notice>
      )}

      {/* Ultrawide: schema and results left (sticky), elements and quantities right. */}
      <div className="space-y-4 ultra:grid ultra:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] ultra:items-start ultra:gap-6 ultra:space-y-0">
        <div className="flex flex-col gap-4 ultra:sticky ultra:top-4 ultra:max-h-[calc(100vh-2rem)] ultra:overflow-y-auto">
          <ResultsPanel result={result} device={device} rooms={rooms} data={data} planParams={planParams} />
          {!empty && (
            <section className="space-y-2 rounded-xl border p-3 ultra:order-first">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">{t("schema")}</h2>
                <p className="text-xs text-muted-foreground">{t("schemaHint")}</p>
              </div>
              <div className="overflow-x-auto">
                <SchemaView
                  layout={layout}
                  selected={selected}
                  highlight={highlight}
                  nodeInfo={(n) => {
                    const r = nodeResult(n.id);
                    return shortInfo(r?.flow, r?.dp);
                  }}
                  labels={{
                    device: device.name ?? t("device"),
                    deviceLines: optionsList(data.device, data.deviceOptions, {
                      erv: tDevice("ervShort"),
                      fond: "ComfoFond-L Q",
                      fondFilter: tDevice("fondFilter"),
                      fondLeft: tDevice("fondLeft"),
                      fondRight: tDevice("fondRight"),
                    }),
                    attachments: schemaAttachments,
                    outdoor: t("air.outdoor"),
                    supply: t("air.supply"),
                    extract: t("air.extract"),
                    exhaust: t("air.exhaust"),
                  }}
                  onSelect={setSelected}
                />
              </div>
            </section>
          )}
        </div>
        <div className="space-y-4">
          <TreeEditor
            data={data}
            rooms={rooms}
            result={result}
            selected={selected}
            editable={editable}
            onSelect={setSelected}
            onChange={(change) => setData(change)}
          />
          <QuantitiesPanel data={data} systemId={id} projectId={projectId} systemName={name} lvs={lvs} dirty={dirty} editable={editable} />
        </div>
      </div>
    </div>
  );
}
