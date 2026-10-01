"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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

  // Traka sa tabovima se prilagođava dostupnoj širini u tri koraka:
  //   0 — ikonice + tekst, 1 — samo tekst (kompaktno), 2 — sakrivena.
  // Širina zavisi od jezika (grčki je najduži) i od admin stavke, pa se ne
  // može pogoditi fiksnim pragom — meri se stvarna širina. Hamburger sa
  // bočnim menijem je uvek tu, pa korak 2 ništa ne gubi.
  const locale = useLocale();
  const barRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLElement>(null);
  const levelRef = useRef(0);
  const skipRef = useRef(false);
  const [level, setLevel] = useState(0);

  const reset = () => {
    skipRef.current = levelRef.current !== 0;
    levelRef.current = 0;
    setLevel(0);
  };

  // Promena jezika/uloge ili širine prostora → kreni ispočetka od koraka 0.
  useLayoutEffect(() => {
    reset();
  }, [locale, isAdmin]);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    let lastWidth = bar.clientWidth;
    const ro = new ResizeObserver(() => {
      if (bar.clientWidth !== lastWidth) {
        lastWidth = bar.clientWidth;
        reset();
      }
    });
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  // Posle svakog iscrtavanja proveri da li stane; ako ne, pređi na sledeći korak.
  useLayoutEffect(() => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const bar = barRef.current;
    const inner = innerRef.current;
    if (!bar || !inner) return;
    // Traka se razvlači preko celog prostora, pa je prelivanje (scrollWidth) jedini
    // pouzdan znak da tabovi ne staju.
    if (inner.scrollWidth > inner.clientWidth && levelRef.current < 2) {
      levelRef.current += 1;
      setLevel(levelRef.current);
    }
  }, [level, locale, isAdmin]);

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
      {/* Hamburger pored logoa (kao u FPL-u) — na svim širinama; otvara bočni
          meni sa istim stavkama kao traka sa tabovima. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("openMenu")}
        aria-expanded={open}
        className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 grid place-items-center rounded-lg bg-navy-800 border border-navy-600 text-slate-300 hover:text-chalk-50 transition-colors"
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

      {/* Traka sa tabovima — od 1024px, ali se prikazuje samo ako cela stane
          (videti barFits iznad); inače ostaje samo hamburger. */}
      <div
        ref={barRef}
        className={`order-2 hidden lg:flex flex-1 min-w-0 mx-3 xl:mx-5 ${
          level < 2 ? "" : "invisible"
        }`}
      >
      <nav
            ref={innerRef}
            className="flex w-full gap-0.5 bg-navy-800 p-1 rounded-lg whitespace-nowrap overflow-hidden"
          >
          {items.map(({ key, href }) => {
            const active = isActive(href);
            const Icon = ICONS[key];
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 items-center justify-center gap-1.5 text-sm font-semibold ${
                  level === 0 ? "px-2.5" : "px-2"
                } py-2 rounded-md whitespace-nowrap transition-colors ${
                  active
                    ? "bg-navy-950 text-chalk-50 ring-1 ring-navy-600"
                    : key === "admin"
                      ? "text-gold-300 hover:text-gold-400"
                      : "text-slate-300 hover:text-chalk-50"
                }`}
              >
                {level === 0 && (
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active || key === "admin" ? "text-gold-300" : "text-slate-400"
                    }`}
                  />
                )}
                {t(key)}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bočni meni */}
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label={t("closeMenu")}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          />

          <div className="relative mr-auto h-full w-[78%] max-w-[300px] bg-navy-900 border-r border-navy-700 flex flex-col shadow-2xl">
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
