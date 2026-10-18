import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { requireProfile } from "@/lib/auth";
import { isCreditorCategory, isCreditorStatus, parseVatLines } from "@/lib/creditors";
import { createClient } from "@/lib/supabase/server";

import { CreditorForm } from "../creditor-form";
import { loadCreditorOptions } from "../load-options";

async function loadInvoice(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("creditor_invoices").select("*, company:companies(name)").eq("id", id).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/kreditoren/[id]">): Promise<Metadata> {
  const invoice = await loadInvoice((await params).id);
  const t = await getTranslations("creditors");
  return { title: invoice ? [invoice.company?.name, invoice.number].filter(Boolean).join(" ") : t("title") };
}

export default async function CreditorInvoicePage({ params }: PageProps<"/kreditoren/[id]">) {
  const profile = await requireProfile();
  const invoice = await loadInvoice((await params).id);
  if (!invoice) notFound();
  const t = await getTranslations("creditors");
  const { companies, projects } = await loadCreditorOptions(await createClient());
  // An archived supplier or project stays selectable on its own invoice.
  const company = companies.some((c) => c.id === invoice.company_id) ? [] : [{ id: invoice.company_id, name: invoice.company?.name ?? "", city: null }];

  return (
    <div className="max-w-4xl space-y-4">
      <Link href="/kreditoren" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>
      <PageHeader title={[invoice.company?.name, invoice.number].filter(Boolean).join(" · ")} />
      <CreditorForm
        key={invoice.id}
        isNew={false}
        editable={profile.role !== "viewer"}
        companies={[...companies, ...company]}
        projects={projects}
        initial={{
          id: invoice.id,
          company_id: invoice.company_id,
          project_id: invoice.project_id,
          number: invoice.number,
          invoice_date: invoice.invoice_date,
          due_date: invoice.due_date,
          status: isCreditorStatus(invoice.status) ? invoice.status : "open",
          paid_date: invoice.paid_date,
          category: isCreditorCategory(invoice.category) ? invoice.category : "other",
          vat_lines: parseVatLines(invoice.vat_lines),
          description: invoice.description,
          file_path: invoice.file_path,
          file_name: invoice.file_name,
        }}
      />
    </div>
  );
}
