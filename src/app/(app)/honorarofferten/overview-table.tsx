import Link from "next/link";
import { useTranslations } from "next-intl";

import { DeadlineDate } from "@/components/deadline-date";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/number-input";

/** Row of the Honorarofferten overview: an open invoice or an offer, both with the same columns. */
export type OverviewRow = {
  id: string;
  href: string;
  projectNumber: string | null;
  title: string;
  /** Offer or invoice number, shown below the title. */
  number: string;
  client: string | null;
  date: string;
  deadline: string | null;
  /** Deadline still matters (open offer / unpaid invoice): marked when passed or near. */
  deadlineActive: boolean;
  net: number;
  total: number;
  status: React.ReactNode;
};

/** Fixed column widths, so the tables of the overview (open invoices, offers, paid invoices) line up. */
const columns = ["w-28", "", "w-56", "w-28", "w-52", "w-36", "w-36", "w-28"];

export function OverviewTable({ rows, kind }: { rows: OverviewRow[]; kind: "invoice" | "offer" }) {
  const t = useTranslations("feeOffers.overview");
  return (
    <div className="rounded-xl border">
      <Table className="min-w-[64rem] table-fixed">
        <colgroup>
          {columns.map((c, i) => (
            <col key={i} className={c} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">{t("projectNumber")}</TableHead>
            <TableHead>{t("project")}</TableHead>
            <TableHead>{t("client")}</TableHead>
            <TableHead>{t("date")}</TableHead>
            <TableHead>{kind === "invoice" ? t("due") : t("validUntil")}</TableHead>
            <TableHead className="text-right">{t("net")}</TableHead>
            <TableHead className="text-right">{t("total")}</TableHead>
            <TableHead className="pr-4">{t("status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="relative">
              <TableCell className="pl-4 font-medium tabular-nums">{r.projectNumber ?? "–"}</TableCell>
              <TableCell className="truncate">
                <Link href={r.href} className="font-medium after:absolute after:inset-0">
                  {r.title}
                </Link>
                <span className="block text-xs text-muted-foreground tabular-nums">{r.number}</span>
              </TableCell>
              <TableCell className="truncate">{r.client}</TableCell>
              <TableCell className="tabular-nums">{new Date(r.date).toLocaleDateString("de-CH")}</TableCell>
              <TableCell className="whitespace-normal">
                <DeadlineDate date={r.deadline} kind={kind === "invoice" ? "due" : "validUntil"} active={r.deadlineActive} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(r.net)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(r.total)}</TableCell>
              <TableCell className="pr-4">{r.status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
