import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 36;
const HEADER = 22;

/** Standard fonts only encode WinAnsi: anything else becomes "?". */
const winAnsi = (text: string) => text.replace(/[^\x20-\x7e\xa0-\xff–—‘’“”•…€]/g, "?");

function stamp(page: PDFPage, font: PDFFont, text: string) {
  const { height } = page.getSize();
  const size = 8;
  const label = winAnsi(text);
  page.drawRectangle({ x: 12, y: height - 20, width: font.widthOfTextAtSize(label, size) + 8, height: 13, color: rgb(1, 1, 1), opacity: 0.9 });
  page.drawText(label, { x: 16, y: height - 16, size, font, color: rgb(0.12, 0.29, 0.49) });
}

export type Receipt = { label: string; name: string; load: () => Promise<Uint8Array | null> };

/**
 * Appends documents (PDF pages as they are, JPEG/PNG scaled onto an A4 page) to a PDF, each page stamped with its
 * label at the top left. A document that cannot be read gets a page with a note instead.
 */
export async function appendReceipts(base: Uint8Array, receipts: Receipt[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(base);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const receipt of receipts) {
    try {
      const bytes = await receipt.load();
      if (!bytes) throw new Error("missing");
      const isPdf = String.fromCharCode(...bytes.slice(0, 4)) === "%PDF";
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;

      if (isPdf) {
        const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await pdf.copyPages(source, source.getPageIndices());
        pages.forEach((page, i) => {
          pdf.addPage(page);
          stamp(page, font, pages.length > 1 ? `${receipt.label} (${i + 1}/${pages.length})` : receipt.label);
        });
      } else {
        const image = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        const page = pdf.addPage([A4.width, A4.height]);
        const box = { width: A4.width - 2 * MARGIN, height: A4.height - 2 * MARGIN - HEADER };
        const scale = Math.min(box.width / image.width, box.height / image.height, 1);
        const w = image.width * scale;
        const h = image.height * scale;
        page.drawImage(image, { x: (A4.width - w) / 2, y: MARGIN + (box.height - h) / 2, width: w, height: h });
        stamp(page, font, receipt.label);
      }
    } catch {
      const page = pdf.addPage([A4.width, A4.height]);
      stamp(page, font, receipt.label);
      page.drawText(winAnsi(`Der Beleg "${receipt.name}" konnte nicht angefügt werden.`), { x: MARGIN, y: A4.height - 80, size: 10, font });
    }
  }
  return pdf.save();
}
