import { Document, Text, View } from "@react-pdf/renderer";

import { type CheckState, isHandled } from "@/lib/planning";
import type { FirmSettings } from "@/lib/supabase/types";

import { formatDate } from "./format";
import { AddressAndMeta, colors, LetterPage, styles, type LogoSource } from "./letterhead";

// Helvetica only has WinAnsi glyphs.
export const planWinAnsi = (text: string) =>
  text
    .replace(/→/g, "->")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/[₂]/g, "2")
    .replace(/⁻¹/g, "-1")
    .replace(/×/g, "x")
    .replace(/–/g, "-")
    .replace(/−/g, "-");

export type PdfPlanPhase = { code: string; title: string; goal: string; items: { id: string; text: string; ref: string }[] };

/** Planning dossier: design criteria and the checklist status of the chosen SIA 108 phases (texts localized). */
export function PlanChecklistDocument({
  firm,
  logo,
  pageLabel,
  projectLabel,
  dateLabel,
  project,
  title: heading,
  criteriaTitle,
  criteria,
  phases,
  checks,
  notes,
  phaseNotesLabel,
  normsHint,
}: {
  firm: FirmSettings;
  logo: LogoSource | null;
  pageLabel: (page: number, total: number) => string;
  projectLabel: string;
  dateLabel: string;
  project: { number: string; name: string };
  title: string;
  criteriaTitle: string;
  criteria: [string, string][];
  phases: PdfPlanPhase[];
  checks: Record<string, CheckState>;
  notes: Record<string, string>;
  phaseNotesLabel: string;
  normsHint: string;
}) {
  const w = planWinAnsi;
  const title = `${w(heading)} · ${project.number} ${project.name}`;

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

        <Text style={{ ...styles.bold, color: colors.brand, marginBottom: 4 }}>{w(criteriaTitle)}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 6 }}>
          {criteria.map(([label, value]) => (
            <View key={label} style={{ width: "50%", flexDirection: "row", paddingVertical: 1.5, fontSize: 8.5 }}>
              <Text style={{ width: 110, color: colors.muted }}>{w(label)}</Text>
              <Text style={{ flex: 1, paddingRight: 6 }}>{w(value)}</Text>
            </View>
          ))}
        </View>

        {phases.map((phase) => {
          const done = phase.items.filter((item) => isHandled(checks[item.id])).length;
          const note = notes[phase.code]?.trim();
          return (
            <View key={phase.code} style={{ marginTop: 12 }}>
              <View wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: colors.headerFill, paddingVertical: 4, paddingHorizontal: 4 }}>
                <Text style={styles.bold}>
                  {phase.code} {w(phase.title)}
                </Text>
                <Text style={{ fontSize: 8.5 }}>
                  {done}/{phase.items.length}
                </Text>
              </View>
              <Text style={{ fontSize: 8, color: colors.muted, marginVertical: 3 }}>{w(phase.goal)}</Text>
              {phase.items.map((item) => {
                const state = checks[item.id];
                const mark = state?.s === "done" ? "X" : state?.s === "na" ? "-" : " ";
                return (
                  <View key={item.id} wrap={false} style={{ flexDirection: "row", paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: colors.line, fontSize: 8.5 }}>
                    <Text style={{ width: 14, height: 10, borderWidth: 0.7, borderColor: colors.text, textAlign: "center", fontSize: 7.5, marginRight: 6, marginTop: 0.5 }}>
                      {mark}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={state?.s === "na" ? { color: colors.muted } : {}}>{w(item.text)}</Text>
                      {state?.n && <Text style={{ fontSize: 7.5, color: colors.brand }}>{w(state.n)}</Text>}
                    </View>
                    <Text style={{ width: 100, textAlign: "right", fontSize: 7, color: colors.muted }}>{w(item.ref)}</Text>
                  </View>
                );
              })}
              {note && (
                <Text style={{ fontSize: 8.5, marginTop: 4 }}>
                  {w(phaseNotesLabel)}: {w(note)}
                </Text>
              )}
            </View>
          );
        })}
        <Text style={{ fontSize: 7, color: colors.muted, marginTop: 12 }}>{w(normsHint)}</Text>
      </LetterPage>
    </Document>
  );
}
