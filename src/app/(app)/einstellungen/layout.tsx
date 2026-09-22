import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";

import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("settings");
  return (
    <>
      <PageHeader title={t("title")} />
      <SettingsNav />
      <div className="mt-6 max-w-3xl">{children}</div>
    </>
  );
}
