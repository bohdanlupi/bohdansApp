import { requireProfile } from "@/lib/auth";

import { AppNav } from "./app-nav";
import { UserMenu } from "./user-menu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b px-6">
        <AppNav />
        <UserMenu name={profile.full_name ?? profile.email} role={profile.role} />
      </header>
      <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
