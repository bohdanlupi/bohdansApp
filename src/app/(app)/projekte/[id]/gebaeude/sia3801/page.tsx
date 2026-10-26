import { ArrowLeft, FileText, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { fmt, Notice, Result } from "@/components/planning/fields";
import { buttonVariants } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { deriveElements } from "@/lib/building/heat-link";
import { evaluateSia3801, type ZoneResult } from "@/lib/building/sia3801";
import { usageCategories } from "@/lib/building/sia3801-data";
import { cn } from "@/lib/utils";

import { loadHeatingPlan } from "../../heizung/load-plan";
import { loadBuildingModel, loadBuildingPlans } from "../load-model";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/gebaeude/sia3801">): Promise<Metadata> {
  const t = await getTranslations("building.sia3801");
  void (await params);
  return { title: t("title") };
}

export default async function Sia3801Page({ params }: PageProps<"/projekte/[id]/gebaeude/sia3801">) {
  const { id } = await params;
  await requireProfile();
  const t = await getTranslations("building.sia3801");
  const tz = await getTranslations("building.zones");
  const [model, plans, heatingPlan] = await Promise.all([loadBuildingModel(id), loadBuildingPlans(id), loadHeatingPlan(id)]);
  const result = evaluateSia3801(model, plans, heatingPlan.catalog, deriveElements(model, plans));
  const months = t("months").split(",");

  return (
    <div className="space-y-4">
      <Link href={`/projekte/${id}/gebaeude`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("back")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <a href={`/api/pdf/sia3801/${id}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
          <FileText />
          {t("pdf")}
        </a>
      </div>

      {result.warnings.length > 0 && (
        <Notice>
          <ul className="list-disc space-y-0.5 pl-4">
            {result.warnings.map((w) => (
              <li key={w}>{t(`warnings.${w}`)}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Result label={t("climate")} value={result.station?.name ?? "–"} hint={result.station ? `${t(`sets.${result.climateSet}`)} · θe,avg ${fmt(result.station.thetaMean, 1)} °C` : undefined} />
        <Result label={t("building.areaE")} value={fmt(result.areaE, 1)} unit="m²" />
        <Result label={t("building.ath")} value={fmt(result.ath, 1)} unit="m²" hint={result.areaE > 0 ? `A_th/A_E ${fmt(result.ath / result.areaE, 2)}` : undefined} />
        <Result label={t("building.qH")} value={fmt(result.qH, 0)} unit="kWh/a" />
        <Result label={t("building.qHSpecific")} value={result.qHSpecific === null ? "–" : fmt(result.qHSpecific, 1)} unit="kWh/m²" tone={result.ok === null ? undefined : result.ok ? "ok" : "bad"} />
        <Result
          label={t("building.limit")}
          value={result.limit === null ? "–" : fmt(result.limit, 1)}
          unit="kWh/m²"
          hint={result.target === null ? undefined : t("building.targetHint", { target: fmt(result.target, 1) })}
          tone={result.ok === null ? undefined : result.ok ? "ok" : "bad"}
        />
      </div>

      {model.zones.length === 0 && <p className="text-sm text-muted-foreground">{t("noZones")}</p>}
      {result.zones.map((z) => (
        <ZoneBlock key={z.zone.id} z={z} months={months} t={t} tz={tz} />
      ))}
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"building.sia3801">>>;
type TZ = Awaited<ReturnType<typeof getTranslations<"building.zones">>>;

function ZoneBlock({ z, months, t, tz }: { z: ZoneResult; months: string[]; t: T; tz: TZ }) {
  const usage = usageCategories[z.zone.category];
  const cols = ["qT", "qV", "qIEl", "qIP", "qS", "qG", "gamma", "eta", "qUg", "qH"] as const;
  const perM2 = (v: number) => (z.areaE > 0 ? fmt(v / z.areaE, 1) : "–");
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{z.zone.name}</h3>
          <p className="text-xs text-muted-foreground">
            {usage.label} · {tz(`states.${z.zone.state}`)} · θi {fmt(z.thetaInt, 1)} °C · {tz(`regulations.${z.zone.regulation}`)} · {tz(`constructions.${z.zone.construction}`)} · {t("zone.rooms", { count: z.rooms.length })}
          </p>
        </div>
        {z.ok !== null && (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", z.ok ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300")}>
            {!z.ok && <TriangleAlert className="size-3.5" />}
            {z.ok ? t("building.ok") : t("building.notOk")}
          </span>
        )}
      </div>
      {z.warnings.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">{z.warnings.map((w) => t(`warnings.${w}`)).join(" · ")}</p>}
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6 text-sm">
        <Result label={t("building.areaE")} value={fmt(z.areaE, 1)} unit="m²" />
        <Result label={t("building.ath")} value={fmt(z.ath, 1)} unit="m²" hint={`A_th/A_E ${fmt(z.hullRatio, 2)}`} />
        <Result label={t("zone.airflow")} value={fmt(z.airflow, 2)} unit="m³/(h m²)" />
        <Result label="H" value={fmt(z.h, 0)} unit="W/K" hint={`τ ${fmt(z.tau, 0)} h`} />
        <Result label={t("building.qHSpecific")} value={fmt(z.qHSpecific, 1)} unit="kWh/m²" tone={z.ok === null ? undefined : z.ok ? "ok" : "bad"} />
        <Result label={t("building.limit")} value={z.limit === null ? "–" : fmt(z.limit, 1)} unit="kWh/m²" hint={z.target === null ? undefined : t("building.targetHint", { target: fmt(z.target, 1) })} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b text-left">
              <th className="py-1 font-medium">{t("cols.month")}</th>
              <th className="px-1 text-right font-medium">θe</th>
              {cols.map((c) => (
                <th key={c} className="px-1 text-right font-medium">
                  {t(`cols.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {z.months.map((m, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-0.5">{months[i]}</td>
                <td className="px-1 text-right">{fmt(m.thetaE, 1)}</td>
                {cols.map((c) => (
                  <td key={c} className="px-1 text-right">
                    {c === "gamma" || c === "eta" ? fmt(m[c], 2) : fmt(m[c], 0)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t font-medium">
              <td className="py-1">{t("cols.year")}</td>
              <td />
              {cols.map((c) => (
                <td key={c} className="px-1 text-right">
                  {c === "gamma" || c === "eta" ? "" : fmt(z.year[c], 0)}
                </td>
              ))}
            </tr>
            <tr className="text-muted-foreground">
              <td className="py-0.5">kWh/m²</td>
              <td />
              {cols.map((c) => (
                <td key={c} className="px-1 text-right">
                  {c === "gamma" || c === "eta" ? "" : perM2(z.year[c])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <details>
        <summary className="cursor-pointer text-sm font-medium">{t("elements.title", { count: z.elements.length })}</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b text-left">
                <th className="py-1 font-medium">{t("elements.room")}</th>
                <th className="px-1 font-medium">{t("elements.kind")}</th>
                <th className="px-1 font-medium">{t("elements.construction")}</th>
                <th className="px-1 font-medium">{t("elements.orientation")}</th>
                <th className="px-1 font-medium">{t("elements.adjacency")}</th>
                <th className="px-1 text-right font-medium">A [m²]</th>
                <th className="px-1 text-right font-medium">U [W/m²K]</th>
                <th className="px-1 text-right font-medium">b</th>
                <th className="px-1 text-right font-medium">Q_T [kWh]</th>
                <th className="px-1 text-right font-medium">Q_s [kWh]</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {z.elements.map((e) => (
                <tr key={e.sourceId} className="border-b last:border-0">
                  <td className="py-0.5">{e.roomNumber}</td>
                  <td className="px-1">{t(`elements.kinds.${e.kind}`)}</td>
                  <td className="px-1">{e.construction}</td>
                  <td className="px-1">{e.orientation}</td>
                  <td className="px-1">{t(`elements.adjacencies.${e.adjacency}`)}</td>
                  <td className="px-1 text-right">{fmt(e.area, 2)}</td>
                  <td className={cn("px-1 text-right", e.u === null && "text-amber-700 dark:text-amber-400")}>{e.u === null ? "?" : fmt(e.u, 3)}</td>
                  <td className="px-1 text-right">{fmt(e.b, 2)}</td>
                  <td className="px-1 text-right">{fmt(e.qT, 0)}</td>
                  <td className="px-1 text-right">{e.qS === null ? "" : fmt(e.qS, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
