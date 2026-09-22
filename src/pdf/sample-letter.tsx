import { Document, Text, View } from "@react-pdf/renderer";

import type { AppLanguage, FirmSettings } from "@/lib/supabase/types";

import { formatAmount, formatChf, formatDate, formatQuantity, roundTo5Rappen } from "./format";
import { pdfLabels } from "./labels";
import { AddressAndMeta, colors, LetterPage, styles, type LogoSource } from "./letterhead";

// Preview of the letterhead with dummy content, laid out like 2026-XXX_Offerte-Vorlage.xlsx.
const sampleRows = [
  { pos: "31", text: "Vorprojekt", qty: 1, price: 5000 },
  { pos: "32", text: "Bauprojekt", qty: 1, price: 5000 },
  { pos: "33", text: "Bewilligungsverfahren", qty: 1, price: 5000 },
  { pos: "41", text: "Ausschreibung", qty: 1, price: 5000 },
];

const col = { pos: 40, qty: 55, price: 80, total: 90 };

export function SampleLetter({
  firm,
  logo,
  language,
}: {
  firm: FirmSettings;
  logo: LogoSource | null;
  language: AppLanguage;
}) {
  const l = pdfLabels(language);
  const today = new Date();
  const validUntil = new Date(today.getTime() + firm.offer_validity_days * 86_400_000);
  const subtotal = sampleRows.reduce((sum, r) => sum + r.qty * r.price, 0);
  const vat = roundTo5Rappen((subtotal * firm.vat_rate) / 100);
  const offerNo = "2026-000";
  const project = "Musterprojekt, Musterstadt";

  return (
    <Document title={`${l.offer} ${offerNo}`} author={firm.name}>
      <LetterPage firm={firm} logo={logo} pageLabel={l.page}>
        <AddressAndMeta
          recipient={["Muster AG", "Frau Beispiel", "Musterstrasse 1", "8000 Zürich"]}
          meta={[
            [l.offerNo, offerNo],
            [l.date, formatDate(today)],
            [l.project, project],
            [l.uid, firm.uid_number ?? ""],
            [l.bank, firm.bank_name ?? ""],
            [l.iban, firm.iban ?? ""],
            [l.bic, firm.bic ?? ""],
          ]}
        />

        <Text style={styles.title}>
          {l.offer} {offerNo} / {project}
        </Text>

        {/* Table header */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: colors.headerFill,
            paddingVertical: 5,
            paddingHorizontal: 4,
            fontFamily: "Helvetica-Bold",
          }}
        >
          <Text style={{ width: col.pos }}>{l.pos}</Text>
          <Text style={{ flex: 1 }}>{l.description}</Text>
          <Text style={{ width: col.qty, textAlign: "right" }}>{l.quantity}</Text>
          <Text style={{ width: col.price, textAlign: "right" }}>{l.price}</Text>
          <Text style={{ width: col.total, textAlign: "right" }}>{l.total}</Text>
        </View>

        {sampleRows.map((row) => (
          <View
            key={row.pos}
            wrap={false}
            style={{
              flexDirection: "row",
              paddingVertical: 4,
              paddingHorizontal: 4,
              borderBottomWidth: 0.5,
              borderBottomColor: colors.line,
            }}
          >
            <Text style={{ width: col.pos }}>{row.pos}</Text>
            <Text style={{ flex: 1 }}>{row.text}</Text>
            <Text style={{ width: col.qty, textAlign: "right" }}>{formatQuantity(row.qty)}</Text>
            <Text style={{ width: col.price, textAlign: "right" }}>{formatAmount(row.price)}</Text>
            <Text style={{ width: col.total, textAlign: "right" }}>{formatAmount(row.qty * row.price)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={{ marginTop: 10, paddingHorizontal: 4 }}>
          <View style={{ flexDirection: "row", paddingVertical: 3 }}>
            <Text style={{ flex: 1, ...styles.bold }}>{l.subtotal}</Text>
            <Text style={{ width: col.total, textAlign: "right", ...styles.bold }}>
              {formatAmount(subtotal)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", paddingVertical: 3 }}>
            <Text style={{ flex: 1 }}>
              {l.vat} {formatQuantity(firm.vat_rate)}%
            </Text>
            <Text style={{ width: col.total, textAlign: "right" }}>{formatAmount(vat)}</Text>
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            marginTop: 6,
            paddingVertical: 6,
            paddingHorizontal: 4,
            backgroundColor: colors.brand,
            color: colors.brandText,
            fontFamily: "Helvetica-Bold",
            fontSize: 11,
          }}
        >
          <Text style={{ flex: 1 }}>
            {l.grandTotal} {l.inclVat}
          </Text>
          <Text style={{ width: 120, textAlign: "right" }}>{formatChf(subtotal + vat)}</Text>
        </View>

        <View style={{ marginTop: 28 }}>
          <Text>
            {l.validUntil} {formatDate(validUntil)}
          </Text>
          <Text style={{ marginTop: 24 }}>{l.regards}</Text>
          <Text style={{ marginTop: 40 }}>{firm.managing_director}</Text>
          <Text>{l.managingDirector}</Text>
        </View>
      </LetterPage>
    </Document>
  );
}
