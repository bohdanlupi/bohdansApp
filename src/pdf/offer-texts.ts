import type { AppLanguage } from "@/lib/supabase/types";

// Texts of the tender letters, the award proposal and the offer comparison, per document language.

type Person = { salutation: string | null; last_name: string } | null;
type LetterContext = {
  project: string;
  lv: string;
  deadline: string | null;
  offerDate: string | null;
  offerReference: string | null;
  total: string;
};

const texts = {
  de: {
    salutation: (p: Person) =>
      p?.salutation === "mr" ? `Sehr geehrter Herr ${p.last_name}` : p?.salutation === "ms" ? `Sehr geehrte Frau ${p.last_name}` : "Sehr geehrte Damen und Herren",
    mr: "Herr",
    ms: "Frau",
    closing: "Freundliche Grüsse",
    invitation: {
      subject: (c: LetterContext) => `Einladung zur Offertstellung – ${c.lv}`,
      body: (c: LetterContext) => [
        `Im Auftrag der Bauherrschaft laden wir Sie ein, für das Projekt «${c.project}» eine Offerte für die Arbeiten gemäss beiliegendem Leistungsverzeichnis «${c.lv}» einzureichen.`,
        c.deadline
          ? `Bitte senden Sie uns Ihr vollständig ausgefülltes und unterzeichnetes Angebot bis spätestens ${c.deadline}.`
          : "Bitte senden Sie uns Ihr vollständig ausgefülltes und unterzeichnetes Angebot.",
        "Für Fragen stehen wir Ihnen gerne zur Verfügung. Wir danken Ihnen für Ihre Bemühungen.",
      ],
    },
    award: {
      subject: (c: LetterContext) => `Vergabe – ${c.lv}`,
      body: (c: LetterContext) => [
        `Wir freuen uns, Ihnen mitzuteilen, dass die Bauherrschaft beschlossen hat, Ihnen die Arbeiten «${c.lv}» für das Projekt «${c.project}» zu vergeben.`,
        `Grundlage bildet Ihr Angebot${c.offerReference ? ` ${c.offerReference}` : ""}${c.offerDate ? ` vom ${c.offerDate}` : ""} über CHF ${c.total} inkl. MwSt. Der Werkvertrag wird Ihnen separat zugestellt.`,
        "Wir danken Ihnen für Ihr Angebot und freuen uns auf die Zusammenarbeit.",
      ],
    },
    rejection: {
      subject: (c: LetterContext) => `Absage – ${c.lv}`,
      body: (c: LetterContext) => [
        `Wir danken Ihnen für Ihr Angebot${c.offerDate ? ` vom ${c.offerDate}` : ""} für die Arbeiten «${c.lv}» im Projekt «${c.project}».`,
        "Leider müssen wir Ihnen mitteilen, dass die Bauherrschaft die Arbeiten einem anderen Anbieter vergeben hat.",
        "Wir danken Ihnen für Ihre Bemühungen und würden uns freuen, Sie bei einer nächsten Gelegenheit wieder zur Offertstellung einladen zu dürfen.",
      ],
    },
    proposal: {
      title: "Vergabeantrag",
      offers: "Eingegangene Angebote",
      rank: "Rang",
      bidder: "Unternehmer",
      offerDate: "Angebot vom",
      net: "Netto exkl. MwSt.",
      total: "Total inkl. MwSt.",
      vsCheapest: "Diff. zum günstigsten",
      estimate: "Kostenschätzung",
      recommendation: "Antrag",
      recommend: (company: string, total: string) =>
        `Wir beantragen, die Arbeiten an ${company} zum Betrag von CHF ${total} inkl. MwSt. zu vergeben.`,
      noRecommendation: "Es wurde noch kein Unternehmer für die Vergabe bestimmt.",
      justification: "Begründung",
      proposedBy: "Antragsteller",
      approvedBy: "Genehmigung Bauherrschaft",
    },
    comparison: {
      title: "Angebotsvergleich",
      estimate: "Schätzung",
      unitPrice: "EP",
      amount: "Betrag",
      gross: "Brutto",
      discount: "Rabatt",
      deductions: "Abzüge",
      net: "Netto",
      skonto: "Skonto",
      vat: "MwSt.",
      total: "Total inkl. MwSt.",
      rank: "Rang",
    },
  },
  fr: {
    salutation: (p: Person) => (p?.salutation === "mr" ? "Monsieur," : p?.salutation === "ms" ? "Madame," : "Madame, Monsieur,"),
    mr: "Monsieur",
    ms: "Madame",
    closing: "Nous vous prions d'agréer nos salutations distinguées.",
    invitation: {
      subject: (c: LetterContext) => `Invitation à soumissionner – ${c.lv}`,
      body: (c: LetterContext) => [
        `Sur mandat du maître d'ouvrage, nous vous invitons à nous remettre une offre pour le projet « ${c.project} » concernant les travaux selon le descriptif ci-joint « ${c.lv} ».`,
        c.deadline
          ? `Nous vous prions de nous faire parvenir votre offre dûment complétée et signée au plus tard le ${c.deadline}.`
          : "Nous vous prions de nous faire parvenir votre offre dûment complétée et signée.",
        "Nous restons à votre disposition pour tout renseignement et vous remercions de votre collaboration.",
      ],
    },
    award: {
      subject: (c: LetterContext) => `Adjudication – ${c.lv}`,
      body: (c: LetterContext) => [
        `Nous avons le plaisir de vous informer que le maître d'ouvrage a décidé de vous adjuger les travaux « ${c.lv} » du projet « ${c.project} ».`,
        `L'adjudication se base sur votre offre${c.offerReference ? ` ${c.offerReference}` : ""}${c.offerDate ? ` du ${c.offerDate}` : ""} d'un montant de CHF ${c.total} TVA incluse. Le contrat d'entreprise vous sera envoyé séparément.`,
        "Nous vous remercions de votre offre et nous réjouissons de notre collaboration.",
      ],
    },
    rejection: {
      subject: (c: LetterContext) => `Non-adjudication – ${c.lv}`,
      body: (c: LetterContext) => [
        `Nous vous remercions de votre offre${c.offerDate ? ` du ${c.offerDate}` : ""} pour les travaux « ${c.lv} » du projet « ${c.project} ».`,
        "Nous avons le regret de vous informer que le maître d'ouvrage a adjugé les travaux à un autre soumissionnaire.",
        "Nous vous remercions de vos efforts et serions heureux de pouvoir vous inviter à soumissionner lors d'une prochaine occasion.",
      ],
    },
    proposal: {
      title: "Proposition d'adjudication",
      offers: "Offres reçues",
      rank: "Rang",
      bidder: "Entrepreneur",
      offerDate: "Offre du",
      net: "Net hors TVA",
      total: "Total TVA incl.",
      vsCheapest: "Diff. à la moins chère",
      estimate: "Estimation des coûts",
      recommendation: "Proposition",
      recommend: (company: string, total: string) =>
        `Nous proposons d'adjuger les travaux à ${company} pour un montant de CHF ${total} TVA incluse.`,
      noRecommendation: "Aucun entrepreneur n'a encore été désigné pour l'adjudication.",
      justification: "Justification",
      proposedBy: "Proposé par",
      approvedBy: "Approbation du maître d'ouvrage",
    },
    comparison: {
      title: "Comparaison des offres",
      estimate: "Estimation",
      unitPrice: "PU",
      amount: "Montant",
      gross: "Brut",
      discount: "Rabais",
      deductions: "Déductions",
      net: "Net",
      skonto: "Escompte",
      vat: "TVA",
      total: "Total TVA incl.",
      rank: "Rang",
    },
  },
  it: {
    salutation: (p: Person) =>
      p?.salutation === "mr" ? `Egregio Signor ${p.last_name},` : p?.salutation === "ms" ? `Gentile Signora ${p.last_name},` : "Gentili Signore e Signori,",
    mr: "Signor",
    ms: "Signora",
    closing: "Distinti saluti",
    invitation: {
      subject: (c: LetterContext) => `Invito a presentare un'offerta – ${c.lv}`,
      body: (c: LetterContext) => [
        `Su incarico del committente vi invitiamo a presentare un'offerta per il progetto «${c.project}» per i lavori secondo l'allegato capitolato «${c.lv}».`,
        c.deadline
          ? `Vi preghiamo di inviarci la vostra offerta completa e firmata entro il ${c.deadline}.`
          : "Vi preghiamo di inviarci la vostra offerta completa e firmata.",
        "Restiamo volentieri a disposizione per eventuali domande e vi ringraziamo per la collaborazione.",
      ],
    },
    award: {
      subject: (c: LetterContext) => `Aggiudicazione – ${c.lv}`,
      body: (c: LetterContext) => [
        `Abbiamo il piacere di comunicarvi che il committente ha deciso di aggiudicarvi i lavori «${c.lv}» del progetto «${c.project}».`,
        `L'aggiudicazione si basa sulla vostra offerta${c.offerReference ? ` ${c.offerReference}` : ""}${c.offerDate ? ` del ${c.offerDate}` : ""} per un importo di CHF ${c.total} IVA inclusa. Il contratto d'appalto vi sarà inviato separatamente.`,
        "Vi ringraziamo per la vostra offerta e ci rallegriamo della collaborazione.",
      ],
    },
    rejection: {
      subject: (c: LetterContext) => `Mancata aggiudicazione – ${c.lv}`,
      body: (c: LetterContext) => [
        `Vi ringraziamo per la vostra offerta${c.offerDate ? ` del ${c.offerDate}` : ""} per i lavori «${c.lv}» del progetto «${c.project}».`,
        "Purtroppo dobbiamo comunicarvi che il committente ha aggiudicato i lavori a un altro offerente.",
        "Vi ringraziamo per l'impegno e saremmo lieti di invitarvi nuovamente a presentare un'offerta in una prossima occasione.",
      ],
    },
    proposal: {
      title: "Proposta di aggiudicazione",
      offers: "Offerte ricevute",
      rank: "Rango",
      bidder: "Impresa",
      offerDate: "Offerta del",
      net: "Netto IVA esclusa",
      total: "Totale IVA inclusa",
      vsCheapest: "Diff. dalla più economica",
      estimate: "Stima dei costi",
      recommendation: "Proposta",
      recommend: (company: string, total: string) =>
        `Proponiamo di aggiudicare i lavori a ${company} per l'importo di CHF ${total} IVA inclusa.`,
      noRecommendation: "Non è ancora stata designata alcuna impresa per l'aggiudicazione.",
      justification: "Motivazione",
      proposedBy: "Proponente",
      approvedBy: "Approvazione del committente",
    },
    comparison: {
      title: "Confronto delle offerte",
      estimate: "Stima",
      unitPrice: "PU",
      amount: "Importo",
      gross: "Lordo",
      discount: "Sconto",
      deductions: "Deduzioni",
      net: "Netto",
      skonto: "Sconto cassa",
      vat: "IVA",
      total: "Totale IVA inclusa",
      rank: "Rango",
    },
  },
} satisfies Record<AppLanguage, unknown>;

export const offerTexts = (language: AppLanguage) => texts[language];
export type LetterType = "invitation" | "award" | "rejection";
export type { LetterContext };
