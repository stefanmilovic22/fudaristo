"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Glavna navigacija.
 *
 * Klijentska je zbog jedne stvari: `usePathname` — bez nje se nije videlo na
 * kojoj si stranici. Svih pet linkova je izgledalo isto, pa se orijentacija
 * svodila na čitanje adrese.
 *
 * `usePathname` iz @/i18n/navigation vraća putanju BEZ prefiksa jezika, pa
 * poređenje radi isto na /liga i /sr/liga.
 *
 * Ikonice su ugrađeni SVG, ne biblioteka: pet sličica ne opravdava novu
 * zavisnost, a ovako nema ni dodatnog zahteva ni treperenja pri učitavanju.
 * Sve dele isti viewBox 24 i `currentColor`, pa prate boju teksta u svakom
 * stanju.
 */

type IconProps = { className?: string };

const ICONS = {
  myTeam: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M8 3 4 5v5h3v11h10V10h3V5l-4-2-4 2-4-2Z" strokeLinejoin="round" />
    </svg>
  ),
  fixtures: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  ),
  league: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M7 4h10v6a5 5 0 0 1-10 0V4Z" strokeLinejoin="round" />
      <path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M9 20h6M12 15v5" strokeLinecap="round" />
    </svg>
  ),
  stats: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M5 20V10M12 20V4M19 20v-6" strokeLinecap="round" />
    </svg>
  ),
  settings: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <circle cx="12" cy="12" r="3" />
      <path
        d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  admin: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3Z" strokeLinejoin="round" />
    </svg>
  ),
} as const;

type NavKey = keyof typeof ICONS;

const LINKS: { key: NavKey; href: string }[] = [
  { key: "myTeam", href: "/moj-tim" },
  { key: "fixtures", href: "/raspored" },
  { key: "league", href: "/liga" },
  { key: "stats", href: "/statistike" },
  { key: "settings", href: "/podesavanja" },
];

export function MainNav({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const items = isAdmin ? [...LINKS, { key: "admin" as NavKey, href: "/admin" }] : LINKS;

  return (
    <nav className="order-last w-full lg:order-none lg:w-auto flex gap-0.5 sm:gap-1 bg-navy-800 p-1 rounded-lg overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map(({ key, href }) => {
        // Poklapanje po prefiksu, da /admin/mecevi/... i dalje ističe "Admin".
        const active = pathname === href || pathname.startsWith(href + "/");
        const Icon = ICONS[key];
        const isAdminLink = key === "admin";

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 flex items-center gap-1 sm:gap-1.5 text-[13px] sm:text-sm font-semibold px-2 sm:px-3.5 py-2 rounded-md transition-colors ${
              active
                ? "bg-navy-950 text-chalk-50 shadow-sm ring-1 ring-navy-600"
                : isAdminLink
                  ? "text-gold-300 hover:text-gold-400"
                  : "text-slate-300 hover:text-chalk-50"
            }`}
          >
            <Icon
              className={`w-4 h-4 shrink-0 ${
                active ? "text-gold-300" : isAdminLink ? "text-gold-300" : "text-slate-400"
              }`}
            />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
