import { Document, Text, View } from "@react-pdf/renderer";

import { type CreditorCategory, inputTaxZiffer, type VatIncoming, type VatOutgoing, type VatReport } from "@/lib/creditors";
import type { FirmSettings } from "@/lib/supabase/types";

import { formatAmount, formatDate, formatQuantity } from "./format";
import { colors, LetterPage, type LogoSource, styles } from "./letterhead";

const categoryLabels: Record<CreditorCategory, string> = {
  material: "Material",
  subcontractor: "Fremdleistung",
  office: "Büro/Verwaltung",
  vehicle: "Fahrzeug",
  software: "Software/IT",
  rent: "Miete",
  investment: "Investition",
  other: "Übriges",
};

const outputTaxLabel = (rate: number) =>
  rate === 8.1 ? "Normalsatz" : rate === 2.6 ? "Reduzierter Satz" : rate === 3.8 ? "Beherbergungssatz" : "Steuersatz";

const date = (iso: string) => formatDate(new Date(iso));

type Column<T> = { label: string; width: number | "flex"; right?: boolean; value: (row: T) => string };

/** Compact table with a header row, one row per entry and an optional bold total row. */
function Table<T>({ columns, rows, total }: { columns: Column<T>[]; rows: T[]; total?: Record<number, string> }) {
  const cellStyle = (c: Column<T>) => ({
    ...(c.width === "flex" ? { flex: 1 } : { width: c.width }),
    paddingHorizontal: 3,
    textAlign: c.right ? ("right" as const) : ("left" as const),
  });
  return (
    <View style={{ fontSize: 8 }}>
      <View style={{ flexDirection: "row", backgroundColor: colors.headerFill, paddingVertical: 4, ...styles.bold }} fixed>
        {columns.map((c, i) => (
          <Text key={i} style={cellStyle(c)}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: colors.line }} wrap={false}>
          {columns.map((c, i) => (
            <Text key={i} style={cellStyle(c)}>
              {c.value(row)}
            </Text>
          ))}
        </View>
      ))}
      {total && (
        <View style={{ flexDirection: "row", paddingVertical: 4, ...styles.bold }} wrap={false}>
          {columns.map((c, i) => (
            <Text key={i} style={cellStyle(c)}>
              {total[i] ?? ""}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Documentation of the quarterly MWST-Abrechnung (effective method, vereinbarte Entgelte): totals by ESTV Ziffer,
 * the outgoing and the received invoices of the quarter. The receipts are appended by the route (pdf-lib).
 */
export function VatReportDocument({
  firm,
  logo,
  period,
  report,
  outgoing,
  incoming,
}: {
  firm: FirmSettings;
  logo: LogoSource | null;
  period: { year: number; quarter: number; from: string; to: string };
  report: VatReport;
  outgoing: VatOutgoing[];
  incoming: VatIncoming[];
}) {
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const title = `MWST-Abrechnung ${period.quarter}. Quartal ${period.year}`;
  const meta: [string, string][] = [
    ["Steuerpflichtige", firm.name],
    ...(firm.uid_number ? ([["MWST-Nr.", firm.uid_number]] as [string, string][]) : []),
    ["Abrechnungsperiode", `${date(period.from)} – ${date(period.to)}`],
    ["Methode", "Effektive Abrechnungsmethode, vereinbarte Entgelte"],
    ["Erstellt am", formatDate(new Date())],
  ];

  type Line = { ziffer: string; text: string; base?: number; tax?: number; bold?: boolean };
  const lines: Line[] = [
    { ziffer: "200", text: "Total der vereinbarten Entgelte (exkl. MWST)", base: report.revenue },
    { ziffer: "289", text: "Total Abzüge (Ziffern 220 bis 280)", base: 0 },
    { ziffer: "299", text: "Steuerbarer Gesamtumsatz", base: report.revenue, bold: true },
    ...report.outputTax.map((r) => ({ ziffer: String(r.ziffer ?? ""), text: `${outputTaxLabel(r.rate)} ${formatQuantity(r.rate)} %`, base: r.base, tax: r.tax })),
    { ziffer: "399", text: "Total geschuldete Steuer", tax: report.outputTaxTotal, bold: true },
    { ziffer: "400", text: "Vorsteuer auf Material- und Dienstleistungsaufwand", tax: report.inputTax400 },
    { ziffer: "405", text: "Vorsteuer auf Investitionen und übrigem Betriebsaufwand", tax: report.inputTax405 },
    { ziffer: "479", text: "Total Vorsteuer", tax: report.inputTaxTotal, bold: true },
    report.balance >= 0
      ? { ziffer: "500", text: "Zu bezahlender Betrag", tax: report.balance, bold: true }
      : { ziffer: "510", text: "Guthaben der steuerpflichtigen Person", tax: -report.balance, bold: true },
  ];

  const outColumns: Column<VatOutgoing>[] = [
    { label: "Rechnung", width: 78, value: (o) => o.number },
    { label: "Datum", width: 50, value: (o) => date(o.date) },
    { label: "Auftraggeber", width: "flex", value: (o) => o.client },
    { label: "Projekt", width: "flex", value: (o) => o.project },
    { label: "Netto", width: 62, right: true, value: (o) => formatAmount(o.net) },
    { label: "MWST", width: 52, right: true, value: (o) => formatAmount(o.vat) },
    { label: "Total", width: 62, right: true, value: (o) => formatAmount(o.total) },
  ];
  const inColumns: Column<VatIncoming>[] = [
    { label: "Beleg", width: 30, value: (i) => (i.attachment ? String(i.attachment) : "–") },
    { label: "Datum", width: 50, value: (i) => date(i.date) },
    { label: "Lieferant", width: "flex", value: (i) => i.supplier },
    { label: "Rechnung", width: 60, value: (i) => i.number },
    { label: "Kategorie", width: 66, value: (i) => categoryLabels[i.category as CreditorCategory] ?? i.category },
    { label: "Ziff.", width: 26, value: (i) => (i.vat ? String(inputTaxZiffer(i.category)) : "") },
    { label: "Satz", width: 32, right: true, value: (i) => `${formatQuantity(i.rate)} %` },
    { label: "Netto", width: 56, right: true, value: (i) => formatAmount(i.net) },
    { label: "Vorsteuer", width: 50, right: true, value: (i) => formatAmount(i.vat) },
    { label: "Total", width: 56, right: true, value: (i) => formatAmount(i.total) },
  ];

  return (
    <Document title={`${title} – ${firm.name}`} author={firm.name}>
      <LetterPage firm={firm} logo={logo} pageLabel={(p, n) => `Seite ${p} von ${n}`}>
        <Text style={{ ...styles.title, fontSize: 14, marginTop: 0 }}>{title}</Text>
        {meta.map(([label, value]) => (
          <View key={label} style={{ flexDirection: "row", marginBottom: 2 }}>
            <Text style={{ width: 110, color: colors.muted }}>{label}</Text>
            <Text style={{ flex: 1 }}>{value}</Text>
          </View>
        ))}

        <Text style={{ ...styles.bold, fontSize: 11, marginTop: 18, marginBottom: 6 }}>1 Übersicht nach ESTV-Formular</Text>
        <View style={{ flexDirection: "row", backgroundColor: colors.headerFill, paddingVertical: 4, paddingHorizontal: 3, ...styles.bold }}>
          <Text style={{ width: 40 }}>Ziffer</Text>
          <Text style={{ flex: 1 }}>Bezeichnung</Text>
          <Text style={{ width: 90, textAlign: "right" }}>Umsatz CHF</Text>
          <Text style={{ width: 90, textAlign: "right" }}>Steuer CHF</Text>
        </View>
        {lines.map((l, i) => (
          <View key={i} style={{ flexDirection: "row", paddingVertical: 3, paddingHorizontal: 3, borderBottomWidth: 0.5, borderBottomColor: colors.line, ...(l.bold ? styles.bold : {}) }}>
            <Text style={{ width: 40 }}>{l.ziffer}</Text>
            <Text style={{ flex: 1 }}>{l.text}</Text>
            <Text style={{ width: 90, textAlign: "right" }}>{l.base === undefined ? "" : formatAmount(l.base)}</Text>
            <Text style={{ width: 90, textAlign: "right" }}>{l.tax === undefined ? "" : formatAmount(l.tax)}</Text>
          </View>
        ))}
        <Text style={{ marginTop: 6, fontSize: 8, color: colors.muted }}>
          Umsätze: versendete und bezahlte Honorarrechnungen nach Rechnungsdatum (Akonto-Abzüge berücksichtigt). Vorsteuer: alle erfassten
          Eingangsrechnungen nach Rechnungsdatum.
        </Text>

        <Text style={{ ...styles.bold, fontSize: 11, marginTop: 18, marginBottom: 6 }} minPresenceAhead={60}>
          2 Ausgangsrechnungen ({outgoing.length})
        </Text>
        {outgoing.length ? (
          <Table
            columns={outColumns}
            rows={outgoing}
            total={{ 0: "Total", 4: formatAmount(sum(outgoing.map((o) => o.net))), 5: formatAmount(sum(outgoing.map((o) => o.vat))), 6: formatAmount(sum(outgoing.map((o) => o.total))) }}
          />
        ) : (
          <Text style={{ color: colors.muted }}>Keine Ausgangsrechnungen in dieser Periode.</Text>
        )}

        <Text style={{ ...styles.bold, fontSize: 11, marginTop: 18, marginBottom: 6 }} minPresenceAhead={60}>
          3 Eingangsrechnungen ({incoming.length})
        </Text>
        {incoming.length ? (
          <Table
            columns={inColumns}
            rows={incoming}
            total={{ 0: "Total", 7: formatAmount(sum(incoming.map((i) => i.net))), 8: formatAmount(sum(incoming.map((i) => i.vat))), 9: formatAmount(sum(incoming.map((i) => i.total))) }}
          />
        ) : (
          <Text style={{ color: colors.muted }}>Keine Eingangsrechnungen in dieser Periode.</Text>
        )}
        {incoming.some((i) => i.attachment) && (
          <Text style={{ marginTop: 6, fontSize: 8, color: colors.muted }}>Die Belege sind im Anhang nach ihrer Nummer (Spalte «Beleg») angefügt.</Text>
        )}
      </LetterPage>
    </Document>
  );
}
