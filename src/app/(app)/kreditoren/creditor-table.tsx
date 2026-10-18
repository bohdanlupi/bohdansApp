import { Paperclip } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { DeadlineDate } from "@/components/deadline-date";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type CreditorStatus, isCreditorCategory, ratesLabel, splitLines, type VatLine } from "@/lib/creditors";
import { formatMoney } from "@/lib/number-input";
import { cn } from "@/lib/utils";

import { PaidButton } from "./paid-button";

export type CreditorRow = {
  id: string;
  number: string;
  invoice_date: string;
  due_date: string | null;
  paid_date: string | null;
  status: CreditorStatus;
  category: string;
  total: number;
  vat_lines: VatLine[];
  description: string;
  file_path: string | null;
  company: { name: string } | null;
  project: { number: string; name: string } | null;
};

const statusStyles: Record<CreditorStatus, string> = {
  open: "bg-brand/15 text-foreground",
  paid: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
};

const WEIGHTS = [2.4, 1.2, 1, 1.3, 1.3, 1.6, 1, 1.1, 1.1, 0.4];
const WEIGHT_SUM = WEIGHTS.reduce((a, b) => a + b, 0);

/** Received invoices; open ones with their due date (marked when near or passed) and a button to mark them paid. */
export function CreditorTable({ rows, editable }: { rows: CreditorRow[]; editable: boolean }) {
  const t = useTranslations("creditors");
  const date = (value: string | null) => (value ? new Date(value).toLocaleDateString("de-CH") : "");
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table className="min-w-[72rem] table-fixed">
        <colgroup>
          {WEIGHTS.map((w, i) => (
            <col key={i} style={{ width: `${(100 * w) / WEIGHT_SUM}%` }} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">{t("fields.supplier")}</TableHead>
            <TableHead>{t("fields.number")}</TableHead>
            <TableHead>{t("fields.invoiceDate")}</TableHead>
            <TableHead>{t("columns.dueOrPaid")}</TableHead>
            <TableHead>{t("fields.category")}</TableHead>
            <TableHead>{t("fields.project")}</TableHead>
            <TableHead className="text-right">{t("columns.vat")}</TableHead>
            <TableHead className="text-right">{t("columns.total")}</TableHead>
            <TableHead>{t("fields.status")}</TableHead>
            <TableHead className="pr-4">
              <span className="sr-only">{t("sections.document")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="relative">
              <TableCell className="truncate pl-4">
                <Link href={`/kreditoren/${r.id}`} className="font-medium after:absolute after:inset-0">
                  {r.company?.name ?? "–"}
                </Link>
                {r.description && <span className="block truncate text-xs text-muted-foreground">{r.description}</span>}
              </TableCell>
              <TableCell className="truncate tabular-nums">{r.number}</TableCell>
              <TableCell className="tabular-nums">{date(r.invoice_date)}</TableCell>
              <TableCell className="whitespace-normal">
                {r.status === "paid" ? (
                  <span className="tabular-nums text-muted-foreground">{date(r.paid_date)}</span>
                ) : (
                  <DeadlineDate date={r.due_date} kind="due" active />
                )}
              </TableCell>
              <TableCell className="truncate">{isCreditorCategory(r.category) ? t(`categories.${r.category}`) : r.category}</TableCell>
              <TableCell className="truncate">
                {r.project ? (
                  <>
                    <span className="tabular-nums">{r.project.number}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.project.name}</span>
                  </>
                ) : (
                  "–"
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(splitLines(r.vat_lines).vat)}
                <span className="block text-xs text-muted-foreground">{ratesLabel(r.vat_lines)}</span>
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">{formatMoney(r.total)}</TableCell>
              <TableCell>
                {r.status === "open" && editable ? (
                  <PaidButton id={r.id} />
                ) : (
                  <Badge className={cn(statusStyles[r.status])}>{t(`status.${r.status}`)}</Badge>
                )}
              </TableCell>
              <TableCell className="pr-4">
                {r.file_path && (
                  <a href={`/api/kreditoren/beleg/${r.id}`} target="_blank" rel="noreferrer" aria-label={t("document")} className="relative z-10 text-muted-foreground hover:text-foreground">
                    <Paperclip className="size-4" />
                  </a>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
