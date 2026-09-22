import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { ProjectStatus } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

const styles: Record<ProjectStatus, string> = {
  acquisition: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  active: "bg-brand/15 text-foreground",
  on_hold: "bg-muted text-muted-foreground",
  completed: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  archived: "bg-transparent text-muted-foreground border-border",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const t = useTranslations("options.projectStatus");
  return <Badge className={cn(styles[status])}>{t(status)}</Badge>;
}
