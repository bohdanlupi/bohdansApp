import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { FeeOfferStatus } from "@/lib/fees/options";
import { cn } from "@/lib/utils";

const styles: Record<FeeOfferStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-brand/15 text-foreground",
  accepted: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  declined: "bg-transparent text-muted-foreground border-border",
};

export function FeeStatusBadge({ status }: { status: FeeOfferStatus }) {
  const t = useTranslations("feeOffers.status");
  return <Badge className={cn(styles[status])}>{t(status)}</Badge>;
}
