"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Glavna navigacija — bočni meni na telefonu, traka sa tabovima od 1024px.
 *
 * Zašto meni: šest stavki sa ikonicama u vodoravnom skrolu znači da se pola
 * njih ne vidi dok se ne prevuče. Korisnik ne zna ni koliko ih ima ni gde je
 * „Statistike”. U meniju stoje jedna ispod druge, sve odjednom, sa dovoljno
 * velikom površinom za prst.
 *
 * `usePathname` iz @/i18n/navigation vraća putanju BEZ prefiksa jezika, pa
 * isticanje aktivne stavke radi isto na /liga i na /sr/liga.
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
  rules: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <path d="M9 12h6M9 16h6" strokeLinecap="round" />
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
  { key: "rules", href: "/pravila" },
  { key: "settings", href: "/podesavanja" },
];

export function MainNav({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items = isAdmin ? [...LINKS, { key: "admin" as NavKey, href: "/admin" }] : LINKS;

  // Poklapanje po prefiksu, da /admin/mecevi/... i dalje ističe "Admin".
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  // Meni se zatvara pri promeni stranice. Bez ovoga bi ostao otvoren preko
  // novog sadržaja, jer klijentska navigacija ne odmontira komponentu.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Dok je meni otvoren, pozadina ne sme da skroluje ispod njega.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* Dugme za meni — samo ispod 1024px */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("openMenu")}
        aria-expanded={open}
        className="order-3 lg:hidden shrink-0 w-10 h-10 grid place-items-center rounded-lg bg-navy-800 border border-navy-600 text-slate-300 hover:text-chalk-50 transition-colors"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="w-5 h-5"
        >
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>

      {/* Traka sa tabovima — od 1024px */}
      <nav className="order-2 hidden lg:flex shrink-0 gap-1 bg-navy-800 p-1 rounded-lg">
        {items.map(({ key, href }) => {
          const active = isActive(href);
          const Icon = ICONS[key];
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-md transition-colors ${
                active
                  ? "bg-navy-950 text-chalk-50 ring-1 ring-navy-600"
                  : key === "admin"
                    ? "text-gold-300 hover:text-gold-400"
                    : "text-slate-300 hover:text-chalk-50"
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  active || key === "admin" ? "text-gold-300" : "text-slate-400"
                }`}
              />
              {t(key)}
            </Link>
          );
        })}
      </nav>

      {/* Bočni meni */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label={t("closeMenu")}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          />

          <div className="relative ml-auto h-full w-[78%] max-w-[300px] bg-navy-900 border-l border-navy-700 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-navy-700">
              <span className="font-display font-bold text-lg bg-gold-400 text-navy-950 px-2 py-0.5 rounded">
                Fudaristo
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("closeMenu")}
                className="w-9 h-9 grid place-items-center rounded-lg text-slate-400 hover:text-chalk-50 hover:bg-navy-800 transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-5 h-5"
                >
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-2">
              {items.map(({ key, href }) => {
                const active = isActive(href);
                const Icon = ICONS[key];
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg font-semibold transition-colors ${
                      active
                        ? "bg-navy-800 text-chalk-50 ring-1 ring-navy-600"
                        : key === "admin"
                          ? "text-gold-300 hover:bg-navy-800"
                          : "text-slate-300 hover:bg-navy-800 hover:text-chalk-50"
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 shrink-0 ${
                        active || key === "admin" ? "text-gold-300" : "text-slate-400"
                      }`}
                    />
                    {t(key)}
                    {active && (
                      <span aria-hidden className="ml-auto w-1.5 h-1.5 rounded-full bg-gold-300" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
