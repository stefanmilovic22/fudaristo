/**
 * Zamena za next/link i next/navigation kroz celu aplikaciju.
 *
 * Ovi omotači sami dodaju prefiks jezika u href, pa `<Link href="/liga">` na
 * srpskom vodi na /sr/liga. Ako se negde uveze obični next/link, taj link
 * izbaci korisnika na engleski — zato je zamena urađena svuda odjednom.
 *
 * `Link` je naš omotač (i18n/link.tsx) koji dodaje učitavanje na hover.
 */
export { redirect, usePathname, useRouter, getPathname } from "./base-navigation";
export { Link } from "./link";
