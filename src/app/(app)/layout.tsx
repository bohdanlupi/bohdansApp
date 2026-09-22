import { requireProfile } from "@/lib/auth";

import { AppSidebar } from "./app-sidebar";
import { UserMenu } from "./user-menu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b px-6">
          <UserMenu name={profile.full_name ?? profile.email} role={profile.role} />
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
