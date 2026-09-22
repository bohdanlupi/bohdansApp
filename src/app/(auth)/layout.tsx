import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-sidebar px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3">
          <Image src="/brand/logo.png" alt="LUPI" width={200} height={78} priority />
          <p className="text-sm text-muted-foreground">Technik &amp; Planung GmbH</p>
        </div>
        {children}
      </div>
    </main>
  );
}
