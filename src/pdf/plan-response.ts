import { type DocumentProps, renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import { documentToDxf } from "./dxf";

/**
 * Response with a plan document: the PDF (inline), or with `?format=dxf` the same sheet as DXF download for CAD.
 * `name` is the file name without extension.
 */
export async function planResponse(request: Request, doc: ReactElement<DocumentProps>, name: string) {
  const file = name.replace(/[^\w.-]/g, "_");
  if (new URL(request.url).searchParams.get("format") === "dxf") {
    return new Response(documentToDxf(doc), {
      headers: {
        "Content-Type": "application/dxf",
        "Content-Disposition": `attachment; filename="${file}.dxf"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const pdf = await renderToBuffer(doc);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
