import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";

import { PasswordForm, ProfileForm } from "./profile-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.tabs");
  return { title: t("profile") };
}

export default async function ProfilePage() {
  const profile = await requireProfile();
  return (
    <div className="space-y-6">
      <ProfileForm profile={profile} />
      <PasswordForm />
    </div>
  );
}
