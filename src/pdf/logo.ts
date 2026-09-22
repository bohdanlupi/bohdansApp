import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { LogoSource } from "./letterhead";

/** Firm logo for PDFs (bundled via outputFileTracingIncludes in next.config.ts). */
export async function loadLogo(): Promise<LogoSource | null> {
  try {
    const data = await readFile(path.join(process.cwd(), "public", "brand", "logo.png"));
    return { data, format: "png" };
  } catch {
    return null;
  }
}
