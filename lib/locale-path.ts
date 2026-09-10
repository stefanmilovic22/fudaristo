import { getLocale } from "next-intl/server";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

/**
 * Lokalizovana putanja za `redirect()` iz next/navigation.
 *
 * Zašto ne `redirect` iz @/i18n/navigation: taj nije tipiziran kao `never`,
 * pa TypeScript posle njega ne zna da izvršavanje prestaje — svaka provera
 * tipa iza njega puca ("user is possibly null"). Ovako se putanja samo
 * IZRAČUNA sa prefiksom jezika, a preusmerava i dalje Next-ov redirect, koji
 * jeste `never`.
 *
 * Query string se odvaja i ponovo lepi jer getPathname radi samo sa putanjom.
 */
export async function localePath(href: string) {
  const locale = (await getLocale()) as Locale;
  const [path, query] = href.split("?");
  const localized = getPathname({ href: path, locale });
  return query ? `${localized}?${query}` : localized;
}
