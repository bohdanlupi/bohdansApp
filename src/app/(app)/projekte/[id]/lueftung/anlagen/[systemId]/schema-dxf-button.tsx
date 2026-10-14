"use client";

import { FileDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";

/**
 * «Prinzipschema DXF»: the plan of the PDF (schema, legend, title block, logo) as DXF for CAD, which AutoCAD /
 * BricsCAD open and can save as DWG. Like the PDF it shows the saved state, so saving comes first.
 */
export function SchemaDxfButton({ url, dirty }: { url: string; dirty: boolean }) {
  const t = useTranslations("kwlSystem");
  return (
    <a
      href={`${url}?format=dxf`}
      download
      className={buttonVariants({ variant: "outline" })}
      onClick={(e) => {
        if (!dirty) return;
        e.preventDefault();
        toast.error(t("saveFirst"));
      }}
    >
      <FileDown />
      {t("schemaDxf")}
    </a>
  );
}
