"use client";

import { FileInput } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import type { FormMessageKey } from "@/components/form";
import { NativeSelect } from "@/components/form";
import { fmt, Section } from "@/components/planning/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { QuantityLine } from "@/lib/sanitary/quantities";

import type { LvWithChapters } from "../../lueftung/anlagen/[systemId]/quantities-panel";
import { insertSanitaryQuantities } from "../actions";

const groups = ["pipes", "valves", "central", "insulation"] as const;
type Group = (typeof groups)[number];

/**
 * Material list of a Sanitäranlage (Nussbaum, Biral, Meier Tobler insulation) grouped as Rohre / Armaturen / Zentrale
 * / Dämmung; each group goes into a chosen chapter of an LV or into a new group.
 */
export function SanitaryQuantitiesPanel({
  quantities,
  systemId,
  projectId,
  systemName,
  lvs,
  dirty,
  editable,
}: {
  quantities: QuantityLine[];
  systemId: string;
  projectId: string;
  systemName: string;
  lvs: LvWithChapters[];
  dirty: boolean;
  editable: boolean;
}) {
  const t = useTranslations("sanitary.quantities");
  const tForms = useTranslations("forms");
  const lines = quantities.filter((q) => q.quantity > 0);
  const [lvId, setLvId] = useState(lvs[0]?.id ?? "");
  const lv = lvs.find((l) => l.id === lvId);
  // Chosen chapter per LV and group ("" = new group).
  const [chosen, setChosen] = useState<Record<string, Partial<Record<Group, string>>>>({});
  const targetOf = (g: Group) => chosen[lvId]?.[g] ?? "";
  const [title, setTitle] = useState(t("lvGroup", { name: systemName }));
  const [pending, startTransition] = useTransition();
  const present = groups.filter((g) => lines.some((q) => q.group === g));
  const needsGroup = present.some((g) => !targetOf(g));

  // Chapters in document order, indented by depth.
  const options = useMemo(() => {
    if (!lv) return [];
    const out: { id: string; label: string }[] = [];
    const walk = (parentId: string | null, depth: number) =>
      lv.groups
        .filter((g) => g.parentId === parentId)
        .forEach((g) => {
          out.push({ id: g.id, label: `${"  ".repeat(depth)}${g.number ?? ""} ${g.text}`.trimEnd() });
          walk(g.id, depth + 1);
        });
    walk(null, 0);
    return out;
  }, [lv]);

  const insert = () =>
    startTransition(async () => {
      const targets = Object.fromEntries(present.map((g) => [g, targetOf(g) || null]));
      const res = await insertSanitaryQuantities(systemId, projectId, lvId, title, targets);
      if (res.error) toast.error(tForms(res.error as FormMessageKey));
      else toast.success(t("inserted", { count: res.count ?? 0 }));
    });

  return (
    <Section title={t("title")} description={t("description")}>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">–</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1 font-normal">{t("article")}</th>
                <th className="py-1 font-normal">{t("text")}</th>
                <th className="py-1 text-right font-normal">{t("quantity")}</th>
              </tr>
            </thead>
            <tbody>
              {present.map((g) => [
                <tr key={g}>
                  <td colSpan={3} className="pt-3 pb-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold">
                        {t(`groups.${g}`)}
                        {g === "insulation" && <span className="ml-2 font-normal text-muted-foreground">{t("insulationAllowance")}</span>}
                      </span>
                      {editable && lv && (
                        <NativeSelect
                          value={targetOf(g)}
                          onChange={(e) => setChosen((c) => ({ ...c, [lvId]: { ...c[lvId], [g]: e.target.value } }))}
                          className="h-7 w-72 text-xs"
                          aria-label={`${t("chapter")} ${t(`groups.${g}`)}`}
                        >
                          <option value="">{t("newGroupOption")}</option>
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </NativeSelect>
                      )}
                    </div>
                  </td>
                </tr>,
                ...lines
                  .filter((q) => q.group === g)
                  .map((q) => (
                    <tr key={q.key} className="border-b last:border-0">
                      <td className="py-1 pr-3 text-xs whitespace-nowrap text-muted-foreground tabular-nums">{q.article ? `${q.manufacturer} ${q.article}` : t("rPosition")}</td>
                      <td className="py-1 pr-3">{q.label}</td>
                      <td className="py-1 text-right whitespace-nowrap tabular-nums">
                        {fmt(q.quantity, q.unit === "m" ? 1 : 0)} {q.unit}
                      </td>
                    </tr>
                  )),
              ])}
            </tbody>
          </table>
        </div>
      )}
      {editable &&
        lines.length > 0 &&
        (lvs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("noLv")}{" "}
            <Link href={`/projekte/${projectId}/lv`} className="underline">
              {t("toLvs")}
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <div className="space-y-1">
              <label htmlFor="sq-lv" className="text-xs text-muted-foreground">
                {t("targetLv")}
              </label>
              <NativeSelect id="sq-lv" value={lvId} onChange={(e) => setLvId(e.target.value)} className="w-72">
                {lvs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.number} {l.title}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {needsGroup && (
              <div className="space-y-1">
                <label htmlFor="sq-title" className="text-xs text-muted-foreground">
                  {t("groupTitle")}
                </label>
                <Input id="sq-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="w-72" />
              </div>
            )}
            <Button onClick={insert} disabled={pending || dirty || !lvId || (needsGroup && !title.trim())} title={dirty ? t("saveFirst") : undefined}>
              <FileInput />
              {t("insertIntoLv")}
            </Button>
            {dirty && <span className="text-xs text-muted-foreground">{t("saveFirst")}</span>}
          </div>
        ))}
    </Section>
  );
}
