import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Previous/next links that keep the current search params. */
export async function Pagination({
  page,
  pageSize,
  total,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  params: Record<string, string | undefined>;
}) {
  const t = await getTranslations("common");
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    if (target > 1) search.set("seite", String(target));
    const query = search.toString();
    return query ? `?${query}` : "?";
  };

  return (
    <div className="mt-4 flex items-center justify-between gap-4 text-sm text-muted-foreground">
      <span>{t("count", { count: total })}</span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <span>{t("pageOf", { page, pages })}</span>
          <Link
            href={href(page - 1)}
            aria-disabled={page <= 1}
            className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), page <= 1 && "pointer-events-none opacity-50")}
          >
            <ChevronLeft />
            <span className="sr-only">{t("previous")}</span>
          </Link>
          <Link
            href={href(page + 1)}
            aria-disabled={page >= pages}
            className={cn(
              buttonVariants({ variant: "outline", size: "icon-sm" }),
              page >= pages && "pointer-events-none opacity-50",
            )}
          >
            <ChevronRight />
            <span className="sr-only">{t("next")}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
