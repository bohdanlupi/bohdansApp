"use client";

import { Pencil, Trash2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/confirm-button";
import { type FormMessageKey, NativeSelect } from "@/components/form";
import { NewNamedDialog } from "@/components/planning/new-named-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlantData } from "@/lib/heating/plant-schema";

import { createHeatingPlant, deleteHeatingPlant, saveHeatingPlant } from "./actions";

type Plant = { id: string; name: string; data: PlantData };

/**
 * Anlage selector of the per-Anlage chapters (242, and Fussbodenheizung, Heizkörper, Sicherheitseinrichtungen,
 * Prinzipschema of 243): switches with ?anlage=, and creates, renames or deletes Anlagen.
 */
export function PlantBar({ projectId, plants, current, editable }: { projectId: string; plants: Plant[]; current: Plant | null; editable: boolean }) {
  const t = useTranslations("heatingPlan.plant");
  const tForms = useTranslations("forms");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(current?.name ?? "");
  const [pending, startTransition] = useTransition();

  const rename = () =>
    startTransition(async () => {
      if (!current) return;
      const res = await saveHeatingPlant(current.id, projectId, name, current.data);
      if (res.error) toast.error(tForms(res.error as FormMessageKey));
      else {
        setRenaming(false);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-muted/30 p-2.5">
      {current && (
        <div className="w-64 space-y-1">
          <Label htmlFor="heating-plant" className="text-xs text-muted-foreground">
            {t("label")}
          </Label>
          <NativeSelect id="heating-plant" value={current.id} onChange={(e) => router.push(`${pathname}?anlage=${e.target.value}`)}>
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      {editable && (
        <>
          <NewNamedDialog
            projectId={projectId}
            defaultName={t("defaultName", { n: plants.length + 1 })}
            action={createHeatingPlant}
            labels={{ button: t("new"), name: t("name"), hint: t("nameHint"), create: t("create") }}
          />
          {current && (
            <>
              <Dialog
                open={renaming}
                onOpenChange={(open) => {
                  setRenaming(open);
                  setName(current.name);
                }}
              >
                <DialogTrigger render={<Button variant="outline" />}>
                  <Pencil />
                  {t("rename")}
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>{t("rename")}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Label htmlFor="plant-name">{t("name")}</Label>
                    <Input id="plant-name" value={name} maxLength={200} autoFocus onChange={(e) => setName(e.target.value)} />
                  </div>
                  <DialogFooter>
                    <DialogClose render={<Button type="button" variant="outline" />}>{tCommon("cancel")}</DialogClose>
                    <Button type="button" onClick={rename} disabled={pending || !name.trim()}>
                      {t("save")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <ConfirmButton
                variant="ghost"
                label={t("delete")}
                trigger={<Trash2 />}
                title={t("delete")}
                text={t("deleteConfirm", { name: current.name })}
                confirmLabel={tCommon("delete")}
                onConfirm={deleteHeatingPlant.bind(null, current.id, projectId)}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
