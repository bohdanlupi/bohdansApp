"use client";

import { FileInput } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { FormMessageKey } from "@/components/form";
import { NativeSelect } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type SystemData, systemQuantities } from "@/lib/kwl/network";

import { fmt } from "../../fields";
import { insertSystemQuantities } from "../actions";

/** Quantities of the network per product (Zehnder article), to be inserted into an LV. */
export function QuantitiesPanel({
  data,
  systemId,
  projectId,
  systemName,
  lvs,
  dirty,
  editable,
}: {
  data: SystemData;
  systemId: string;
  projectId: string;
  systemName: string;
  lvs: { id: string; number: string; title: string }[];
  dirty: boolean;
  editable: boolean;
}) {
  const t = useTranslations("kwlSystem");
  const tForms = useTranslations("forms");
  const quantities = systemQuantities(data).filter((q) => q.quantity > 0);
  const [lvId, setLvId] = useState(lvs[0]?.id ?? "");
  const [title, setTitle] = useState(t("lvGroup", { name: systemName }));
  const [pending, startTransition] = useTransition();

  const insert = () =>
    startTransition(async () => {
      const res = await insertSystemQuantities(systemId, projectId, lvId, title);
      if (res.error) toast.error(tForms(res.error as FormMessageKey));
      else toast.success(t("inserted", { count: res.count ?? 0 }));
    });

  return (
    <section className="space-y-3 rounded-xl border p-3">
      <div>
        <h2 className="font-semibold">{t("quantities")}</h2>
        <p className="text-sm text-muted-foreground">{t("quantitiesHint")}</p>
      </div>
      {quantities.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noQuantities")}</p>
      ) : (
        <table className="w-full max-w-3xl text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1 text-left font-medium">{t("product")}</th>
              <th className="px-2 text-left font-medium">{t("article")}</th>
              <th className="px-2 text-right font-medium">{t("quantity")}</th>
              <th className="text-left font-medium">{t("unit")}</th>
            </tr>
          </thead>
          <tbody>
            {quantities.map((q, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-1">{q.label || "–"}</td>
                <td className="px-2 font-mono text-xs">{q.articles[0] ?? <span className="font-sans text-muted-foreground">{t("rPosition")}</span>}</td>
                <td className="px-2 text-right tabular-nums">{fmt(q.quantity, q.unit === "m" ? 1 : 0)}</td>
                <td>{q.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editable && quantities.length > 0 && (
        lvs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("noLv")}{" "}
            <Link href={`/projekte/${projectId}/lv`} className="underline">
              {t("toLvs")}
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label htmlFor="q-lv" className="text-xs text-muted-foreground">
                {t("targetLv")}
              </label>
              <NativeSelect id="q-lv" value={lvId} onChange={(e) => setLvId(e.target.value)} className="w-64">
                {lvs.map((lv) => (
                  <option key={lv.id} value={lv.id}>
                    {lv.number} {lv.title}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <label htmlFor="q-title" className="text-xs text-muted-foreground">
                {t("groupTitle")}
              </label>
              <Input id="q-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="w-72" />
            </div>
            <Button onClick={insert} disabled={pending || dirty || !lvId || !title.trim()} title={dirty ? t("saveFirst") : undefined}>
              <FileInput />
              {t("insertIntoLv")}
            </Button>
            {dirty && <span className="text-xs text-muted-foreground">{t("saveFirst")}</span>}
          </div>
        )
      )}
    </section>
  );
}
