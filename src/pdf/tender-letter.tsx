import { Document, Text, View } from "@react-pdf/renderer";

import type { AppLanguage, FirmSettings } from "@/lib/supabase/types";

import { formatDate } from "./format";
import { pdfLabels } from "./labels";
import { AddressAndMeta, LetterPage, styles, type LogoSource } from "./letterhead";
import { offerTexts, type LetterContext, type LetterType } from "./offer-texts";

/** Invitation to tender, award letter or rejection letter to one bidder. */
export function TenderLetter({
  firm,
  logo,
  language,
  type,
  recipient,
  contact,
  context,
}: {
  firm: FirmSettings;
  logo: LogoSource | null;
  language: AppLanguage;
  type: LetterType;
  recipient: { name: string; street: string | null; zip: string | null; city: string | null };
  contact: { salutation: string | null; first_name: string | null; last_name: string } | null;
  context: LetterContext;
}) {
  const l = pdfLabels(language);
  const tx = offerTexts(language);
  const letter = tx[type];
  const title = contact?.salutation === "mr" ? tx.mr : contact?.salutation === "ms" ? tx.ms : null;

  const address = [
    recipient.name,
    contact ? [title, contact.first_name, contact.last_name].filter(Boolean).join(" ") : null,
    recipient.street,
    [recipient.zip, recipient.city].filter(Boolean).join(" "),
  ].filter((line): line is string => Boolean(line));

  return (
    <Document title={letter.subject(context)} author={firm.name}>
      <LetterPage firm={firm} logo={logo} pageLabel={l.page}>
        <AddressAndMeta
          recipient={address}
          meta={[
            [l.date, formatDate(new Date())],
            [l.project, context.project],
          ]}
        />
        <Text style={{ ...styles.title, marginTop: 36 }}>{letter.subject(context)}</Text>
        <Text style={{ marginBottom: 10 }}>{tx.salutation(contact)}</Text>
        {letter.body(context).map((paragraph, i) => (
          <Text key={i} style={{ marginBottom: 8 }}>
            {paragraph}
          </Text>
        ))}
        <View style={{ marginTop: 18 }}>
          <Text>{tx.closing}</Text>
          <Text style={{ marginTop: 6 }}>{firm.name}</Text>
          <Text style={{ marginTop: 36 }}>{firm.managing_director}</Text>
          <Text>{l.managingDirector}</Text>
        </View>
      </LetterPage>
    </Document>
  );
}
