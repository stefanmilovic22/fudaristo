"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = [
  { key: "about", href: "/o-nama" },
  { key: "contact", href: "/kontakt" },
  { key: "privacy", href: "/privatnost" },
] as const;

/**
 * Bočni spisak informativnih stranica (O nama / Kontakt / Privatnost), kao
 * sekcije sa strane na FPL-ovim stranicama. Na širokom ekranu je uspravan sa
 * linijom pored aktivne stavke; na telefonu su tri dugmeta u redu.
 */
export function InfoNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav
      aria-label="Info"
      className="grid grid-cols-3 gap-2 lg:flex lg:flex-col lg:gap-1 lg:self-start lg:sticky lg:top-24 lg:bg-navy-800 lg:border lg:border-navy-700 lg:rounded-xl lg:p-2"
    >
      {ITEMS.map(({ key, href }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`text-center lg:text-left text-sm px-3 py-2.5 rounded-lg border lg:border-0 lg:border-l-[3px] transition-colors ${
              active
                ? "bg-navy-800 lg:bg-navy-700/60 border-gold-400 text-chalk-50 font-bold"
                : "border-navy-700 lg:border-transparent text-slate-300 hover:text-chalk-50 hover:bg-navy-700/40"
            }`}
          >
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
