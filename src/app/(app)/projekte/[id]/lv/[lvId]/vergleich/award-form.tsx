"use client";

import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormMessage, NativeSelect, SubmitButton } from "@/components/form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { initialFormState } from "@/lib/form-state";
import { formatMoney } from "@/lib/number-input";

import { saveAward } from "../offerten/actions";

export function AwardForm({
  lvId,
  bidders,
  award,
  editable,
}: {
  lvId: string;
  bidders: { id: string; name: string; total: number; rank: number }[];
  award: { bidderId: string | null; date: string | null; justification: string | null };
  editable: boolean;
}) {
  const t = useTranslations("comparison.award");
  const [state, action] = useActionState(saveAward, initialFormState);
  const letter = (bidderId: string, type: "zusage" | "absage") => `/api/pdf/brief/${bidderId}?typ=${type}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form action={action} className="space-y-4">
          <input type="hidden" name="lv_id" value={lvId} />
          <FormMessage state={state} />
          <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="awarded_bidder_id">{t("bidder")}</Label>
              <NativeSelect id="awarded_bidder_id" name="awarded_bidder_id" defaultValue={award.bidderId ?? ""}>
                <option value="">{t("none")}</option>
                {bidders.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.rank}. {b.name} – CHF {formatMoney(b.total)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="award_date">{t("date")}</Label>
              <Input id="award_date" name="award_date" type="date" defaultValue={award.date ?? ""} />
            </div>
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="award_justification">{t("justification")}</Label>
              <Textarea
                id="award_justification"
                name="award_justification"
                rows={3}
                defaultValue={award.justification ?? ""}
                placeholder={t("justificationPlaceholder")}
              />
            </div>
          </fieldset>
          {editable && <SubmitButton>{t("save")}</SubmitButton>}
        </form>

        {award.bidderId && (
          <div className="space-y-2 border-t pt-4">
            <h4 className="text-sm font-semibold">{t("letters")}</h4>
            <ul className="space-y-1.5 text-sm">
              {bidders.map((b) => {
                const type = b.id === award.bidderId ? "zusage" : "absage";
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3">
                    <span>{b.name}</span>
                    <a href={letter(b.id, type)} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <FileText />
                      {type === "zusage" ? t("awardLetter") : t("rejectionLetter")}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
