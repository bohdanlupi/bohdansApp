import Link from "next/link";
import { useTranslations } from "next-intl";

import { DeadlineDate } from "@/components/deadline-date";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { feeTotals } from "@/lib/fees/calc";
import { parseFeeOfferData } from "@/lib/fees/offer-schema";
import { type FeeOfferStatus, feeOfferStatuses } from "@/lib/fees/options";
import type { Json } from "@/lib/supabase/database.types";
import { formatMoney } from "@/lib/number-input";

import { FeeStatusBadge } from "./status-badge";

export type OfferRow = {
  id: string;
  number: string;
  title: string;
  city: string | null;
  offer_date: string;
  valid_until: string | null;
  status: string;
  data: Json;
  company: { name: string } | null;
};

export const isFeeOfferStatus = (value: string | undefined): value is FeeOfferStatus => feeOfferStatuses.includes(value as FeeOfferStatus);

/** Offers of a project with client, dates (valid until marked while open), fee and status. */
export function OfferTable({ offers, vatRate }: { offers: OfferRow[]; vatRate: number }) {
  const t = useTranslations("feeOffers.columns");
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">{t("number")}</TableHead>
            <TableHead>{t("title")}</TableHead>
            <TableHead>{t("client")}</TableHead>
            <TableHead>{t("date")}</TableHead>
            <TableHead>{t("validUntil")}</TableHead>
            <TableHead className="text-right">{t("net")}</TableHead>
            <TableHead className="pr-4">{t("status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {offers.map((o) => (
            <TableRow key={o.id} className="relative">
              <TableCell className="pl-4 font-medium tabular-nums">{o.number}</TableCell>
              <TableCell>
                <Link href={`/honorarofferten/${o.id}`} className="font-medium after:absolute after:inset-0">
                  {o.title}
                </Link>
              </TableCell>
              <TableCell className="max-w-64 truncate">{o.company?.name}</TableCell>
              <TableCell className="tabular-nums">{new Date(o.offer_date).toLocaleDateString("de-CH")}</TableCell>
              <TableCell>
                <DeadlineDate date={o.valid_until} kind="validUntil" active={o.status === "draft" || o.status === "sent"} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(feeTotals(parseFeeOfferData(o.data), vatRate).net)}</TableCell>
              <TableCell className="pr-4">{isFeeOfferStatus(o.status) && <FeeStatusBadge status={o.status} />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
