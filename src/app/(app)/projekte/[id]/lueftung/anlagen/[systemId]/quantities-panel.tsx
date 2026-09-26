"use client";

import { FileInput } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import type { FormMessageKey } from "@/components/form";
import { NativeSelect } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Quantity, type SystemData, systemQuantities } from "@/lib/kwl/network";

import { fmt } from "../../fields";
import { insertSystemQuantities } from "../actions";

export type LvChapter = { id: string; parentId: string | null; number: string | null; text: string };
export type LvWithChapters = { id: string; number: string; title: string; groups: LvChapter[] };

/**
 * Default chapter of each line in an LV with the structure «Lüftung» (BKP 244): the chapter 0–6 below this
 * system's group «LAxx - <name>», or below 244 itself (structure with one level). Null: new group.
 */
function defaultTargets(groups: LvChapter[], systemName: string, quantities: Quantity[]): Record<string, string | null> {
  const childrenOf = (id: string) => groups.filter((g) => g.parentId === id);
  const lastDigit = (g: LvChapter) => g.number?.split(".").at(-1) ?? "";
  const name = systemName.trim().toLowerCase();
  const system = groups.find((g) => /^LA\d+/i.test(g.text) && name && g.text.toLowerCase().includes(name));
  const top = groups.find((g) => !g.parentId && g.number === "244");
  const topHasChapters = top ? childrenOf(top.id).some((c) => c.number === "244.0") : false;
  const base = system ?? (topHasChapters ? top : undefined);
  const chapters = base ? childrenOf(base.id) : [];
  return Object.fromEntries(quantities.map((q) => [q.key, chapters.find((c) => lastDigit(c) === String(q.chapter))?.id ?? null]));
}

/** Quantities of the network per product, each assigned to an LV chapter and inserted into the LV. */
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
  lvs: LvWithChapters[];
  dirty: boolean;
  editable: boolean;
}) {
  const t = useTranslations("kwlSystem");
  const tForms = useTranslations("forms");
  const quantities = useMemo(() => systemQuantities(data).filter((q) => q.quantity > 0), [data]);
  const [lvId, setLvId] = useState(lvs[0]?.id ?? "");
  const lv = lvs.find((l) => l.id === lvId);
  // Chosen chapters per LV (quantity key → group id, "" = new group); defaults from the LV structure.
  const [chosen, setChosen] = useState<Record<string, Record<string, string>>>({});
  const defaults = useMemo(() => (lv ? defaultTargets(lv.groups, systemName, quantities) : {}), [lv, systemName, quantities]);
  const targetOf = (key: string) => chosen[lvId]?.[key] ?? defaults[key] ?? "";
  const [title, setTitle] = useState(t("lvGroup", { name: systemName }));
  const [pending, startTransition] = useTransition();
  const needsGroup = quantities.some((q) => !targetOf(q.key));

  // Chapters in document order, indented by depth.
  const options = useMemo(() => {
    if (!lv) return [];
    const out: { id: string; label: string }[] = [];
    const walk = (parentId: string | null, depth: number) =>
      lv.groups
        .filter((g) => g.parentId === parentId)
        .forEach((g) => {
          out.push({ id: g.id, label: `${"  ".repeat(depth)}${g.number ?? ""} ${g.text}`.trimEnd() });
          walk(g.id, depth + 1);
        });
    walk(null, 0);
    return out;
  }, [lv]);

  const setTarget = (key: string, value: string) => setChosen((c) => ({ ...c, [lvId]: { ...c[lvId], [key]: value } }));
  const insert = () =>
    startTransition(async () => {
      const targets = Object.fromEntries(quantities.map((q) => [q.key, targetOf(q.key) || null]));
      const res = await insertSystemQuantities(systemId, projectId, lvId, title, targets);
      if (res.error) toast.error(tForms(res.error as FormMessageKey));
      else toast.success(t("inserted", { count: res.count ?? 0 }));
    });

  return (
    <section className="space-y-3 rounded-xl border p-3">
      <div>
        <h2 className="font-semibold">{t("quantities")}</h2>
        <p className="text-sm text-muted-foreground">{t("quantitiesHint")}</p>
      </div>
      {editable && lvs.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label htmlFor="q-lv" className="text-xs text-muted-foreground">
              {t("targetLv")}
            </label>
            <NativeSelect id="q-lv" value={lvId} onChange={(e) => setLvId(e.target.value)} className="w-72">
              {lvs.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.number} {l.title}
                </option>
              ))}
            </NativeSelect>
          </div>
          {lv && !lv.groups.some((g) => g.number === "244") && (
            <p className="max-w-xl pb-1 text-xs text-muted-foreground">
              {t("noStructure")}{" "}
              <Link href={`/projekte/${projectId}/lv/${lv.id}`} className="underline">
                {t("toLv")}
              </Link>
            </p>
          )}
        </div>
      )}
      {quantities.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noQuantities")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-1 text-left font-medium">{t("product")}</th>
                <th className="px-2 text-left font-medium">{t("article")}</th>
                <th className="px-2 text-right font-medium">{t("quantity")}</th>
                <th className="text-left font-medium">{t("unit")}</th>
                {editable && lv && <th className="pl-2 text-left font-medium">{t("chapter")}</th>}
              </tr>
            </thead>
            <tbody>
              {quantities.map((q) => (
                <tr key={q.key} className="border-b last:border-0">
                  <td className="py-1">{q.label || "–"}</td>
                  <td className="px-2 font-mono text-xs">{q.articles[0] ?? <span className="font-sans text-muted-foreground">{t("rPosition")}</span>}</td>
                  <td className="px-2 text-right tabular-nums">{fmt(q.quantity, q.unit === "m" ? 1 : 0)}</td>
                  <td>{q.unit}</td>
                  {editable && lv && (
                    <td className="py-0.5 pl-2">
                      <NativeSelect value={targetOf(q.key)} onChange={(e) => setTarget(q.key, e.target.value)} className="h-7 w-72 text-xs" aria-label={`${t("chapter")} ${q.label}`}>
                        <option value="">{t("newGroupOption")}</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editable &&
        quantities.length > 0 &&
        (lvs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("noLv")}{" "}
            <Link href={`/projekte/${projectId}/lv`} className="underline">
              {t("toLvs")}
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            {needsGroup && (
              <div className="space-y-1">
                <label htmlFor="q-title" className="text-xs text-muted-foreground">
                  {t("groupTitle")}
                </label>
                <Input id="q-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="w-72" />
              </div>
            )}
            <Button onClick={insert} disabled={pending || dirty || !lvId || (needsGroup && !title.trim())} title={dirty ? t("saveFirst") : undefined}>
              <FileInput />
              {t("insertIntoLv")}
            </Button>
            {dirty && <span className="text-xs text-muted-foreground">{t("saveFirst")}</span>}
          </div>
        ))}
    </section>
  );
}
