import { Document, Text, View } from "@react-pdf/renderer";

import { pickText, type I18nText } from "@/lib/i18n-text";
import type { AppLanguage, FirmSettings } from "@/lib/supabase/types";
import { childrenMap, groupTotals, isPosition, positionTotal, round2, type NodeKind } from "@/lib/tree";

import { formatAmount, formatChf, formatDate, formatQuantity, roundTo5Rappen } from "./format";
import { pdfLabels } from "./labels";
import { AddressAndMeta, colors, LetterPage, styles, type LogoSource } from "./letterhead";

export type PdfNode = {
  id: string;
  parent_id: string | null;
  kind: NodeKind;
  sort: number;
  number: string | null;
  short_text: I18nText;
  long_text: I18nText;
  unit: string | null;
  quantity: number | null;
  unit_price: number | null;
  is_optional: boolean;
  is_lump_sum: boolean;
};

const col = { pos: 62, qty: 46, unit: 44, price: 58, amount: 70 };
const blank = "..............";

/**
 * Leistungsverzeichnis. `withPrices`: estimate version with unit prices and totals;
 * otherwise the tender version with empty price columns for the bidders.
 */
export function LvDocument({
  firm,
  logo,
  language,
  project,
  lv,
  nodes,
  withPrices,
}: {
  firm: FirmSettings;
  logo: LogoSource | null;
  language: AppLanguage;
  project: { number: string; name: string; city: string | null };
  lv: { number: string; title: string; submission_deadline: string | null };
  nodes: PdfNode[];
  withPrices: boolean;
}) {
  const l = pdfLabels(language);
  const children = childrenMap(nodes);
  const totals = groupTotals(nodes);
  const text = (t: I18nText) => pickText(t, language).value;
  const money = (value: number) => (withPrices ? formatAmount(value) : blank);
  const hasOptional = nodes.some((n) => n.is_optional && isPosition(n.kind));

  const total = totals.get("") ?? 0;
  const vat = roundTo5Rappen((total * firm.vat_rate) / 100);
  const title = `${l.lvNo} ${lv.number} · ${lv.title}`;

  const renderNode = (node: PdfNode, depth: number): React.ReactNode[] => {
    const long = text(node.long_text);
    if (node.kind === "group") {
      const items = (children.get(node.id) ?? []).flatMap((c) => renderNode(c, depth + 1));
      return [
        <View
          key={node.id}
          wrap={false}
          minPresenceAhead={40}
          style={{ marginTop: depth === 0 ? 12 : 8, paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: depth === 0 ? 1 : 0.5, borderBottomColor: depth === 0 ? colors.brand : colors.line }}
        >
          <View style={{ flexDirection: "row", ...styles.bold, fontSize: depth === 0 ? 11 : 10 }}>
            <Text style={{ width: col.pos }}>{node.number}</Text>
            <Text style={{ flex: 1 }}>{text(node.short_text)}</Text>
          </View>
          {long && <Text style={{ marginLeft: col.pos, marginTop: 2, fontSize: 9 }}>{long}</Text>}
        </View>,
        ...items,
        <View key={`${node.id}-total`} wrap={false} style={{ flexDirection: "row", paddingVertical: 3, paddingHorizontal: 4, ...styles.bold }}>
          <Text style={{ flex: 1, textAlign: "right" }}>
            {l.totalOf} {node.number} {text(node.short_text)}
          </Text>
          <Text style={{ width: col.amount, textAlign: "right" }}>{money(totals.get(node.id) ?? 0)}</Text>
        </View>,
      ];
    }

    if (node.kind === "text") {
      return [
        <View key={node.id} style={{ paddingVertical: 3, paddingHorizontal: 4, marginLeft: col.pos }}>
          {text(node.short_text) && <Text style={styles.bold}>{text(node.short_text)}</Text>}
          {long && <Text style={{ fontSize: 9 }}>{long}</Text>}
        </View>,
      ];
    }

    const unit = node.is_lump_sum ? l.lumpSum : (node.unit ?? "");
    const amount = positionTotal(node);
    return [
      <View
        key={node.id}
        wrap={false}
        style={{ flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: colors.line }}
      >
        <Text style={{ width: col.pos }}>
          {node.kind === "r_position" ? "R " : ""}
          {node.number}
        </Text>
        <View style={{ flex: 1, paddingRight: 6 }}>
          <Text style={styles.bold}>{text(node.short_text)}</Text>
          {long && <Text style={{ fontSize: 9, marginTop: 1 }}>{long}</Text>}
          {node.is_optional && <Text style={{ fontSize: 8, color: colors.muted, marginTop: 1 }}>{l.optional}</Text>}
        </View>
        <Text style={{ width: col.qty, textAlign: "right" }}>{node.quantity !== null ? formatQuantity(node.quantity) : ""}</Text>
        <Text style={{ width: col.unit, paddingLeft: 4 }}>{unit}</Text>
        <Text style={{ width: col.price, textAlign: "right" }}>
          {withPrices ? (node.unit_price !== null ? formatAmount(node.unit_price) : "") : blank}
        </Text>
        <Text style={{ width: col.amount, textAlign: "right" }}>
          {withPrices ? (node.is_optional ? `(${formatAmount(amount)})` : formatAmount(amount)) : blank}
        </Text>
      </View>,
    ];
  };

  const topGroups = (children.get("") ?? []).filter((n) => n.kind === "group");

  const summaryRow = (label: string, value: string, bold = false) => (
    <View style={{ flexDirection: "row", paddingVertical: 3, paddingHorizontal: 4, ...(bold ? styles.bold : {}) }}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Text style={{ width: 110, textAlign: "right" }}>{value}</Text>
    </View>
  );

  return (
    <Document title={title} author={firm.name}>
      <LetterPage firm={firm} logo={logo} pageLabel={l.page}>
        <AddressAndMeta
          recipient={withPrices ? [] : [`${l.bidder}:`, "", blank + blank, blank + blank, blank + blank]}
          meta={[
            [l.project, `${project.number} ${project.name}`],
            [l.lvNo, lv.number],
            [l.date, formatDate(new Date())],
            ...(lv.submission_deadline && !withPrices
              ? ([[l.submissionDeadline, formatDate(new Date(lv.submission_deadline))]] as [string, string][])
              : []),
          ]}
        />
        <Text style={styles.title}>
          {withPrices ? `${l.estimate} – ` : ""}
          {l.lv} {lv.number} · {lv.title}
        </Text>

        <View
          fixed
          style={{ flexDirection: "row", backgroundColor: colors.headerFill, paddingVertical: 5, paddingHorizontal: 4, ...styles.bold }}
        >
          <Text style={{ width: col.pos }}>{l.pos}</Text>
          <Text style={{ flex: 1 }}>{l.description}</Text>
          <Text style={{ width: col.qty, textAlign: "right" }}>{l.quantity}</Text>
          <Text style={{ width: col.unit, paddingLeft: 4 }}>{l.unit}</Text>
          <Text style={{ width: col.price, textAlign: "right" }}>{l.unitPrice}</Text>
          <Text style={{ width: col.amount, textAlign: "right" }}>{l.amount}</Text>
        </View>

        {(children.get("") ?? []).flatMap((n) => renderNode(n, 0))}

        {/* Zusammenstellung */}
        <View wrap={false} style={{ marginTop: 20 }}>
          <Text style={{ ...styles.bold, fontSize: 11, marginBottom: 6 }}>{l.summary}</Text>
          {topGroups.map((g) => (
            <View key={g.id} style={{ flexDirection: "row", paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: colors.line }}>
              <Text style={{ width: col.pos }}>{g.number}</Text>
              <Text style={{ flex: 1 }}>{text(g.short_text)}</Text>
              <Text style={{ width: 110, textAlign: "right" }}>{money(totals.get(g.id) ?? 0)}</Text>
            </View>
          ))}
          <View style={{ marginTop: 6 }}>
            {summaryRow(l.totalExclVat, withPrices ? formatAmount(total) : blank, true)}
            {!withPrices && (
              <>
                {summaryRow(`${l.discount} ....... %`, blank)}
                {summaryRow(`${l.skonto} ....... %`, blank)}
                {summaryRow(l.net, blank, true)}
              </>
            )}
            {summaryRow(`${l.vat} ${formatQuantity(firm.vat_rate)}%`, withPrices ? formatAmount(vat) : blank)}
          </View>
          <View
            style={{
              flexDirection: "row",
              marginTop: 6,
              paddingVertical: 6,
              paddingHorizontal: 4,
              backgroundColor: colors.brand,
              color: colors.brandText,
              ...styles.bold,
              fontSize: 11,
            }}
          >
            <Text style={{ flex: 1 }}>{l.totalInclVat}</Text>
            <Text style={{ width: 130, textAlign: "right" }}>{withPrices ? formatChf(round2(total + vat)) : `CHF ${blank}`}</Text>
          </View>
          {hasOptional && <Text style={{ marginTop: 6, fontSize: 8.5, color: colors.muted }}>{l.optionalNote}</Text>}
        </View>

        {!withPrices && (
          <View wrap={false} style={{ marginTop: 36, flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ width: "45%", borderTopWidth: 0.5, borderTopColor: colors.text, paddingTop: 4 }}>
              <Text>{l.placeDate}</Text>
            </View>
            <View style={{ width: "45%", borderTopWidth: 0.5, borderTopColor: colors.text, paddingTop: 4 }}>
              <Text>{l.signature}</Text>
            </View>
          </View>
        )}
      </LetterPage>
    </Document>
  );
}
