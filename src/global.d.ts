import type messages from "../messages/de-CH.json";
import type { Locale } from "./i18n/config";

// Typed translation keys: German is the reference, fr/it must mirror it.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
