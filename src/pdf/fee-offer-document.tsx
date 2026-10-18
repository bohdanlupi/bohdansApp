import { Document, Text, View } from "@react-pdf/renderer";

import { activeTrades, type FeeTotals, rateOf } from "@/lib/fees/calc";
import type { FeeOfferData } from "@/lib/fees/offer-schema";
import { phaseLabel, tradeNames } from "@/lib/fees/options";
import { feeServices, type ServiceState, serviceState } from "@/lib/fees/services";
import { type FeePhase, feePhases, type FeeTrade } from "@/lib/fees/sia108";
import type { AppLanguage, FirmSettings } from "@/lib/supabase/types";

import { feeOfferTexts } from "./fee-offer-texts";
import { formatAmount, formatDate, formatQuantity } from "./format";
import { pdfLabels } from "./labels";
import { AddressAndMeta, colors, LetterPage, type LogoSource, styles } from "./letterhead";

export type FeeOfferPdf = {
  number: string;
  title: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  language: AppLanguage;
  offerDate: string;
  validUntil: string | null;
  data: FeeOfferData;
  totals: FeeTotals;
};

type Recipient = { name: string; street: string | null; zip: string | null; city: string | null } | null;
type Person = { salutation: string | null; first_name: string | null; last_name: string } | null;

const TRADE_COL = 78;
const TOTAL_COL = 82;

