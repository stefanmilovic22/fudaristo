import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Osnova za zamenu next/link i next/navigation kroz celu aplikaciju — NE uvozi se
 * direktno: koristi se `@/i18n/navigation`, koji ovde dodaje učitavanje na hover
 * (i18n/link.tsx).
 *
 * Zamena za next/link i next/navigation kroz celu aplikaciju.
 *
 * Ovi omotači sami dodaju prefiks jezika u href, pa `<Link href="/liga">` na
 * srpskom vodi na /sr/liga. Ako se negde uveze obični next/link, taj link
 * izbaci korisnika na engleski — zato je zamena urađena svuda odjednom.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
