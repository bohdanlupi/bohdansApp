import { Document, Text, View } from "@react-pdf/renderer";

import type { CostRow } from "@/lib/cost-plan";
import type { AppLanguage, FirmSettings } from "@/lib/supabase/types";
import { round2 } from "@/lib/tree";

import { formatAmount, formatDate, formatQuantity, roundTo5Rappen } from "./format";
import { pdfLabels } from "./labels";
import { AddressAndMeta, colors, LetterPage, styles, type LogoSource } from "./letterhead";

const col = { code: 50, amount: 78 };

/** Kostenvoranschlag: used cost codes with budget, KV and difference, plus VAT. */
export function KvDocument({
  firm,
  logo,
  language,
  project,
  templateName,
  rows,
}: {
  firm: FirmSettings;
  logo: LogoSource | null;
  language: AppLanguage;
  project: { number: string; name: string; city: string | null };
  templateName: string | null;
  rows: CostRow[];
}) {
  const l = pdfLabels(language);
  const grand = rows.find((r) => r.depth === -1)!.total;
  const used = rows.filter((r) => r.depth >= 0 && r.used);
  const vatBudget = roundTo5Rappen((grand.budget * firm.vat_rate) / 100);
  const vatKv = roundTo5Rappen((grand.kv * firm.vat_rate) / 100);
  const amount = (v: number) => (v ? formatAmount(v) : "");

  const line = (label: string, budget: number, kv: number, bold = false) => (
    <View style={{ flexDirection: "row", paddingVertical: 3, paddingHorizontal: 4, ...(bold ? styles.bold : {}) }}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Text style={{ width: col.amount, textAlign: "right" }}>{formatAmount(budget)}</Text>
      <Text style={{ width: col.amount, textAlign: "right" }}>{formatAmount(kv)}</Text>
      <Text style={{ width: col.amount, textAlign: "right" }}>{formatAmount(round2(kv - budget))}</Text>
    </View>
  );

  return (
    <Document title={`${l.kv} ${project.number}`} author={firm.name}>
      <LetterPage firm={firm} logo={logo} pageLabel={l.page}>
        <AddressAndMeta
          recipient={[]}
          meta={[
            [l.project, `${project.number} ${project.name}`],
            [l.costPlan, templateName ?? ""],
            [l.date, formatDate(new Date())],
          ]}
        />
        <Text style={styles.title}>
          {l.kv} · {project.number} {project.name}
        </Text>

        <View fixed style={{ flexDirection: "row", backgroundColor: colors.headerFill, paddingVertical: 5, paddingHorizontal: 4, ...styles.bold }}>
          <Text style={{ width: col.code }}>{l.code}</Text>
          <Text style={{ flex: 1 }}>{l.description}</Text>
          <Text style={{ width: col.amount, textAlign: "right" }}>{l.budget}</Text>
          <Text style={{ width: col.amount, textAlign: "right" }}>{l.kvAmount}</Text>
          <Text style={{ width: col.amount, textAlign: "right" }}>{l.difference}</Text>
        </View>

        {used.map((row) => (
          <View
            key={row.item.id}
            wrap={false}
            style={{
              flexDirection: "row",
              paddingVertical: 3,
              paddingHorizontal: 4,
              borderBottomWidth: 0.5,
              borderBottomColor: colors.line,
              ...(row.hasChildren ? styles.bold : {}),
              ...(row.depth === 0 ? { backgroundColor: "#fafafa" } : {}),
            }}
          >
            <Text style={{ width: col.code, paddingLeft: row.depth * 5 }}>{row.item.code}</Text>
            <Text style={{ flex: 1, paddingRight: 4 }}>{row.name}</Text>
            <Text style={{ width: col.amount, textAlign: "right" }}>{amount(row.total.budget)}</Text>
            <Text style={{ width: col.amount, textAlign: "right" }}>{amount(row.total.kv)}</Text>
            <Text style={{ width: col.amount, textAlign: "right" }}>
              {row.total.budget || row.total.kv ? formatAmount(round2(row.total.kv - row.total.budget)) : ""}
            </Text>
          </View>
        ))}

        <View wrap={false} style={{ marginTop: 10 }}>
          {line(l.totalExclVat, grand.budget, grand.kv, true)}
          {line(`${l.vat} ${formatQuantity(firm.vat_rate)}%`, vatBudget, vatKv)}
          <View
            style={{
              flexDirection: "row",
              marginTop: 4,
              paddingVertical: 6,
              paddingHorizontal: 4,
              backgroundColor: colors.brand,
              color: colors.brandText,
              ...styles.bold,
            }}
          >
            <Text style={{ flex: 1 }}>{l.totalInclVat}</Text>
            <Text style={{ width: col.amount, textAlign: "right" }}>{formatAmount(round2(grand.budget + vatBudget))}</Text>
            <Text style={{ width: col.amount, textAlign: "right" }}>{formatAmount(round2(grand.kv + vatKv))}</Text>
            <Text style={{ width: col.amount, textAlign: "right" }}>
              {formatAmount(round2(grand.kv + vatKv - (grand.budget + vatBudget)))}
            </Text>
          </View>
        </View>
      </LetterPage>
    </Document>
  );
}
