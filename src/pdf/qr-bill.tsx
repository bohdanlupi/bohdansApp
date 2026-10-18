import { Path, Rect, Svg, Text, View } from "@react-pdf/renderer";
import QRCode from "qrcode";

import { formatIban, formatSlipAmount, type QrAddress, type QrBill, qrPayload } from "@/lib/qr-bill";

import type { QrTexts } from "./fee-invoice-texts";

// Payment part of the Swiss QR-Rechnung (A6 landscape, 210 × 105 mm at the bottom of an A4 page): receipt 62 mm,
// payment part 148 mm with the Swiss QR Code (46 mm, error correction M, Swiss cross 7 mm) – layout after the
// Style Guide QR-bill (fonts 6/8 pt in the receipt, 8/10 pt in the payment part).

const mm = (value: number) => value * 2.8346;
const HEIGHT = mm(105);
const font = "Helvetica";
const bold = "Helvetica-Bold";

/** Dark modules of the QR code as one path (1 unit = 1 module). */
function qrPath(payload: string) {
  const { modules } = QRCode.create(payload, { errorCorrectionLevel: "M" });
  let d = "";
  for (let y = 0; y < modules.size; y++) {
    for (let x = 0; x < modules.size; x++) if (modules.data[y * modules.size + x]) d += `M${x} ${y}h1v1h-1z`;
  }
  return { size: modules.size, d };
}

/** Swiss QR Code with the Swiss cross in the middle. */
function SwissQrCode({ payload }: { payload: string }) {
  const { size, d } = qrPath(payload);
  const side = mm(46);
  const cross = 7 / 46; // cross square relative to the code
  const c = size / 2;
  const s = size * cross; // white frame incl.
  const b = s * (6 / 7); // black square
  const arm = b * 0.17;
  const len = b * 0.58;
  return (
    <Svg width={side} height={side} viewBox={`0 0 ${size} ${size}`}>
      <Path d={d} fill="black" />
      <Rect x={c - s / 2} y={c - s / 2} width={s} height={s} fill="white" />
      <Rect x={c - b / 2} y={c - b / 2} width={b} height={b} fill="black" />
      <Rect x={c - arm / 2} y={c - len / 2} width={arm} height={len} fill="white" />
      <Rect x={c - len / 2} y={c - arm / 2} width={len} height={arm} fill="white" />
    </Svg>
  );
}

const addressLines = (a: QrAddress) => [a.name, a.street, [a.zip, a.city].filter(Boolean).join(" ")].filter((l): l is string => Boolean(l));

function Block({ heading, lines, size }: { heading: string; lines: string[]; size: "receipt" | "payment" }) {
  const receipt = size === "receipt";
  return (
    <View style={{ marginBottom: receipt ? 9 : 11 }}>
      <Text style={{ fontFamily: bold, fontSize: receipt ? 6 : 8, marginBottom: 1 }}>{heading}</Text>
      {lines.map((line, i) => (
        <Text key={i} style={{ fontFamily: font, fontSize: receipt ? 8 : 10, lineHeight: 1.15 }}>
          {line}
        </Text>
      ))}
    </View>
  );
}

/** Corner marks of an empty field (debtor / amount to be filled in by hand). */
function BlankField({ width, height }: { width: number; height: number }) {
  const l = mm(3);
  const w = 0.75;
  return (
    <Svg width={width} height={height}>
      <Path d={`M0 ${l}V0H${l} M${width - l} 0H${width}V${l} M${width} ${height - l}V${height}H${width - l} M${l} ${height}H0V${height - l}`} stroke="black" strokeWidth={w} fill="none" />
    </Svg>
  );
}

export function QrPaymentPart({ bill, tx }: { bill: QrBill; tx: QrTexts }) {
  const account = [formatIban(bill.iban), ...addressLines(bill.creditor)];
  const amount = bill.amount !== null ? formatSlipAmount(bill.amount) : null;

  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: HEIGHT, flexDirection: "row", color: "black" }}>
      {/* Separation lines (dashed, for printing on plain paper) */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, borderTopWidth: 0.5, borderTopColor: "black", borderStyle: "dashed" }} />
      <Text style={{ position: "absolute", top: -mm(3.5), left: 0, right: 0, textAlign: "center", fontFamily: font, fontSize: 7 }}>{tx.separate}</Text>
      <View style={{ position: "absolute", top: 0, bottom: 0, left: mm(62), borderLeftWidth: 0.5, borderLeftColor: "black", borderStyle: "dashed" }} />

      {/* Receipt */}
      <View style={{ width: mm(62), padding: mm(5) }}>
        <Text style={{ fontFamily: bold, fontSize: 11, marginBottom: mm(3) }}>{tx.receipt}</Text>
        <Block heading={tx.account} lines={account} size="receipt" />
        {bill.debtor ? (
          <Block heading={tx.payableBy} lines={addressLines(bill.debtor)} size="receipt" />
        ) : (
          <View>
            <Text style={{ fontFamily: bold, fontSize: 6, marginBottom: 2 }}>{tx.payableByBlank}</Text>
            <BlankField width={mm(52)} height={mm(20)} />
          </View>
        )}
        <View style={{ position: "absolute", top: mm(68), left: mm(5), flexDirection: "row" }}>
          <View style={{ width: mm(13) }}>
            <Text style={{ fontFamily: bold, fontSize: 6, marginBottom: 1 }}>{tx.currency}</Text>
            <Text style={{ fontFamily: font, fontSize: 8 }}>CHF</Text>
          </View>
          <View>
            <Text style={{ fontFamily: bold, fontSize: 6, marginBottom: 1 }}>{tx.amount}</Text>
            {amount ? <Text style={{ fontFamily: font, fontSize: 8 }}>{amount}</Text> : <BlankField width={mm(30)} height={mm(10)} />}
          </View>
        </View>
        <Text style={{ position: "absolute", top: mm(82), left: mm(5), width: mm(52), textAlign: "right", fontFamily: bold, fontSize: 6 }}>{tx.acceptance}</Text>
      </View>

      {/* Payment part */}
      <View style={{ width: mm(148), flexDirection: "row", padding: mm(5) }}>
        <View style={{ width: mm(51) }}>
          <Text style={{ fontFamily: bold, fontSize: 11, marginBottom: mm(5) }}>{tx.paymentPart}</Text>
          <SwissQrCode payload={qrPayload(bill)} />
          <View style={{ position: "absolute", top: mm(68) - mm(5), left: 0, flexDirection: "row" }}>
            <View style={{ width: mm(14) }}>
              <Text style={{ fontFamily: bold, fontSize: 8, marginBottom: 1 }}>{tx.currency}</Text>
              <Text style={{ fontFamily: font, fontSize: 10 }}>CHF</Text>
            </View>
            <View>
              <Text style={{ fontFamily: bold, fontSize: 8, marginBottom: 1 }}>{tx.amount}</Text>
              {amount ? <Text style={{ fontFamily: font, fontSize: 10 }}>{amount}</Text> : <BlankField width={mm(40)} height={mm(15)} />}
            </View>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Block heading={tx.account} lines={account} size="payment" />
          {bill.message && <Block heading={tx.info} lines={[bill.message]} size="payment" />}
          {bill.debtor ? (
            <Block heading={tx.payableBy} lines={addressLines(bill.debtor)} size="payment" />
          ) : (
            <View>
              <Text style={{ fontFamily: bold, fontSize: 8, marginBottom: 2 }}>{tx.payableByBlank}</Text>
              <BlankField width={mm(65)} height={mm(25)} />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
