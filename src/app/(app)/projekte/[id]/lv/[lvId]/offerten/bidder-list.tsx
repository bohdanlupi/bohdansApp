"use client";

import { Plus, Trophy } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";

import { CompanyPicker, type CompanyOption } from "@/components/company-picker";
import { FormMessage, NativeSelect, SubmitButton } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { initialFormState } from "@/lib/form-state";
import { formatMoney } from "@/lib/number-input";
import type { LvBidder } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import { getCompanyContacts } from "../../../../actions";
import { addBidder } from "./actions";

export type BidderView = LvBidder & {
  company: { id: string; name: string; city: string | null };
  contact: { id: string; first_name: string | null; last_name: string } | null;
  gross: number;
  missing: number;
};

export const bidderStatusStyles = {
  invited: "bg-muted text-muted-foreground",
  offered: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  declined: "bg-transparent border-border text-muted-foreground line-through",
} as const;

export function BidderList({
  projectId,
  lvId,
  bidders,
  selectedId,
  companies,
  editable,
  awardedBidderId,
}: {
  projectId: string;
  lvId: string;
  bidders: BidderView[];
  selectedId: string | null;
  companies: (CompanyOption & { match: boolean })[];
  editable: boolean;
  awardedBidderId: string | null;
}) {
  const t = useTranslations("offers");
  const [adding, setAdding] = useState(false);
  const base = `/projekte/${projectId}/lv/${lvId}/offerten`;

  return (
    <div className="rounded-xl border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{t("bidders")}</h3>
        {editable && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus />
            {t("addBidder")}
          </Button>
        )}
      </div>
      {bidders.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("noBiddersShort")}</p>
      ) : (
        <ul className="divide-y">
          {bidders.map((b) => (
            <li key={b.id}>
              <Link
                href={`${base}?bieter=${b.id}`}
                aria-current={b.id === selectedId ? "true" : undefined}
                className={cn("block px-4 py-3 text-sm hover:bg-muted/60", b.id === selectedId && "bg-brand/10 hover:bg-brand/15")}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{b.company.name}</span>
                  {b.id === awardedBidderId && <Trophy className="size-4 text-amber-500" aria-label={t("awarded")} />}
                  <Badge className={bidderStatusStyles[b.status]}>{t(`status.${b.status}`)}</Badge>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {[b.company.city, b.contact && [b.contact.first_name, b.contact.last_name].filter(Boolean).join(" ")]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {b.status === "offered" && (
                    <span className="shrink-0 tabular-nums">
                      {b.missing > 0 && <span className="mr-2 text-amber-600">{t("missingPrices", { count: b.missing })}</span>}
                      {formatMoney(b.gross)}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="sm:max-w-lg">
            {adding && <AddBidderForm lvId={lvId} companies={companies} onSaved={() => setAdding(false)} />}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

type ContactOption = Awaited<ReturnType<typeof getCompanyContacts>>[number];

function AddBidderForm({
  lvId,
  companies,
  onSaved,
}: {
  lvId: string;
  companies: (CompanyOption & { match: boolean })[];
  onSaved: () => void;
}) {
  const t = useTranslations();
  const [state, action] = useActionState(addBidder, initialFormState);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (state.success) onSaved();
  }, [state, onSaved]);

  return (
    <form action={action} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("offers.addBidder")}</DialogTitle>
        <DialogDescription>{t("offers.addBidderHint")}</DialogDescription>
      </DialogHeader>
      <input type="hidden" name="lv_id" value={lvId} />
      <FormMessage state={state.error ? state : initialFormState} />
      <div className="space-y-2">
        <Label htmlFor="bidder-company">{t("projects.participants.company")}</Label>
        <CompanyPicker
          id="bidder-company"
          name="company_id"
          options={companies}
          required
          onChange={async (id) => {
            setCompanyId(id);
            setContacts(id ? await getCompanyContacts(id) : []);
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bidder-contact">{t("projects.participants.contact")}</Label>
        <NativeSelect id="bidder-contact" name="contact_id" key={companyId ?? "none"} disabled={!contacts.length}>
          <option value="">{t("projects.participants.noContact")}</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {[c.first_name, c.last_name].filter(Boolean).join(" ")}
              {c.function ? ` (${c.function})` : ""}
            </option>
          ))}
        </NativeSelect>
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{t("common.cancel")}</DialogClose>
        <SubmitButton>{t("common.add")}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
