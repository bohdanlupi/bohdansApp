import { Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { FirmSettings } from "@/lib/supabase/types";

// Visual language of the Offerte templates in vorlagen/: Arial (→ Helvetica),
// grey footer text, light grey table header, dark blue total bar.
export const colors = {
  text: "#272727",
  muted: "#7f7f7f",
  line: "#bfbfbf",
  headerFill: "#f2f2f2",
  brand: "#1f497d",
  brandText: "#ffffff",
};

export const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: colors.text,
    paddingTop: 100,
    paddingBottom: 80,
    paddingHorizontal: 50,
  },
  header: { position: "absolute", top: 32, right: 50 },
  logo: { width: 120, height: 47 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 50,
    right: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8.5,
    color: colors.muted,
  },
  footerRight: { textAlign: "right" },
  pageNumber: {
    position: "absolute",
    bottom: 28,
    left: 50,
    right: 50,
    textAlign: "center",
    fontSize: 8.5,
    color: colors.muted,
  },
  bold: { fontFamily: "Helvetica-Bold" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 24, marginBottom: 14 },
});

export type LogoSource = { data: Buffer; format: "png" | "jpg" };

/** Fixed header (logo) and footer (address, contact, page numbers) on every page. */
export function LetterPage({
  firm,
  logo,
  pageLabel,
  children,
}: {
  firm: FirmSettings;
  logo: LogoSource | null;
  /** e.g. (p, n) => `Seite ${p} von ${n}` */
  pageLabel: (page: number, total: number) => string;
  children: React.ReactNode;
}) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header} fixed>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
        {logo && <Image src={logo} style={styles.logo} />}
      </View>

      {/* No lineHeight on Page or wrappers: it makes react-pdf drop `render` texts
          (page numbers) and is inherited with wrong spacing. */}
      {children}

      <View style={styles.footer} fixed>
        <View>
          <Text>{firm.name}</Text>
          <Text>{firm.street}</Text>
          <Text>{[firm.zip, firm.city].filter(Boolean).join(" ")}</Text>
        </View>
        <View style={styles.footerRight}>
          {firm.phone && <Text>Tel.: {firm.phone}</Text>}
          {firm.email && <Text>{firm.email}</Text>}
          {firm.website && <Text>{firm.website}</Text>}
        </View>
      </View>
      {/* Must be its own absolutely positioned Text: a `render` Text inside the
          bottom-anchored footer View makes react-pdf drop the whole footer. */}
      <Text
        style={styles.pageNumber}
        fixed
        render={({ pageNumber, totalPages }) => pageLabel(pageNumber, totalPages)}
      />
    </Page>
  );
}

/** Recipient on the left, document details (label/value rows) on the right. */
export function AddressAndMeta({
  recipient,
  meta,
}: {
  recipient: string[];
  meta: [label: string, value: string][];
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <View style={{ width: "50%" }}>
        {recipient.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </View>
      <View style={{ width: "46%" }}>
        {meta.map(([label, value]) => (
          <View key={label} style={{ flexDirection: "row" }}>
            <Text style={{ width: 90 }}>{label}</Text>
            <Text style={{ flex: 1 }}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
