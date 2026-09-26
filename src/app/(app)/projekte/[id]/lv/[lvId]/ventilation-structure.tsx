"use client";

import { Wind } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { FormMessageKey } from "@/components/form";
import { NativeSelect } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type StructureLevels, ventilationStructure } from "@/lib/lv-ventilation-structure";
import type { AppLanguage } from "@/lib/supabase/types";

import { createVentilationStructure } from "../actions";

/** Toolbar button: creates the LV chapters «Lüftung» (BKP 244) after the LUPI template. */
export function VentilationStructureButton({
  lvId,
  projectId,
  language,
  systems,
}: {
  lvId: string;
  projectId: string;
  language: AppLanguage;
  /** Ventilation systems of the project (Dimensionierung), in their order. */
  systems: { id: string; name: string }[];
}) {
  const t = useTranslations("lvStructure");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" title={t("button")} aria-label={t("button")} />}>
        <Wind />
        <span className="hidden xl:inline">{t("button")}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        {open && <StructureForm lvId={lvId} projectId={projectId} language={language} systems={systems} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

type Row = { name: string; include: boolean; los: number };

function StructureForm({
  lvId,
  projectId,
  language,
  systems,
  onDone,
}: {
  lvId: string;
  projectId: string;
  language: AppLanguage;
  systems: { id: string; name: string }[];
  onDone: () => void;
}) {
  const t = useTranslations("lvStructure");
  const tForms = useTranslations("forms");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [levels, setLevels] = useState<StructureLevels>(systems.length > 1 ? 2 : 1);
  const [rows, setRows] = useState<Row[]>(
    systems.length ? systems.map((s) => ({ name: s.name, include: true, los: 1 })) : [{ name: t("defaultSystem", { n: 1 }), include: true, los: 1 }],
  );
  const [pending, startTransition] = useTransition();
  const chosen = rows.filter((r) => r.include && r.name.trim());
  const preview = ventilationStructure(levels, chosen.map((r) => ({ name: r.name.trim(), los: r.los })), language);
  const depthOf = (key: string | null): number => (key ? 1 + depthOf(preview.find((n) => n.key === key)?.parentKey ?? null) : 0);

  const submit = () =>
    startTransition(async () => {
      const res = await createVentilationStructure(lvId, projectId, { levels, systems: chosen.map((r) => ({ name: r.name.trim(), los: r.los })) });
      if (res.error) toast.error(tForms(res.error as FormMessageKey));
      else {
        toast.success(t("created", { count: res.count ?? 0 }));
        onDone();
        router.refresh();
      }
    });

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">{t("description")}</p>

      <fieldset className="grid gap-2 sm:grid-cols-3">
        {([1, 2, 3] as const).map((l) => (
          <label key={l} className={`cursor-pointer rounded-lg border p-2.5 text-sm ${levels === l ? "border-brand bg-brand/5" : ""}`}>
            <input type="radio" name="levels" className="mr-2" checked={levels === l} onChange={() => setLevels(l)} />
            <span className="font-medium">{t(`levels.${l}`)}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{t(`levelsHint.${l}`)}</span>
          </label>
        ))}
      </fieldset>

      {levels > 1 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{systems.length ? t("systemsHint") : t("noSystems")}</p>
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="checkbox" checked={r.include} aria-label={r.name} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} />
                <span className="w-12 text-xs text-muted-foreground tabular-nums">LA{String(chosen.indexOf(r) + 1).padStart(2, "0")}</span>
                <Input value={r.name} maxLength={150} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="h-8" />
                {levels === 3 && (
                  <NativeSelect value={String(r.los)} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, los: Number(e.target.value) } : x)))} className="h-8 w-28">
                    {rows.map((_, n) => (
                      <option key={n} value={n + 1}>
                        {t("los", { n: n + 1 })}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, { name: t("defaultSystem", { n: rs.length + 1 }), include: true, los: 1 }])}>
            {t("addSystem")}
          </Button>
        </div>
      )}

      <div className="max-h-64 overflow-y-auto rounded-lg border bg-muted/30 p-2 text-xs">
        {preview.map((n) => (
          <div key={n.key} className="flex gap-3" style={{ paddingLeft: depthOf(n.parentKey) * 12 }}>
            <span className="w-24 shrink-0 font-mono tabular-nums">{n.number}</span>
            <span className={n.parentKey ? "" : "font-semibold"}>{n.text}</span>
          </div>
        ))}
      </div>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{tCommon("cancel")}</DialogClose>
        <Button onClick={submit} disabled={pending || (levels > 1 && chosen.length === 0)}>
          {t("create")}
        </Button>
      </DialogFooter>
    </div>
  );
}
