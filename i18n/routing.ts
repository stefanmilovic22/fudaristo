import { defineRouting } from "next-intl/routing";

/**
 * Tri jezika: engleski (podrazumevan), srpski, grčki.
 *
 * `localePrefix: "as-needed"` znači da engleski ostaje na postojećim
 * adresama (/liga, /raspored), a ostali dobijaju prefiks (/sr/liga, /el/liga).
 * Time nijedan postojeći link, obeleživač ni Supabase redirect URL ne puca.
 *
 * SLUGOVI OSTAJU SRPSKI (/moj-tim, /raspored, /podesavanja) i na engleskom.
 * Prevođenje samih putanja next-intl podržava (`pathnames`), ali bi promenilo
 * sve postojeće adrese odjednom — uključujući /auth/potvrda upisan u Supabase
 * podešavanjima. Ostavljeno za zaseban korak, kad bude vremena da se urade i
 * preusmerenja sa starih adresa.
 */
export const routing = defineRouting({
  locales: ["en", "sr", "el"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  // Pamti izbor jezika u kolačiću, da se korisnik ne vraća na engleski pri
  // svakom otvaranju.
  localeCookie: {
    maxAge: 60 * 60 * 24 * 365,
  },
});

export type Locale = (typeof routing.locales)[number];

export const LOCALE_META: Record<Locale, { label: string; flag: string; htmlLang: string }> = {
  en: { label: "English", flag: "🇬🇧", htmlLang: "en" },
  sr: { label: "Srpski", flag: "🇷🇸", htmlLang: "sr" },
  el: { label: "Ελληνικά", flag: "🇬🇷", htmlLang: "el" },
};
