import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { InviteForm, UserRow } from "./user-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.tabs");
  return { title: t("users") };
}

export default async function UsersPage() {
  const profile = await requireProfile();
  const t = await getTranslations("settings.users");
  const isAdmin = profile.role === "admin";

  const supabase = await createClient();
  const { data: users } = await supabase.from("profiles").select("*").order("full_name");

  return (
    <div className="space-y-6">
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>{t("inviteTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteForm />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("listTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {(users ?? []).map((user) => (
            <UserRow key={user.id} user={user} editable={isAdmin} isSelf={user.id === profile.id} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
