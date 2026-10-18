import { Document, Page, Text, View } from "@react-pdf/renderer";

import type { InvoiceLine, InvoiceTotals } from "@/lib/fees/invoice";
import type { FeeOfferData } from "@/lib/fees/offer-schema";
import { phaseLabel, tradeNames } from "@/lib/fees/options";
import type { QrBill } from "@/lib/qr-bill";
import type { AppLanguage, FirmSettings } from "@/lib/supabase/types";

import { feeInvoiceTexts } from "./fee-invoice-texts";
import { formatAmount, formatDate, formatQuantity } from "./format";
import { pdfLabels } from "./labels";
import { AddressAndMeta, colors, LetterPage, type LogoSource, styles } from "./letterhead";
import { QrPaymentPart } from "./qr-bill";

export type FeeInvoicePdf = {
  number: string;
  invoiceDate: string;
  dueDate: string | null;
  offerNumber: string;
  projectLine: string;
  language: AppLanguage;
  offer: FeeOfferData;
  text: string;
  totals: InvoiceTotals;
  /** Number of the previous invoice of the offer (null = first invoice). */
  previousNumber: string | null;
};

const COL = 70;
const PCT_COL = 44;
const TOTAL_COL = 82;

const fmtPct = (value: number) => `${formatQuantity(value)} %`;

/** Honorarrechnung: cumulative Leistungsstand per trade and phase, deduction of the previous invoice, QR payment part. */
export function FeeInvoiceDocument({
  firm,
  logo,
  invoice,
  recipient,
  vatRate,
  qr,
}: {
  firm: FirmSettings;
  logo: LogoSource | null;
  invoice: FeeInvoicePdf;
  recipient: string[];
  vatRate: number;
  /** QR payment part (null without a valid IBAN or for credit notes). */
  qr: QrBill | null;
}) {
  const { language, totals, offer } = invoice;
  const l = pdfLabels(language);
  const tx = feeInvoiceTexts(language);
  const pct = (value: number) => formatQuantity(value);
  const due = invoice.dueDate ? formatDate(new Date(invoice.dueDate)) : null;

  const cell = { flexDirection: "row" as const, paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: colors.line };
  const num = (value: string, width = COL) => <Text style={{ width, textAlign: "right" }}>{value}</Text>;
  const lineRow = (key: string, label: string, x: InvoiceLine) => (
    <View key={key} style={cell} wrap={false}>
      <Text style={{ flex: 1, paddingRight: 4 }}>{label}</Text>
      {num(formatAmount(x.fee))}
      {num(fmtPct(x.pct), PCT_COL)}
      {num(formatAmount(x.earned))}
      {num(formatAmount(x.prevEarned))}
      {num(formatAmount(x.amount), TOTAL_COL)}
    </View>
  );
  const groupHeader = (label: string) => (
    <View style={{ ...cell, ...styles.bold }} wrap={false} minPresenceAhead={30}>
      <Text style={{ flex: 1 }}>{label}</Text>
    </View>
  );
  const row = (label: string, value: number, opts: { bold?: boolean; negative?: boolean } = {}) => (
    <View style={{ flexDirection: "row", paddingVertical: 2, paddingHorizontal: 4, ...(opts.bold ? styles.bold : {}) }}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Text style={{ width: TOTAL_COL, textAlign: "right" }}>
        {opts.negative && value ? "-" : ""}
        {formatAmount(value)}
      </Text>
    </View>
  );

  return (
    <Document title={`${tx.invoiceNo} ${invoice.number} – ${invoice.projectLine}`} author={firm.name}>
      <LetterPage firm={firm} logo={logo} pageLabel={l.page}>
        <AddressAndMeta
          recipient={recipient}
          meta={[
            [tx.invoiceNo, invoice.number],
            [l.date, formatDate(new Date(invoice.invoiceDate))],
            [tx.offerNo, invoice.offerNumber],
            ...(due ? ([[tx.dueDate, due]] as [string, string][]) : []),
            ...(firm.uid_number ? ([[tx.vatNo, firm.uid_number]] as [string, string][]) : []),
          ]}
        />
        <Text style={{ ...styles.title, marginTop: 36 }}>{tx.title(invoice.projectLine)}</Text>
        <Text style={{ marginBottom: 12 }}>{tx.intro(invoice.offerNumber)}</Text>
        {invoice.text
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p, i) => (
            <Text key={i} style={{ marginBottom: 6 }}>
              {p}
            </Text>
          ))}

        <View style={{ flexDirection: "row", backgroundColor: colors.headerFill, paddingVertical: 5, paddingHorizontal: 4, marginTop: 6, ...styles.bold }}>
          <Text style={{ flex: 1 }}>{tx.phase}</Text>
          {num(tx.fee)}
          {num(tx.pct, PCT_COL)}
          {num(tx.earned)}
          {num(tx.previous)}
          {num(tx.amount, TOTAL_COL)}
        </View>
        {totals.trades.map((t) => (
          <View key={t.trade}>
            {groupHeader(tradeNames[t.trade][language])}
            {t.phases.map((p) => lineRow(p.phase, phaseLabel(p.phase, language), p))}
          </View>
        ))}
        {totals.extras.length > 0 && (
          <View>
            {groupHeader(tx.extras)}
            {totals.extras.map((e) => lineRow(e.id, e.text || "–", e))}
          </View>
        )}

        <View wrap={false} style={{ marginTop: 10, marginLeft: "40%" }}>
          {row(tx.earnedTotal, totals.current.subtotal)}
          {offer.discountPct > 0 && row(tx.discount(pct(offer.discountPct)), totals.current.discount, { negative: true })}
          {offer.expensesPct > 0 && row(tx.expenses(pct(offer.expensesPct)), totals.current.expenses)}
          {row(tx.earnedNet, totals.current.net, { bold: true })}
          {invoice.previousNumber && row(tx.previousInvoice(invoice.previousNumber), totals.previous.net, { negative: true })}
          {row(tx.net, totals.net, { bold: true })}
          {row(tx.vat(pct(vatRate)), totals.vat)}
          <View style={{ flexDirection: "row", marginTop: 4, paddingVertical: 6, paddingHorizontal: 4, backgroundColor: colors.brand, color: colors.brandText, ...styles.bold }}>
            <Text style={{ flex: 1 }}>{tx.gross}</Text>
            <Text style={{ width: TOTAL_COL, textAlign: "right" }}>{formatAmount(totals.total)}</Text>
          </View>
        </View>

        <View wrap={false} style={{ marginTop: 18 }}>
          {due && <Text style={{ marginBottom: 6 }}>{qr ? tx.payment(due) : tx.paymentNoQr(due)}</Text>}
          {!qr && firm.iban && (
            <Text style={{ marginBottom: 6 }}>
              {[firm.bank_name, `IBAN ${firm.iban}`, firm.bic ? `BIC ${firm.bic}` : null].filter(Boolean).join(" · ")}
            </Text>
          )}
          <Text style={{ marginBottom: 6 }}>{tx.thanks}</Text>
          <Text style={{ marginTop: 10 }}>{tx.closing}</Text>
          <Text style={{ marginTop: 6 }}>{firm.name}</Text>
        </View>
      </LetterPage>

      {qr && (
        <Page size="A4" style={{ fontFamily: "Helvetica", fontSize: 10, color: colors.text }}>
          <QrPaymentPart bill={qr} tx={tx.qr} />
        </Page>
      )}
    </Document>
  );
}
