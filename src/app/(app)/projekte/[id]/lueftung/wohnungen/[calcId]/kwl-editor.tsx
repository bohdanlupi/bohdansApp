"use client";

import { Copy, FileText, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/confirm-button";
import type { FormMessageKey } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { evaluateKwl, type SystemDrops } from "@/lib/kwl/evaluate";
import type { PlanParams } from "@/lib/kwl/plan-schema";
import { transferPressureLimit } from "@/lib/kwl/sia3825";
import type { KwlData } from "@/lib/kwl/schema";

import { deleteKwlCalc, duplicateKwlCalc, saveKwlCalc } from "../../actions";
import { DeviceTab } from "./device-tab";
import { FilterTab } from "./filter-tab";
import { NotesTab } from "./notes-tab";
import { RoomsTab } from "./rooms-tab";
import { ToolsTab } from "./tools-tab";

export function KwlEditor({
  id,
  projectId,
  initialName,
  initialData,
  planParams,
  system,
  editable,
}: {
  id: string;
  projectId: string;
  initialName: string;
  initialData: KwlData;
  planParams: PlanParams;
  system: SystemDrops | null;
  editable: boolean;
}) {
  const t = useTranslations("kwl");
  const tForms = useTranslations("forms");
  const [name, setName] = useState(initialName);
  const [data, setData] = useState(initialData);
  const [saved, setSaved] = useState({ name: initialName, data: initialData });
  const [pending, startTransition] = useTransition();
  const dirty = name !== saved.name || data !== saved.data;
  const result = useMemo(() => evaluateKwl(data, system), [data, system]);
  const update = <K extends keyof KwlData>(key: K, value: KwlData[K]) => setData((d) => ({ ...d, [key]: value }));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = () =>
    startTransition(async () => {
      const response = await saveKwlCalc(id, projectId, name, data);
      if (response.error) {
        toast.error(tForms(response.error as FormMessageKey));
      } else {
        setSaved({ name, data });
        toast.success(tForms("saved"));
      }
    });

  const duplicate = () => {
    if (dirty) {
      toast.error(t("saveFirst"));
      return;
    }
    startTransition(async () => {
      const response = await duplicateKwlCalc(id, projectId);
      if (response?.error) toast.error(tForms(response.error as FormMessageKey));
    });
  };

  const totalFlow = Math.max(result.summary.supply, result.summary.extract);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-md space-y-1">
          <label htmlFor="kwl-name" className="text-xs text-muted-foreground">
            {t("fields.name")}
          </label>
          <Input id="kwl-name" value={name} maxLength={200} disabled={!editable} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["flows", "full"] as const).map((variant) => (
            <a
              key={variant}
              href={`/api/pdf/kwl/${id}?variant=${variant}`}
              target="_blank"
              rel="noopener"
              title={variant === "full" && result.drops.source !== "system" ? t("pdfFullHint") : undefined}
              className={buttonVariants({ variant: variant === "full" && result.drops.source !== "system" ? "ghost" : "outline" })}
              onClick={(e) => {
                if (dirty) {
                  e.preventDefault();
                  toast.error(t("saveFirst"));
                }
              }}
            >
              <FileText />
              {variant === "flows" ? t("pdfFlows") : t("pdfFull")}
            </a>
          ))}
          {editable && (
            <>
              <Button variant="outline" onClick={duplicate} disabled={pending}>
                <Copy />
                {t("duplicate")}
              </Button>
              <ConfirmButton
                variant="outline"
                label={t("delete")}
                trigger={<Trash2 />}
                title={t("deleteTitle")}
                text={t("deleteText", { name })}
                confirmLabel={t("delete")}
                onConfirm={() => deleteKwlCalc(id, projectId)}
              />
              <Button onClick={save} disabled={!dirty || pending || !name.trim()}>
                <Save />
                {dirty ? t("save") : t("saved")}
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="rooms">
        <TabsList variant="line" className="flex-wrap">
          {(["rooms", "device", "filter", "tools", "notes"] as const).map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(`tabs.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="rooms" className="pt-3">
          <RoomsTab
            rooms={data.rooms}
            rows={result.rows}
            summary={result.summary}
            height={data.height}
            demandControlled={planParams.operation === "demand"}
            editable={editable}
            onChange={(rooms) => update("rooms", rooms)}
            onHeightChange={(height) => update("height", height)}
          />
        </TabsContent>
        <TabsContent value="device" className="pt-3">
          <DeviceTab
            device={data.device}
            result={result.deviceResult}
            datasheet={result.datasheet}
            supplyFlow={result.summary.supply}
            extractFlow={result.summary.extract}
            planParams={planParams}
            drops={result.drops}
            projectId={projectId}
            editable={editable}
            onChange={(device) => update("device", device)}
          />
        </TabsContent>
        <TabsContent value="filter" className="pt-3">
          <FilterTab filter={data.filter} editable={editable} onChange={(filter) => update("filter", filter)} />
        </TabsContent>
        <TabsContent value="tools" className="pt-3">
          <ToolsTab
            standard={data.standard}
            rows={result.rows}
            totalFlow={totalFlow}
            transferLimit={transferPressureLimit[planParams.system]}
            editable={editable}
            onStandardChange={(standard) => update("standard", standard)}
          />
        </TabsContent>
        <TabsContent value="notes" className="pt-3">
          <NotesTab notes={data.notes} editable={editable} onChange={(notes) => update("notes", notes)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
