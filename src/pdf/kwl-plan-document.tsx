import { Document, Text, View } from "@react-pdf/renderer";

import { isHandled, type Phase, phaseItems } from "@/lib/kwl/phases";
import type { PlanData } from "@/lib/kwl/plan-schema";
import type { AppLanguage, FirmSettings } from "@/lib/supabase/types";

import { formatDate } from "./format";
import type { KwlTranslate } from "./kwl-document";
import { AddressAndMeta, colors, LetterPage, styles, type LogoSource } from "./letterhead";

// Helvetica only has WinAnsi glyphs.
const winAnsi = (text: string) =>
  text.replace(/→/g, "->").replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/[₂]/g, "2").replace(/⁻¹/g, "-1").replace(/×/g, "x").replace(/–/g, "-");

/** KWL-Planung: design criteria and checklist status of the chosen SIA 108 phases. */
export function KwlPlanDocument({
  firm,
  logo,
  t: translate,
  language,
  pageLabel,
  projectLabel,
  dateLabel,
  project,
  plan,
  phases,
}: {
  firm: FirmSettings;
  logo: LogoSource | null;
  /** Translator for the `kwlPlan` namespace. */
  t: KwlTranslate;
  language: AppLanguage;
  pageLabel: (page: number, total: number) => string;
  projectLabel: string;
  dateLabel: string;
  project: { number: string; name: string };
  plan: PlanData;
  phases: Phase[];
}) {
  const t: KwlTranslate = (key, values) => winAnsi(translate(key, values));
  const p = plan.params;
  const o = (group: string, value: string) => t(`options.${group}.${value}`);
  const criteria: [string, string][] = [
    [t("params.buildingType"), o("buildingType", p.buildingType)],
    [t("params.construction"), o("construction", p.construction)],
    [t("params.system"), o("system", p.system)],
    [t("params.unit"), o("unit", p.unit) + (p.unit === "multi" && p.simultaneity ? ` (${p.simultaneity})` : "")],
    [t("params.operation"), o("operation", p.operation)],
    [t("params.standard"), o("standard", p.standard)],
    [t("params.dwellings"), p.dwellings === null ? "-" : String(p.dwellings)],
    [t("params.altitude"), p.altitude === null ? "-" : `${p.altitude} m`],
    [t("params.fireplace"), o("fireplace", p.fireplace)],
    [t("params.kitchen"), o("kitchen", p.kitchen)],
    [t("params.airtightness"), o("airtightness", p.airtightness)],
    [t("params.noise"), o("noise", p.noise)],
  ];
  const title = `${t("title")} · ${project.number} ${project.name}`;

  return (
    <Document title={title} author={firm.name}>
      <LetterPage firm={firm} logo={logo} pageLabel={pageLabel}>
        <AddressAndMeta
          recipient={[]}
          meta={[
            [projectLabel, `${project.number} ${project.name}`],
            [dateLabel, formatDate(new Date())],
          ]}
        />
        <Text style={styles.title}>{title}</Text>

        <Text style={{ ...styles.bold, color: colors.brand, marginBottom: 4 }}>{t("criteria.title")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 6 }}>
          {criteria.map(([label, value]) => (
            <View key={label} style={{ width: "50%", flexDirection: "row", paddingVertical: 1.5, fontSize: 8.5 }}>
              <Text style={{ width: 110, color: colors.muted }}>{label}</Text>
              <Text style={{ flex: 1, paddingRight: 6 }}>{winAnsi(value)}</Text>
            </View>
          ))}
        </View>

        {phases.map((phase) => {
          const items = phaseItems(phase, p);
          const done = items.filter((item) => isHandled(plan.checks[item.id])).length;
          const note = plan.notes[phase.code]?.trim();
          return (
            <View key={phase.code} style={{ marginTop: 12 }}>
              <View wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: colors.headerFill, paddingVertical: 4, paddingHorizontal: 4 }}>
                <Text style={styles.bold}>
                  {phase.code} {winAnsi(phase.title[language])}
                </Text>
                <Text style={{ fontSize: 8.5 }}>
                  {done}/{items.length}
                </Text>
              </View>
              <Text style={{ fontSize: 8, color: colors.muted, marginVertical: 3 }}>{winAnsi(phase.goal[language])}</Text>
              {items.map((item) => {
                const state = plan.checks[item.id];
                const mark = state?.s === "done" ? "X" : state?.s === "na" ? "-" : " ";
                return (
                  <View key={item.id} wrap={false} style={{ flexDirection: "row", paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: colors.line, fontSize: 8.5 }}>
                    <Text style={{ width: 14, height: 10, borderWidth: 0.7, borderColor: colors.text, textAlign: "center", fontSize: 7.5, marginRight: 6, marginTop: 0.5 }}>
                      {mark}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={state?.s === "na" ? { color: colors.muted } : {}}>{winAnsi(item.text[language])}</Text>
                      {state?.n && <Text style={{ fontSize: 7.5, color: colors.brand }}>{winAnsi(state.n)}</Text>}
                    </View>
                    <Text style={{ width: 100, textAlign: "right", fontSize: 7, color: colors.muted }}>
                      {item.ref.startsWith("SIA") ? item.ref : `SIA 382/5 ${item.ref}`}
                    </Text>
                  </View>
                );
              })}
              {note && (
                <Text style={{ fontSize: 8.5, marginTop: 4 }}>
                  {t("phaseNotes")}: {winAnsi(note)}
                </Text>
              )}
            </View>
          );
        })}
        <Text style={{ fontSize: 7, color: colors.muted, marginTop: 12 }}>{t("normsHint")}</Text>
      </LetterPage>
    </Document>
  );
}
