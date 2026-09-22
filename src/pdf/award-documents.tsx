import { Document, Text, View } from "@react-pdf/renderer";

import type { Comparison } from "@/app/(app)/projekte/[id]/lv/[lvId]/vergleich/load-comparison";
import { pickText } from "@/lib/i18n-text";
import { deviationPct, minus } from "@/lib/offer-math";
import { isPosition, round2 } from "@/lib/tree";

import { formatAmount, formatDate, formatQuantity } from "./format";
import { pdfLabels } from "./labels";
import { AddressAndMeta, colors, LetterPage, styles, type LogoSource } from "./letterhead";
import { offerTexts } from "./offer-texts";

const percent = (value: number | null) => (value === null ? "" : `${value > 0.05 ? "+" : ""}${value.toFixed(1)} %`);

const cellRow = { flexDirection: "row" as const, paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: colors.line };

/** Vergabeantrag: ranking of the offers, recommendation and approval signatures. */
export function AwardProposal({ data, logo }: { data: Comparison; logo: LogoSource | null }) {
  const { lv, project, firm, bidders, estimate } = data;
  const language = lv.language;
  const l = pdfLabels(language);
  const tx = offerTexts(language).proposal;
  const cheapest = bidders[0]?.totals.total ?? 0;
  const awarded = bidders.find((b) => b.id === lv.awarded_bidder_id);
  const col = { rank: 32, date: 64, amount: 84, diff: 70 };

  return (
    <Document title={`${tx.title} ${lv.number}`} author={firm.name}>
      <LetterPage firm={firm} logo={logo} pageLabel={l.page}>
        <AddressAndMeta
          recipient={[]}
          meta={[
            [l.project, `${project.number} ${project.name}`],
            [l.lvNo, `${lv.number} ${lv.title}`],
            [l.date, formatDate(new Date())],
          ]}
        />
        <Text style={styles.title}>
          {tx.title} · {l.lv} {lv.number} {lv.title}
        </Text>

        <Text style={{ ...styles.bold, marginBottom: 4 }}>{tx.offers}</Text>
        <View style={{ flexDirection: "row", backgroundColor: colors.headerFill, paddingVertical: 5, paddingHorizontal: 4, ...styles.bold }}>
          <Text style={{ width: col.rank }}>{tx.rank}</Text>
          <Text style={{ flex: 1 }}>{tx.bidder}</Text>
          <Text style={{ width: col.date }}>{tx.offerDate}</Text>
          <Text style={{ width: col.amount, textAlign: "right", paddingLeft: 6 }}>{tx.net}</Text>
          <Text style={{ width: col.amount, textAlign: "right", paddingLeft: 6 }}>{tx.total}</Text>
          <Text style={{ width: col.diff, textAlign: "right", paddingLeft: 6 }}>{tx.vsCheapest}</Text>
        </View>
        {bidders.map((b) => (
          <View key={b.id} wrap={false} style={{ ...cellRow, ...(b.id === lv.awarded_bidder_id ? styles.bold : {}) }}>
            <Text style={{ width: col.rank }}>{b.rank}.</Text>
            <Text style={{ flex: 1 }}>
              {b.company.name}
              {b.company.city ? `, ${b.company.city}` : ""}
            </Text>
            <Text style={{ width: col.date }}>{b.offer_received_at ? formatDate(new Date(b.offer_received_at)) : ""}</Text>
            <Text style={{ width: col.amount, textAlign: "right" }}>{formatAmount(b.totals.netAfterSkonto)}</Text>
            <Text style={{ width: col.amount, textAlign: "right" }}>{formatAmount(b.totals.total)}</Text>
            <Text style={{ width: col.diff, textAlign: "right" }}>{percent(deviationPct(b.totals.total, cheapest))}</Text>
          </View>
        ))}
        <View style={{ ...cellRow, color: colors.muted }}>
          <Text style={{ width: col.rank }} />
          <Text style={{ flex: 1 }}>{tx.estimate}</Text>
          <Text style={{ width: col.date }} />
          <Text style={{ width: col.amount, textAlign: "right" }}>{formatAmount(estimate.net)}</Text>
          <Text style={{ width: col.amount, textAlign: "right" }}>{formatAmount(estimate.total)}</Text>
          <Text style={{ width: col.diff, textAlign: "right" }}>{percent(deviationPct(estimate.total, cheapest))}</Text>
        </View>

        <View wrap={false} style={{ marginTop: 22 }}>
          <Text style={{ ...styles.bold, marginBottom: 4 }}>{tx.recommendation}</Text>
          <Text>{awarded ? tx.recommend(`${awarded.company.name}${awarded.company.city ? `, ${awarded.company.city}` : ""}`, formatAmount(awarded.totals.total)) : tx.noRecommendation}</Text>
          {lv.award_justification && (
            <>
              <Text style={{ ...styles.bold, marginTop: 12, marginBottom: 4 }}>{tx.justification}</Text>
              <Text>{lv.award_justification}</Text>
            </>
          )}
        </View>

        <View wrap={false} style={{ marginTop: 48, flexDirection: "row", justifyContent: "space-between" }}>
          {[tx.proposedBy, tx.approvedBy].map((label, i) => (
            <View key={label} style={{ width: "45%" }}>
              <Text style={styles.bold}>{label}</Text>
              <Text style={{ marginTop: 2 }}>{i === 0 ? firm.name : " "}</Text>
              <View style={{ marginTop: 36, borderTopWidth: 0.5, borderTopColor: colors.text, paddingTop: 4 }}>
                <Text>
                  {l.placeDate} / {l.signature}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </LetterPage>
    </Document>
  );
}

/** Detailed Angebotsvergleich per position (landscape). */
export function ComparisonDocument({ data, logo }: { data: Comparison; logo: LogoSource | null }) {
  const { lv, project, firm, rows, bidders, estimate, estimateGroups } = data;
  const language = lv.language;
  const l = pdfLabels(language);
  const tx = offerTexts(language).comparison;
  const fontSize = bidders.length > 4 ? 6.5 : 7.5;
  const col = { pos: 48, qty: 58, price: bidders.length > 4 ? 44 : 50, amount: bidders.length > 4 ? 52 : 60 };
  const text = (r: (typeof rows)[number]) => pickText(r.short_text, language).value;

  const summary: [string, (t: (typeof bidders)[number]["totals"]) => number, boolean][] = [
    [tx.gross, (t) => t.gross, true],
    [tx.discount, (t) => minus(t.discount), false],
    [tx.deductions, (t) => minus(t.deductions), false],
    [tx.net, (t) => t.net, true],
    [tx.skonto, (t) => minus(t.skonto), false],
    [tx.vat, (t) => t.vat, false],
    [tx.total, (t) => t.total, true],
  ];

  const pair = (price: string, amount: string, highlight?: "min" | "max" | null, key?: string) => (
    <View key={key} style={{ flexDirection: "row", borderLeftWidth: 0.5, borderLeftColor: colors.line, backgroundColor: highlight === "min" ? "#e8f5e9" : highlight === "max" ? "#fdecea" : undefined }}>
      <Text style={{ width: col.price, textAlign: "right" }}>{price}</Text>
      <Text style={{ width: col.amount, textAlign: "right", paddingRight: 2 }}>{amount}</Text>
    </View>
  );

  return (
    <Document title={`${tx.title} ${lv.number}`} author={firm.name}>
      <LetterPage firm={firm} logo={logo} pageLabel={l.page} orientation="landscape">
        <Text style={{ ...styles.title, marginTop: 0 }}>
          {tx.title} · {project.number} {project.name} · {l.lv} {lv.number} {lv.title}
        </Text>

        <View fixed style={{ flexDirection: "row", backgroundColor: colors.headerFill, paddingVertical: 4, paddingHorizontal: 4, fontSize, ...styles.bold }}>
          <Text style={{ width: col.pos }}>{l.pos}</Text>
          <Text style={{ flex: 1 }}>{l.description}</Text>
          <Text style={{ width: col.qty, textAlign: "right", paddingRight: 3 }}>{l.quantity}</Text>
          <Text style={{ width: col.price + col.amount, textAlign: "center" }}>{tx.estimate}</Text>
          {bidders.map((b) => (
            <Text key={b.id} style={{ width: col.price + col.amount, textAlign: "center" }}>
              {b.rank}. {b.company.name}
            </Text>
          ))}
        </View>

        {rows.map((r) => {
          if (r.kind === "text") return null;
          if (r.kind === "group") {
            return (
              <View key={r.id} wrap={false} style={{ ...cellRow, fontSize, ...styles.bold, backgroundColor: "#fafafa" }}>
                <Text style={{ width: col.pos }}>{r.number}</Text>
                <Text style={{ flex: 1 }}>{text(r)}</Text>
                <Text style={{ width: col.qty }} />
                {pair("", formatAmount(estimateGroups[r.id] ?? 0))}
                {bidders.map((b) => pair("", formatAmount(b.groupTotals[r.id] ?? 0), null, b.id))}
              </View>
            );
          }
          if (!isPosition(r.kind)) return null;
          const offered = bidders.map((b) => b.prices[r.id]).filter((p): p is number => p !== null && p !== undefined);
          const min = offered.length > 1 ? Math.min(...offered) : null;
          const max = offered.length > 1 ? Math.max(...offered) : null;
          const qty = r.quantity ?? 0;
          return (
            <View key={r.id} wrap={false} style={{ ...cellRow, fontSize, ...(r.is_optional ? { color: colors.muted } : {}) }}>
              <Text style={{ width: col.pos }}>
                {r.kind === "r_position" ? "R " : ""}
                {r.number}
              </Text>
              <Text style={{ flex: 1, paddingRight: 3 }}>{text(r)}</Text>
              <Text style={{ width: col.qty, textAlign: "right", paddingRight: 3 }}>
                {r.is_lump_sum ? l.lumpSum : `${r.quantity !== null ? formatQuantity(r.quantity) : ""} ${r.unit ?? ""}`}
              </Text>
              {pair(r.unit_price !== null ? formatAmount(r.unit_price) : "", r.unit_price !== null ? formatAmount(round2(qty * r.unit_price)) : "")}
              {bidders.map((b) => {
                const price = b.prices[r.id];
                const has = price !== null && price !== undefined;
                return pair(
                  has ? formatAmount(price) : "–",
                  has ? (r.is_optional ? `(${formatAmount(round2(qty * price))})` : formatAmount(round2(qty * price))) : "",
                  has && price === min ? "min" : has && price === max ? "max" : null,
                  b.id,
                );
              })}
            </View>
          );
        })}

        <View wrap={false} style={{ marginTop: 8 }}>
          {summary.map(([label, value, bold], i) => (
            <View
              key={label}
              style={{
                ...cellRow,
                fontSize,
                ...(bold ? styles.bold : {}),
                ...(i === summary.length - 1 ? { backgroundColor: colors.brand, color: colors.brandText } : {}),
              }}
            >
              <Text style={{ flex: 1 }}>{label}</Text>
              {pair("", formatAmount(value(estimate)))}
              {bidders.map((b) => pair("", formatAmount(value(b.totals)), null, b.id))}
            </View>
          ))}
        </View>
      </LetterPage>
    </Document>
  );
}
