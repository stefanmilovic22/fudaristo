import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Zamena za next/link i next/navigation kroz celu aplikaciju.
 *
 * Ovi omotači sami dodaju prefiks jezika u href, pa `<Link href="/liga">` na
 * srpskom vodi na /sr/liga. Ako se negde uveze obični next/link, taj link
 * izbaci korisnika na engleski — zato je zamena urađena svuda odjednom.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
