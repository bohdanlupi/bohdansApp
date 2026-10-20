import { ArrowDown, ArrowUp, Paperclip } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { DeadlineDate } from "@/components/deadline-date";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type CreditorListItem, type CreditorSort, type CreditorSortKey, type CreditorStatus, isCreditorCategory, ratesLabel, splitLines } from "@/lib/creditors";
import { formatMoney } from "@/lib/number-input";
import { cn } from "@/lib/utils";

import { PaidButton } from "./paid-button";

export type CreditorRow = CreditorListItem & {
  id: string;
  file_path: string | null;
};

/** Sorting of the list: the current order and the search params the header links have to keep. */
export type SortProps = { current: CreditorSort; params: Record<string, string | undefined> };

const statusStyles: Record<CreditorStatus, string> = {
  open: "bg-brand/15 text-foreground",
  paid: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
};

const WEIGHTS = [2.4, 1.2, 1, 1.3, 1.3, 1.6, 1, 1.1, 1.1, 0.4];
const WEIGHT_SUM = WEIGHTS.reduce((a, b) => a + b, 0);

/** Received invoices; open ones with their due date (marked when near or passed) and a button to mark them paid. */
export function CreditorTable({ rows, editable, sort }: { rows: CreditorRow[]; editable: boolean; sort?: SortProps }) {
  const t = useTranslations("creditors");
  const date = (value: string | null) => (value ? new Date(value).toLocaleDateString("de-CH") : "");

  /** Column header; a link that sorts by the column (second click reverses) when the table is sortable. */
  const head = (key: CreditorSortKey, label: ReactNode, className?: string) => {
    if (!sort) return <TableHead className={className}>{label}</TableHead>;
    const active = sort.current.key === key;
    const desc = active ? !sort.current.desc : key === "invoiceDate" || key === "dueDate" || key === "total" || key === "vat";
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(sort.params)) if (v) search.set(k, v);
    search.set("sortierung", key);
    if (desc) search.set("richtung", "desc");
    else search.delete("richtung");
    const Icon = sort.current.desc ? ArrowDown : ArrowUp;
    return (
      <TableHead className={className} aria-sort={active ? (sort.current.desc ? "descending" : "ascending") : undefined}>
        <Link href={`?${search}`} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
          {label}
          {active && <Icon className="size-3.5" aria-hidden />}
        </Link>
      </TableHead>
    );
  };

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
            {head("supplier", t("fields.supplier"), "pl-4")}
            {head("number", t("fields.number"))}
            {head("invoiceDate", t("fields.invoiceDate"))}
            {head("dueDate", t("columns.dueOrPaid"))}
            {head("category", t("fields.category"))}
            {head("project", t("fields.project"))}
            {head("vat", t("columns.vat"), "text-right")}
            {head("total", t("columns.total"), "text-right")}
            {head("status", t("fields.status"))}
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
