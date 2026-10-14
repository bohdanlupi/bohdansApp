"use client";

import { FileDown } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RefObject } from "react";

import { Button } from "@/components/ui/button";
import { downloadDxf } from "@/lib/dxf";

/**
 * «Prinzipschema DXF»: the schema as drawn in the editor (current, also unsaved state) as a DXF file for CAD, which
 * AutoCAD / BricsCAD open and can save as DWG. `target` holds the schema view; its first SVG is exported.
 */
export function SchemaDxfButton({ target, name }: { target: RefObject<HTMLElement | null>; name: string }) {
  const t = useTranslations("kwlSystem");
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        const svg = target.current?.querySelector("svg");
        if (svg) downloadDxf(svg, name);
      }}
    >
      <FileDown />
      {t("schemaDxf")}
    </Button>
  );
}
