import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // Vremena mečeva su u UTC-u u bazi; prikazuju se u grčkoj zoni jer se u
    // njoj i igraju, bez obzira odakle korisnik gleda.
    timeZone: "Europe/Athens",
  };
});
