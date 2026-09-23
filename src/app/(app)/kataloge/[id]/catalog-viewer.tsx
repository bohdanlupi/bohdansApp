"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { CatalogBrowser } from "@/components/catalog-browser";
import { pickText, type I18nText } from "@/lib/i18n-text";
import { formatMoney } from "@/lib/number-input";
import type { Tables } from "@/lib/supabase/database.types";
import type { AppLanguage } from "@/lib/supabase/types";
import { isPosition } from "@/lib/tree";
import { getCatalogNode } from "@/lib/tree-actions";

/** Read-only view of a supplier catalogue: lazy tree + search on the left, the selected entry on the right. */
export function CatalogViewer({ catalogId, language }: { catalogId: string; language: AppLanguage }) {
  const t = useTranslations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [node, setNode] = useState<Tables<"catalog_nodes"> | null>(null);
  const [loading, setLoading] = useState(false);
  const latest = useRef<string | null>(null);

  const select = async (id: string) => {
    latest.current = id;
    setSelectedId(id);
    setLoading(true);
    const result = await getCatalogNode(id);
    if (latest.current !== id) return;
    setNode(result);
    setLoading(false);
  };

  const shortText = node ? pickText(node.short_text as I18nText, language).value : "";
  const longText = node ? pickText(node.long_text as I18nText, language).value : "";

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_26rem] 2xl:grid-cols-[minmax(0,1fr)_32rem]">
      <CatalogBrowser
        key={catalogId}
        catalogId={catalogId}
        language={language}
        selectedId={selectedId}
        onSelect={select}
        listClassName="max-h-[calc(100vh-17rem)] min-h-64"
      />

      <div className="lg:sticky lg:top-4">
        {!selectedId || !node ? (
          <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
            {loading ? <Loader2 className="mx-auto size-5 animate-spin" /> : t("catalogBrowser.selectHint")}
          </p>
        ) : (
          <div className="space-y-4 rounded-xl border p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">
                {node.article_number && (
                  <span className="font-mono tabular-nums">
                    {t("catalogBrowser.articleNumber")} {node.article_number}
                  </span>
                )}{" "}
                <span className="font-normal text-muted-foreground">{t(`tree.kinds.${node.kind}`)}</span>
              </div>
              {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                {node.kind === "group" ? t("tree.fields.title") : t("tree.fields.shortText")}
              </div>
              <p className="font-medium">{shortText || "–"}</p>
            </div>
            {longText && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">{t("tree.fields.longText")}</div>
                <p className="max-h-96 overflow-auto whitespace-pre-line">{longText}</p>
              </div>
            )}
            {isPosition(node.kind) && (
              <dl className="grid grid-cols-3 gap-3">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">{t("tree.fields.unit")}</dt>
                  <dd>{node.unit ?? "–"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">{t("catalogBrowser.grossPrice")}</dt>
                  <dd className="tabular-nums">{node.unit_price !== null ? `CHF ${formatMoney(node.unit_price)}` : "–"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">{t("tree.fields.priceDate")}</dt>
                  <dd className="tabular-nums">{node.price_date ? new Date(node.price_date).toLocaleDateString("de-CH") : "–"}</dd>
                </div>
              </dl>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
