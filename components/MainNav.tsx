"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { SOCIAL_LINKS, type SocialKey } from "@/lib/site";

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
  table: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M3 14h18M9 9v11" strokeLinecap="round" />
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
  clubs: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" strokeLinejoin="round" />
      <path d="M9 11h6M12 8v8" strokeLinecap="round" />
    </svg>
  ),
  players: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.4c1.9.8 3 2.7 3 5.6" strokeLinecap="round" />
    </svg>
  ),
  instagram: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.8" />
      <circle cx="17" cy="7" r="0.6" fill="currentColor" />
    </svg>
  ),
  facebook: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M14 8h2.5V4.5H14A3.5 3.5 0 0 0 10.5 8v2.5H8V14h2.5v6.5H14V14h2.5l.5-3.5H14V8.5A.5.5 0 0 1 14.5 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  x: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M4.5 4.5 19.5 19.5M19.5 4.5 4.5 19.5" strokeLinecap="round" />
    </svg>
  ),
  tiktok: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M14 4v10.2a3.7 3.7 0 1 1-3.7-3.7M14 4c.3 2.4 1.9 4 4.5 4.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  about: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
    </svg>
  ),
  contact: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  privacy: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
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
  { key: "table", href: "/tabela" },
  { key: "league", href: "/liga" },
  { key: "stats", href: "/statistike" },
  { key: "rules", href: "/pravila" },
  { key: "settings", href: "/podesavanja" },
];

/** Nazivi mreža su imena, ne prevode se. */
const SOCIAL_NAMES: Record<SocialKey, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  tiktok: "TikTok",
};