const fmtNum = (value: number, decimals: number) =>
  new Intl.NumberFormat("de-CH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);

/** Trade name inside a sentence: lower case in French and Italian. */
const tradeInText = (trade: FeeTrade, language: AppLanguage) => (language === "de" ? tradeNames[trade][language] : tradeNames[trade][language].toLowerCase());

/** Service lines of a phase with the given state, with "(nur …)" when not all trades of the phase have it. */
function serviceLines(data: FeeOfferData, phase: FeePhase, state: ServiceState, language: AppLanguage, only: (t: string) => string) {
  const trades = activeTrades(data).filter((t) => data.trades[t].phases[phase].on);
  const suffix = (matching: FeeTrade[]) => (matching.length < trades.length ? ` ${only(matching.map((t) => tradeInText(t, language)).join(", "))}` : "");
  const builtIn = feeServices
    .filter((s) => s.phase === phase)
    .flatMap((s) => {
      const matching = trades.filter((t) => serviceState(s, t, data.trades[t].services) === state);
      return matching.length ? [`${s.text[language]}${suffix(matching)}`] : [];
    });
  const custom = data.customServices
    .filter((c) => c.phase === phase && c.text.trim())
    .flatMap((c) => {
      const matching = trades.filter((t) => (c.states[t] ?? "no") === state);
      return matching.length ? [`${c.text.trim()}${suffix(matching)}`] : [];
    });
  return [...builtIn, ...custom];
}

function Heading({ n, children }: { n: number; children: string }) {
  return (
    <Text style={{ ...styles.bold, fontSize: 11, marginTop: 14, marginBottom: 5 }} minPresenceAhead={40}>
      {n}. {children}
    </Text>
  );
}

function Bullets({ lines }: { lines: string[] }) {
  return (
    <View>
      {lines.map((line, i) => (
        <View key={i} style={{ flexDirection: "row", marginBottom: 2 }} wrap={false}>
          <Text style={{ width: 10 }}>–</Text>
          <Text style={{ flex: 1 }}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

const textLines = (value: string) => value.split("\n").map((l) => l.trim()).filter(Boolean);

/** Honorarofferte: cover letter with the fee table and the Anhang (basis, fee calculation, services, conditions). */
export function FeeOfferDocument({
  firm,
  logo,
  offer,
  recipient,
  contact,
  vatRate,
}: {
  firm: FirmSettings;
  logo: LogoSource | null;
  offer: FeeOfferPdf;
  recipient: Recipient;
  contact: Person;
  vatRate: number;
}) {
  const { language, data, totals } = offer;
  const l = pdfLabels(language);
  const tx = feeOfferTexts(language);
  const trades = totals.trades;
  const multi = trades.length > 1;
  const title = contact?.salutation === "mr" ? tx.mr : contact?.salutation === "ms" ? tx.ms : null;
  const address = [
    recipient?.name,
    contact ? [title, contact.first_name, contact.last_name].filter(Boolean).join(" ") : null,
    recipient?.street,
    [recipient?.zip, recipient?.city].filter(Boolean).join(" "),
  ].filter((line): line is string => Boolean(line));
  const projectLine = [offer.title, [offer.zip, offer.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const validUntil = offer.validUntil ? formatDate(new Date(offer.validUntil)) : null;
  const pct = (value: number) => formatQuantity(value);

  const row = (label: string, value: number, opts: { bold?: boolean; negative?: boolean } = {}) => (
    <View style={{ flexDirection: "row", paddingVertical: 2, paddingHorizontal: 4, ...(opts.bold ? styles.bold : {}) }}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Text style={{ width: TOTAL_COL, textAlign: "right" }}>
        {opts.negative ? "−" : ""}
        {formatAmount(value)}
      </Text>
    </View>
  );

  const phasesInOffer = feePhases.filter((p) => trades.some((t) => data.trades[t.trade].phases[p].on));
  const sia = data.method === "sia";
  const h = rateOf(data, data.siaRateId);
  const paramRows: [string, (t: (typeof trades)[number]) => string][] = [
    [tx.params.b, (t) => formatAmount(data.trades[t.trade].cost ?? 0)],
    [tx.params.bp, (t) => (t.bp ? formatAmount(t.bp) : "–")],
    [tx.params.p, (t) => (t.p !== null ? fmtNum(t.p, 4) : "–")],
    [tx.params.n, (t) => fmtNum(data.trades[t.trade].n, 2)],
    [tx.params.q, (t) => `${fmtNum(t.q, 1)} %`],
    [tx.params.r, (t) => fmtNum(data.trades[t.trade].r, 2)],
    [tx.params.u, (t) => fmtNum(data.trades[t.trade].u, 2)],
    [tx.params.i, (t) => fmtNum(data.trades[t.trade].i, 2)],
    [tx.params.s, (t) => fmtNum(data.trades[t.trade].s, 2)],
    [tx.params.h, () => (h !== null ? `${formatAmount(h)} ${tx.perHour}` : "–")],
    [tx.params.hours, (t) => `${fmtNum(t.hours, 0)} ${tx.hoursUnit}`],
    [tx.params.fee, (t) => formatAmount(t.amount)],
  ];
  const hoursOf = (trade: FeeTrade, rateId: string) => feePhases.reduce((sum, p) => sum + (data.trades[trade].phases[p].on ? (data.trades[trade].phases[p].hours[rateId] ?? 0) : 0), 0);

  const tableHeader = (first: string) => (
    <View style={{ flexDirection: "row", backgroundColor: colors.headerFill, paddingVertical: 5, paddingHorizontal: 4, ...styles.bold }}>
      <Text style={{ flex: 1 }}>{first}</Text>
      {trades.map((t) => (
        <Text key={t.trade} style={{ width: TRADE_COL, paddingLeft: 6, textAlign: "right" }}>
          {tradeNames[t.trade][language]}
        </Text>
      ))}
      {multi && <Text style={{ width: TOTAL_COL, textAlign: "right" }}>{tx.total}</Text>}
    </View>
  );
  const cellStyle = { flexDirection: "row" as const, paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: colors.line };

  return (
    <Document title={`${tx.offerNo} ${offer.number} – ${offer.title}`} author={firm.name}>
      <LetterPage firm={firm} logo={logo} pageLabel={l.page}>
        <AddressAndMeta
          recipient={address}
          meta={[
            [tx.offerNo, offer.number],
            [l.date, formatDate(new Date(offer.offerDate))],
            ...(validUntil ? ([[tx.validUntil, validUntil]] as [string, string][]) : []),
          ]}
        />
        <Text style={{ ...styles.title, marginTop: 36 }}>{tx.subject(projectLine)}</Text>
        <Text style={{ marginBottom: 10 }}>{tx.salutation(contact)}</Text>
        <Text style={{ marginBottom: 12 }}>{tx.intro}</Text>

        {tableHeader(tx.phase)}
        {totals.phases.map((ph) => (
          <View key={ph.phase} style={cellStyle} wrap={false}>
            <Text style={{ flex: 1, paddingRight: 4 }}>{phaseLabel(ph.phase, language)}</Text>
            {trades.map((t) => {
              const p = t.phases.find((x) => x.phase === ph.phase);
              return (
                <Text key={t.trade} style={{ width: TRADE_COL, textAlign: "right" }}>
                  {p?.amount != null ? formatAmount(p.amount) : ""}
                </Text>
              );
            })}
            {multi && <Text style={{ width: TOTAL_COL, textAlign: "right" }}>{formatAmount(ph.amount)}</Text>}
          </View>
        ))}
        <View style={{ ...cellStyle, ...styles.bold }} wrap={false}>
          <Text style={{ flex: 1 }}>{tx.fees}</Text>
          {trades.map((t) => (
            <Text key={t.trade} style={{ width: TRADE_COL, textAlign: "right" }}>
              {formatAmount(t.amount)}
            </Text>
          ))}
          {multi && <Text style={{ width: TOTAL_COL, textAlign: "right" }}>{formatAmount(totals.fees)}</Text>}
        </View>

        <View wrap={false} style={{ marginTop: 8, marginLeft: "40%" }}>
          {data.extras
            .filter((e) => e.amount)
            .map((e) => (
              <View key={e.id}>{row(e.text || "–", e.amount ?? 0)}</View>
            ))}
          {(totals.extras > 0 || totals.discount > 0) && row(tx.subtotal, totals.subtotal)}
          {totals.discount > 0 && row(tx.discount(pct(data.discountPct)), totals.discount, { negative: true })}
          {totals.expenses > 0 && row(tx.expenses(pct(data.expensesPct)), totals.expenses)}
          {row(tx.net, totals.net, { bold: true })}
          {row(tx.vat(pct(vatRate)), totals.vat)}
          <View style={{ flexDirection: "row", marginTop: 4, paddingVertical: 6, paddingHorizontal: 4, backgroundColor: colors.brand, color: colors.brandText, ...styles.bold }}>
            <Text style={{ flex: 1 }}>{tx.gross}</Text>
            <Text style={{ width: TOTAL_COL, textAlign: "right" }}>{formatAmount(totals.total)}</Text>
          </View>
        </View>

        <View wrap={false} style={{ marginTop: 18 }}>
          {tx.outro.map((p, i) => (
            <Text key={i} style={{ marginBottom: 6 }}>
              {p}
            </Text>
          ))}
          <Text style={{ marginTop: 10 }}>{tx.closing}</Text>
          <Text style={{ marginTop: 6 }}>{firm.name}</Text>
          <Text style={{ marginTop: 30 }}>{firm.managing_director}</Text>
          <Text>{l.managingDirector}</Text>
        </View>
      </LetterPage>

      <LetterPage firm={firm} logo={logo} pageLabel={l.page}>
        <Text style={{ ...styles.bold, fontSize: 13 }}>{tx.annexTitle}</Text>
        <Text style={{ color: colors.muted, marginBottom: 6 }}>{tx.annexSubtitle}</Text>
        <AddressAndMeta
          recipient={[]}
          meta={[
            [tx.offerNo, offer.number],
            [l.date, formatDate(new Date(offer.offerDate))],
          ]}
        />

        <Heading n={1}>{tx.sections.basis}</Heading>
        <Text style={{ marginBottom: 3 }}>{tx.basisIntro}</Text>
        <Bullets lines={[...tx.basisLines, ...textLines(data.basis)]} />

        <Heading n={2}>{tx.sections.project}</Heading>
        <Text>
          {offer.title}
          {[offer.street, [offer.zip, offer.city].filter(Boolean).join(" ")].filter(Boolean).length
            ? ` – ${tx.projectAddress}: ${[offer.street, [offer.zip, offer.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}`
            : ""}
        </Text>
        {textLines(data.description).map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}

        <Heading n={3}>{tx.sections.fee}</Heading>
        <Text style={{ marginBottom: 6 }}>{sia ? tx.feeSia : tx.feeHours}</Text>
        <View wrap={false}>
          {tableHeader("")}
          {sia
            ? paramRows.map(([label, value]) => (
                <View key={label} style={cellStyle}>
                  <Text style={{ flex: 1 }}>{label}</Text>
                  {trades.map((t) => (
                    <Text key={t.trade} style={{ width: TRADE_COL, textAlign: "right" }}>
                      {value(t)}
                    </Text>
                  ))}
                  {multi && <Text style={{ width: TOTAL_COL, textAlign: "right" }}>{label === tx.params.fee ? formatAmount(totals.fees) : label === tx.params.hours ? `${fmtNum(trades.reduce((s, t) => s + t.hours, 0), 0)} ${tx.hoursUnit}` : ""}</Text>}
                </View>
              ))
            : [
                ...data.rates
                  .filter((r) => trades.some((t) => hoursOf(t.trade, r.id) > 0))
                  .map((r) => (
                    <View key={r.id} style={cellStyle}>
                      <Text style={{ flex: 1 }}>
                        {r.label} ({formatAmount(r.rate)} {tx.perHour})
                      </Text>
                      {trades.map((t) => (
                        <Text key={t.trade} style={{ width: TRADE_COL, textAlign: "right" }}>
                          {hoursOf(t.trade, r.id) ? `${fmtNum(hoursOf(t.trade, r.id), 1)} ${tx.hoursUnit}` : ""}
                        </Text>
                      ))}
                      {multi && (
                        <Text style={{ width: TOTAL_COL, textAlign: "right" }}>
                          {fmtNum(trades.reduce((s, t) => s + hoursOf(t.trade, r.id), 0), 1)} {tx.hoursUnit}
                        </Text>
                      )}
                    </View>
                  )),
                <View key="fee" style={{ ...cellStyle, ...styles.bold }}>
                  <Text style={{ flex: 1 }}>{tx.params.fee}</Text>
                  {trades.map((t) => (
                    <Text key={t.trade} style={{ width: TRADE_COL, textAlign: "right" }}>
                      {formatAmount(t.amount)}
                    </Text>
                  ))}
                  {multi && <Text style={{ width: TOTAL_COL, textAlign: "right" }}>{formatAmount(totals.fees)}</Text>}
                </View>,
              ]}
        </View>

        <Heading n={4}>{tx.sections.scope}</Heading>
        <Text style={{ marginBottom: 4 }}>{tx.scopeIntro}</Text>
        {phasesInOffer.map((phase) => {
          const lines = serviceLines(data, phase, "in", language, tx.only);
          const phaseTrades = trades.filter((t) => data.trades[t.trade].phases[phase].on).map((t) => t.trade);
          return (
            <View key={phase} style={{ marginBottom: 6 }}>
              <Text style={{ ...styles.bold, marginTop: 4, marginBottom: 2 }} minPresenceAhead={30}>
                {phaseLabel(phase, language)}
                {phaseTrades.length < trades.length ? ` ${tx.only(phaseTrades.map((t) => tradeInText(t, language)).join(", "))}` : ""}
              </Text>
              <Bullets lines={lines} />
            </View>
          );
        })}

        <Heading n={5}>{tx.sections.expenses}</Heading>
        {data.expensesPct > 0 && <Text style={{ marginBottom: 3 }}>{tx.expensesIncluded(pct(data.expensesPct))}</Text>}
        {textLines(data.expensesText).length > 0 && (
          <>
            <Text style={{ marginBottom: 3 }}>{tx.expensesEffort}</Text>
            <Bullets lines={textLines(data.expensesText)} />
          </>
        )}

        <Heading n={6}>{tx.sections.excluded}</Heading>
        <Text style={{ marginBottom: 4 }}>{tx.excludedIntro}</Text>
        {phasesInOffer.map((phase) => {
          const lines = serviceLines(data, phase, "out", language, tx.only);
          if (!lines.length) return null;
          return (
            <View key={phase} style={{ marginBottom: 6 }}>
              <Text style={{ ...styles.bold, marginTop: 4, marginBottom: 2 }} minPresenceAhead={30}>
                {phaseLabel(phase, language)}
              </Text>
              <Bullets lines={lines} />
            </View>
          );
        })}
        <Text style={{ marginTop: 2 }}>{tx.excludedOutro}</Text>

        <Heading n={7}>{tx.sections.extra}</Heading>
        <Text style={{ marginBottom: 3 }}>{tx.extraIntro}</Text>
        {data.rates.map((r) => (
          <View key={r.id} style={{ flexDirection: "row" }}>
            <Text style={{ width: 200 }}>{r.label}</Text>
            <Text>
              {formatAmount(r.rate)} {tx.perHour}
            </Text>
          </View>
        ))}

        <Heading n={8}>{tx.sections.payment}</Heading>
        <Bullets lines={tx.payment(firm.payment_terms_days)} />

        {validUntil && (
          <>
            <Heading n={9}>{tx.sections.validity}</Heading>
            <Text>{tx.validity(validUntil)}</Text>
          </>
        )}

        <View wrap={false}>
          <Heading n={validUntil ? 10 : 9}>{tx.sections.acceptance}</Heading>
          <View style={{ flexDirection: "row", gap: 30, marginTop: 24 }}>
            {[tx.client, tx.contractor].map((who) => (
              <View key={who} style={{ flex: 1 }}>
                <Text style={{ borderTopWidth: 0.5, borderTopColor: colors.text, paddingTop: 3 }}>{tx.placeDate}</Text>
                <Text style={{ marginTop: 30, borderTopWidth: 0.5, borderTopColor: colors.text, paddingTop: 3 }}>
                  {who}: {who === tx.client ? (recipient?.name ?? "") : firm.name}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </LetterPage>
    </Document>
  );
}
