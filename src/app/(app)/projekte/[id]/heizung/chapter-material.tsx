"use client";

import { FileInput } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import type { FormMessageKey } from "@/components/form";
import { NativeSelect } from "@/components/form";
import { fmt } from "@/components/planning/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultHeatingBase, type HeatingBkp, heatingBases, heatingChapterId, heatingChapterName } from "@/lib/lv-heating-structure";
import type { AppLanguage } from "@/lib/supabase/types";

import type { LvWithChapters } from "../lueftung/anlagen/[systemId]/quantities-panel";

/** A chapter of a Materialauszug (key «242.1», «243.6» …) with its lines. */
export type ChapterSection = {
  key: string;
  bkp: HeatingBkp;
  chapter: number;
  lines: { key: string; article: string | null; manufacturer: string | null; label: string; unit: string; quantity: number }[];
};

/**
 * Materialauszug of a Heizung chapter by LV chapter, and its insertion into an LV: per LV the Los / Haus of the
 * structure «Heizung» and the chosen chapter per section ("" = new group); the defaults are the matching chapters of the
 * structure (242 Wärmeerzeugung, 243 Wärmeverteilung).
 */
export function ChapterMaterial({
  sections,
  lvs,
  plantName,
  projectId,
  defaultTitle,
  hint,
  dirty,
  editable,
  insert,
}: {
  sections: ChapterSection[];
  lvs: LvWithChapters[];
  plantName: string;
  projectId: string;
  /** Title of a new LV group for chapters without a target. */
  defaultTitle: string;
  hint: React.ReactNode;
  dirty: boolean;
  editable: boolean;
  insert: (lvId: string, title: string, targets: Record<string, string | null>) => Promise<{ error?: string; count?: number }>;
}) {
  const t = useTranslations("heatingPlan.generation.material");
  const tForms = useTranslations("forms");
  const language = useLocale().slice(0, 2) as AppLanguage;
  const hasLines = sections.some((x) => x.lines.length);

  const [lvId, setLvId] = useState(lvs[0]?.id ?? "");
  const lv = lvs.find((l) => l.id === lvId);
  const bases = useMemo(() => (lv ? heatingBases(lv.groups) : []), [lv]);
  const [chosenBase, setChosenBase] = useState<Record<string, string>>({});
  const baseId = bases.length ? (chosenBase[lvId] !== undefined ? chosenBase[lvId] || null : (defaultHeatingBase(bases, plantName)?.id ?? null)) : undefined;
  const [chosen, setChosen] = useState<Record<string, Record<string, string>>>({});
  const targetOf = (key: string) => {
    const pick = chosen[lvId]?.[key];
    if (pick !== undefined) return pick;
    const section = sections.find((x) => x.key === key);
    return lv && section && baseId !== undefined ? (heatingChapterId(lv.groups, baseId, section.bkp, section.chapter) ?? "") : "";
  };
  const [title, setTitle] = useState(defaultTitle);
  const [pending, startTransition] = useTransition();
  const needsGroup = sections.some((x) => !targetOf(x.key));
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
  const run = () =>
    startTransition(async () => {
      const targets = Object.fromEntries(sections.map((x) => [x.key, targetOf(x.key) || null]));
      const res = await insert(lvId, title, targets);
      if (res.error) toast.error(tForms(res.error as FormMessageKey));
      else toast.success(t("inserted", { count: res.count ?? 0 }));
    });

  return (
    <>
      <div className="space-y-2">
        <h3 className="text-sm font-medium">{t("list")}</h3>
        {editable && hasLines && lvs.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label htmlFor="hm-lv" className="text-xs text-muted-foreground">
                {t("targetLv")}
              </label>
              <NativeSelect id="hm-lv" value={lvId} onChange={(e) => setLvId(e.target.value)} className="w-72">
                {lvs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.number} {l.title}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {bases.length > 1 && (
              <div className="space-y-1">
                <label htmlFor="hm-base" className="text-xs text-muted-foreground">
                  {t("base")}
                </label>
                <NativeSelect
                  id="hm-base"
                  value={baseId ?? ""}
                  onChange={(e) => {
                    setChosenBase((c) => ({ ...c, [lvId]: e.target.value }));
                    // A new Los / Haus brings its own chapters back as the defaults.
                    setChosen((c) => ({ ...c, [lvId]: {} }));
                  }}
                  className="w-56"
                >
                  {bases.map((b) => (
                    <option key={b.id ?? ""} value={b.id ?? ""}>
                      {b.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            {lv && bases.length === 0 && (
              <p className="max-w-xl pb-1 text-xs text-muted-foreground">
                {t("noStructure")}{" "}
                <Link href={`/projekte/${projectId}/lv/${lv.id}`} className="underline">
                  {t("toLv")}
                </Link>
              </p>
            )}
          </div>
        )}
        {!hasLines ? (
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
                {sections.map((x) => [
                  <tr key={x.key}>
                    <td colSpan={3} className="pt-3 pb-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold">
                          <span className="tabular-nums">{x.key}</span> {heatingChapterName(x.bkp, x.chapter, language)}
                        </span>
                        {editable && lv && (
                          <NativeSelect
                            value={targetOf(x.key)}
                            onChange={(e) => setChosen((c) => ({ ...c, [lvId]: { ...c[lvId], [x.key]: e.target.value } }))}
                            className="h-7 w-72 text-xs"
                            aria-label={`${t("chapter")} ${x.key}`}
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
                  ...x.lines.map((l) => (
                    <tr key={l.key} className="border-b last:border-0">
                      <td className="py-1 pr-3 text-xs whitespace-nowrap text-muted-foreground tabular-nums">{l.article ? `${l.manufacturer} ${l.article}` : t("neutral")}</td>
                      <td className="py-1 pr-3">{l.label}</td>
                      <td className="py-1 text-right whitespace-nowrap tabular-nums">
                        {fmt(l.quantity, l.unit === "m" && l.quantity % 1 ? 1 : 0)} {l.unit}
                      </td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      {editable &&
        hasLines &&
        (lvs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("noLv")}{" "}
            <Link href={`/projekte/${projectId}/lv`} className="underline">
              {t("toLvs")}
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            {needsGroup && (
              <div className="space-y-1">
                <label htmlFor="hm-title" className="text-xs text-muted-foreground">
                  {t("groupTitle")}
                </label>
                <Input id="hm-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="w-72" />
              </div>
            )}
            <Button onClick={run} disabled={pending || dirty || !lvId || (needsGroup && !title.trim())} title={dirty ? t("saveFirst") : undefined}>
              <FileInput />
              {t("insertIntoLv")}
            </Button>
            {dirty && <span className="text-xs text-muted-foreground">{t("saveFirst")}</span>}
          </div>
        ))}
    </>
  );
}
