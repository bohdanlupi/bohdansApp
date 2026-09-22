import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("loginTitle") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <LoginForm
      next={typeof next === "string" ? next : undefined}
      linkError={error === "link" ? t("linkInvalid") : undefined}
    />
  );
}
