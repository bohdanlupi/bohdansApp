import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { defaultLocale, isLocale, LOCALE_COOKIE } from "./config";

// No locale in the URL: the language comes from a cookie that is set at login
// (from the user's profile) and when the user switches language.
export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return {
    locale,
    timeZone: "Europe/Zurich",
    messages: (await import(`../../messages/${locale}.json`)).default,
    formats: {
      number: {
        chf: { style: "currency", currency: "CHF" },
        amount: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      },
      dateTime: {
        short: { day: "2-digit", month: "2-digit", year: "numeric" },
      },
    },
  };
});
