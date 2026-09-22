import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { Enums } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

const styles: Record<Enums<"lv_status">, string> = {
  draft: "bg-muted text-muted-foreground",
  tendered: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  awarded: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
};

export function LvStatusBadge({ status }: { status: Enums<"lv_status"> }) {
  const t = useTranslations("options.lvStatus");
  return <Badge className={cn(styles[status])}>{t(status)}</Badge>;
}
