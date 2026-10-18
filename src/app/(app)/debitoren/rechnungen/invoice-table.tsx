import Link from "next/link";
import { useTranslations } from "next-intl";

import { DeadlineDate } from "@/components/deadline-date";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type FeeInvoiceStatus, feeInvoiceStatuses } from "@/lib/fees/invoice";
import { formatMoney } from "@/lib/number-input";
import { cn } from "@/lib/utils";

export type InvoiceRow = {
  id: string;
  number: string;
  offerNumber: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  total: number;
  net: number;
  client: string | null;
  contact?: { first_name: string | null; last_name: string; mobile: string | null; phone: string | null; email: string | null } | null;
  /** Project and title (overview of all invoices). */
  project?: { number: string; title: string } | null;
};

const styles: Record<FeeInvoiceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-brand/15 text-foreground",
  paid: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
};

const isStatus = (value: string): value is FeeInvoiceStatus => feeInvoiceStatuses.includes(value as FeeInvoiceStatus);

export function InvoiceStatusBadge({ status }: { status: FeeInvoiceStatus }) {
  const t = useTranslations("feeInvoices.status");
  return <Badge className={cn(styles[status])}>{t(status)}</Badge>;
}

const date = (value: string | null) => (value ? new Date(value).toLocaleDateString("de-CH") : "");

/** Invoices of a project with offer, dates (due date marked while open), amount incl. MwSt. and status. */
export function InvoiceTable({ invoices }: { invoices: InvoiceRow[] }) {
  const t = useTranslations("feeInvoices.columns");
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">{t("number")}</TableHead>
            <TableHead>{t("offer")}</TableHead>
            <TableHead>{t("date")}</TableHead>
            <TableHead>{t("due")}</TableHead>
            <TableHead className="text-right">{t("total")}</TableHead>
            <TableHead className="pr-4">{t("status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((i) => (
            <TableRow key={i.id} className="relative">
              <TableCell className="pl-4 font-medium tabular-nums">
                <Link href={`/debitoren/rechnungen/${i.id}`} className="after:absolute after:inset-0">
                  {i.number}
                </Link>
              </TableCell>
              <TableCell className="tabular-nums">{i.offerNumber}</TableCell>
              <TableCell className="tabular-nums">{date(i.invoice_date)}</TableCell>
              <TableCell>
                <DeadlineDate date={i.due_date} kind="due" active={i.status === "draft" || i.status === "sent"} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(i.total)}</TableCell>
              <TableCell className="pr-4">{isStatus(i.status) && <InvoiceStatusBadge status={i.status} />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
