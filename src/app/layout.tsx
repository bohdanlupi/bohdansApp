import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";

import { ThemeSync } from "@/components/theme-sync";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { parseTheme, systemThemeScript, THEME_COOKIE } from "@/lib/theme";
import { cn } from "@/lib/utils";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LUPI Planer", template: "%s · LUPI Planer" },
  description: "Leistungsverzeichnisse, Kostenvoranschläge und Angebotsvergleiche für HLKS-Planung",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  // Theme of the logged-in user, mirrored in a cookie at login and when the profile is saved.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang={locale}
      className={cn("h-full antialiased", theme === "dark" && "dark")}
      style={theme === "system" ? undefined : { colorScheme: theme }}
      suppressHydrationWarning
    >
      {theme === "system" && (
        <head>
          <script dangerouslySetInnerHTML={{ __html: systemThemeScript }} />
        </head>
      )}
      <body className="min-h-full">
        <NextIntlClientProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors position="top-right" theme={theme} />
          <ThemeSync theme={theme} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
