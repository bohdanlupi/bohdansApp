"use client";

import { Flame, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { FormMessageKey } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type HeatingBkp, heatingBkps, heatingBkpTitle, heatingGroupName, heatingStructure, type HeatingStructureMode } from "@/lib/lv-heating-structure";
import type { AppLanguage } from "@/lib/supabase/types";

import { createHeatingStructure } from "../actions";

/** Toolbar button: creates the LV chapters «Heizung» (BKP 24 with 241–243) after the LUPI template. */
export function HeatingStructureButton({ lvId, projectId, language }: { lvId: string; projectId: string; language: AppLanguage }) {
  const t = useTranslations("lvHeatingStructure");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" title={t("button")} aria-label={t("button")} />}>
        <Flame />
        <span className="hidden xl:inline">{t("button")}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">{open && <StructureForm lvId={lvId} projectId={projectId} language={language} onDone={() => setOpen(false)} />}</DialogContent>
    </Dialog>
  );
}

const modes: HeatingStructureMode[] = ["flat", "lose", "houses"];

function StructureForm({ lvId, projectId, language, onDone }: { lvId: string; projectId: string; language: AppLanguage; onDone: () => void }) {
  const t = useTranslations("lvHeatingStructure");
  const tForms = useTranslations("forms");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [mode, setMode] = useState<HeatingStructureMode>("flat");
  const [bkps, setBkps] = useState<HeatingBkp[]>([...heatingBkps]);
  // Names of the Lose / Häuser; the defaults follow the mode until a name is edited.
  const [names, setNames] = useState<(string | null)[]>([null, null]);
  const [pending, startTransition] = useTransition();
  const defaultName = (i: number) => (mode === "flat" ? "" : `${heatingGroupName[mode][language]} ${String(i + 1).padStart(2, "0")}`);
  const groups = names.map((n, i) => (n ?? defaultName(i)).trim()).filter(Boolean);
  const preview = heatingStructure(mode, groups, bkps, language);
  const depthOf = (key: string | null): number => (key ? 1 + depthOf(preview.find((n) => n.key === key)?.parentKey ?? null) : 0);

  const submit = () =>
    startTransition(async () => {
      const res = await createHeatingStructure(lvId, projectId, { mode, groups: mode === "flat" ? [] : groups, bkps });
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
        {modes.map((m) => (
          <label key={m} className={`cursor-pointer rounded-lg border p-2.5 text-sm ${mode === m ? "border-brand bg-brand/5" : ""}`}>
            <input type="radio" name="mode" className="mr-2" checked={mode === m} onChange={() => setMode(m)} />
            <span className="font-medium">{t(`modes.${m}`)}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{t(`modesHint.${m}`)}</span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {heatingBkps.map((b) => (
          <label key={b} className="flex items-center gap-2">
            <input type="checkbox" checked={bkps.includes(b)} onChange={(e) => setBkps((xs) => (e.target.checked ? heatingBkps.filter((x) => x === b || xs.includes(x)) : xs.filter((x) => x !== b)))} />
            <span className="tabular-nums">{b}</span> {heatingBkpTitle[language][b]}
          </label>
        ))}
      </div>

      {mode !== "flat" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t(`groupsHint.${mode}`)}</p>
          <div className="space-y-1.5">
            {names.map((n, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-10 text-xs text-muted-foreground tabular-nums">
                  {mode === "lose" ? "L" : "H"}
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Input value={n ?? defaultName(i)} maxLength={150} onChange={(e) => setNames((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))} className="h-8" />
                <Button type="button" variant="ghost" size="icon" aria-label={t("removeGroup")} disabled={names.length <= 1} onClick={() => setNames((xs) => xs.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setNames((xs) => [...xs, null])}>
            {t(`addGroup.${mode}`)}
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
        <Button onClick={submit} disabled={pending || bkps.length === 0 || (mode !== "flat" && groups.length === 0)}>
          {t("create")}
        </Button>
      </DialogFooter>
    </div>
  );
}
