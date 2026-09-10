"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, LOCALE_META, type Locale } from "@/i18n/routing";

/**
 * Birač jezika sa zastavicama.
 *
 * Zastavice su emodži, ne slike: nema mrežnog zahteva, nema odloženog
 * iscrtavanja i skaliraju se sa fontom. Zastavica nikad ne stoji sama — uvek
 * je uz naziv jezika ili uz kod, jer zastava označava državu, a ne jezik
 * (srpski se govori i van Srbije, engleski daleko van Britanije).
 *
 * `usePathname` iz @/i18n/navigation vraća putanju BEZ prefiksa jezika, pa
 * `replace` na istu putanju sa drugim `locale` menja jezik i ostaje na istoj
 * stranici.
 */
export function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  // Zatvaranje klikom izvan i tasterom Escape — bez ovoga meni ostaje otvoren
  // na dodirnim uređajima, gde nema "klika pored".
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function switchTo(next: Locale) {
    setOpen(false);
    if (next === locale) return;
    startTransition(() => {
      // usePathname iz @/i18n/navigation vraća putanju bez prefiksa jezika,
      // ali SA popunjenim dinamičkim segmentima (/tim/abc123), pa se prosleđuje
      // kao običan string — korisnik ostaje na istoj stranici.
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={LOCALE_META[locale].label}
        className="flex items-center gap-1.5 bg-navy-800 border border-navy-600 rounded-lg px-2.5 py-2 text-sm hover:border-slate-500 transition-colors disabled:opacity-50"
      >
        <span aria-hidden className="text-base leading-none">
          {LOCALE_META[locale].flag}
        </span>
        <span className="font-semibold uppercase text-xs tracking-wide text-slate-300">
          {locale}
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full mt-1 z-30 min-w-[150px] bg-navy-800 border border-navy-600 rounded-lg overflow-hidden shadow-lg shadow-black/40"
        >
          {routing.locales.map((code) => {
            const meta = LOCALE_META[code];
            const active = code === locale;
            return (
              <li key={code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => switchTo(code)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                    active
                      ? "bg-navy-700 text-gold-300 font-semibold"
                      : "text-slate-300 hover:bg-navy-700 hover:text-chalk-50"
                  }`}
                >
                  <span aria-hidden className="text-base leading-none">
                    {meta.flag}
                  </span>
                  {meta.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