/** Dodatni odeljci — samo u bočnom meniju (traka sa tabovima je već puna). */
const EXTRA_SECTIONS: { title: "sectionFootball" | "sectionInfo"; links: { key: NavKey; href: string }[] }[] = [
  {
    title: "sectionFootball",
    links: [
      { key: "clubs", href: "/klubovi" },
      { key: "players", href: "/igraci" },
    ],
  },
  {
    title: "sectionInfo",
    links: [
      { key: "about", href: "/o-nama" },
      { key: "contact", href: "/kontakt" },
      { key: "privacy", href: "/privatnost" },
    ],
  },
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
  const m0Ref = useRef<HTMLElement>(null); // skrivena kopija trake, korak 0 (ikonice)
  const m1Ref = useRef<HTMLElement>(null); // skrivena kopija trake, korak 1 (samo tekst)
  const [barW, setBarW] = useState(0);
  const [w0, setW0] = useState(0);
  const [w1, setW1] = useState(0);
  // Povećava se kad se učita pravi font — tada se tabovi ponovo mere.
  const [fontTick, setFontTick] = useState(0);

  // Mere se stvarne širine OBE varijante trake (skrivene kopije) i širina
  // slobodnog prostora; korak se onda samo izračuna, bez „pokušaja i greške”.
  useLayoutEffect(() => {
    const m0 = m0Ref.current;
    const m1 = m1Ref.current;
    const bar = barRef.current;
    if (m0) setW0(m0.offsetWidth);
    if (m1) setW1(m1.offsetWidth);
    if (bar) setBarW(bar.clientWidth);
  }, [locale, isAdmin, fontTick]);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const ro = new ResizeObserver(() => {
      // Kopije su sakrivene (display: none) ispod 1024px, pa se tamo mere tek
      // kad traka postane vidljiva — zato se i one ponovo mere ovde.
      setBarW(bar.clientWidth);
      if (m0Ref.current) setW0(m0Ref.current.offsetWidth);
      if (m1Ref.current) setW1(m1Ref.current.offsetWidth);
    });
    ro.observe(bar);
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => setFontTick((n) => n + 1)).catch(() => {});
    }
    return () => ro.disconnect();
  }, []);

  // 24px rezerve: traka ne sme da dodiruje susedne elemente.
  const level = barW === 0 ? 1 : w0 + 24 <= barW ? 0 : w1 + 24 <= barW ? 1 : 2;

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

  /** Traka sa tabovima u datom koraku (0 — ikonice, 1 — samo tekst). `measure` pravi nefokusiranu kopiju za merenje. */
  const renderTabs = (lvl: 0 | 1 | 2, measure: boolean, ref?: React.Ref<HTMLElement>) => (
    <nav ref={ref} className="inline-flex shrink-0 gap-0.5 steel-frame p-1 rounded-xl whitespace-nowrap">
      {items.map(({ key, href }) => {
        const active = !measure && isActive(href);
        const Icon = ICONS[key];
        const cls = `flex items-center gap-1.5 text-sm font-semibold ${
          lvl === 0 ? (locale === "el" ? "px-2.5" : "px-3") : "px-3"
        } py-2 rounded-md whitespace-nowrap transition-colors ${
          active
            ? "bg-navy-950 text-chalk-50 ring-1 ring-navy-600"
            : key === "admin"
              ? "text-gold-300 hover:text-gold-400"
              : "text-slate-300 hover:text-chalk-50"
        }`;
        const inner = (
          <>
            {lvl === 0 && (
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  active || key === "admin" ? "text-gold-300" : "text-slate-400"
                }`}
              />
            )}
            {t(key)}
          </>
        );
        return measure ? (
          <span key={href} className={cls}>
            {inner}
          </span>
        ) : (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cls}>
            {inner}
          </Link>
        );
      })}
    </nav>
  );

  /** Samo mreže sa upisanim URL-om. */
  const socials = (Object.entries(SOCIAL_LINKS) as [SocialKey, string][]).filter(([, url]) => url);

  /** Stavka u bočnom meniju (isti izgled za glavne i dodatne stranice). */
  const drawerLink = ({ key, href }: { key: NavKey; href: string }) => {
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
        <Icon className={`w-5 h-5 shrink-0 ${active || key === "admin" ? "text-gold-300" : "text-slate-400"}`} />
        {t(key)}
        {active && <span aria-hidden className="ml-auto w-1.5 h-1.5 rounded-full bg-gold-300" />}
      </Link>
    );
  };

  return (
    <>
      {/* Hamburger pored logoa (kao u FPL-u) — na svim širinama; otvara bočni
          meni sa istim stavkama kao traka sa tabovima. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("openMenu")}
        aria-expanded={open}
        className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 grid place-items-center rounded-lg steel-frame text-slate-300 hover:text-chalk-50 transition-colors"
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
          (videti `level` iznad); inače ostaje samo hamburger. */}
      <div
        ref={barRef}
        className={`order-2 hidden lg:flex flex-1 min-w-0 justify-center overflow-hidden mx-3 xl:mx-5 ${
          level < 2 ? "" : "invisible"
        }`}
      >
        {renderTabs(level, false)}
      </div>

      {/* Skrivene kopije trake, samo za merenje širine (nikad se ne vide). */}
      <div aria-hidden className="hidden lg:block fixed -left-[9999px] top-0 invisible pointer-events-none">
        {renderTabs(0, true, m0Ref)}
        {renderTabs(1, true, m1Ref)}
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
              <img src="/logo.png" alt="Fudaristo" className="w-10 h-10 rounded-full" />
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
              <DrawerHeading>{t("sectionGame")}</DrawerHeading>
              {items.map((l) => drawerLink(l))}
              {EXTRA_SECTIONS.map((sec) => (
                <div key={sec.title}>
                  {/* Društvene mreže idu pre „Info”; prikazuju se samo ako je bar jedna podešena. */}
                  {sec.title === "sectionInfo" && socials.length > 0 && (
                    <div>
                      <DrawerHeading>{t("sectionMedia")}</DrawerHeading>
                      {socials.map(([key, url]) => {
                        const Icon = ICONS[key];
                        return (
                          <a
                            key={key}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 px-3 py-3 rounded-lg font-semibold text-slate-300 hover:bg-navy-800 hover:text-chalk-50 transition-colors"
                          >
                            <Icon className="w-5 h-5 shrink-0 text-slate-400" />
                            {SOCIAL_NAMES[key]}
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="w-3.5 h-3.5 ml-auto text-slate-500"
                              aria-hidden
                            >
                              <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </a>
                        );
                      })}
                    </div>
                  )}
                  <DrawerHeading>{t(sec.title)}</DrawerHeading>
                  {sec.links.map((l) => drawerLink(l))}
                </div>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

/** Mali naslov grupe u bočnom meniju. */
function DrawerHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 first:pt-1">
      {children}
    </p>
  );
}
