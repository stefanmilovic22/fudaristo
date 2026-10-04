"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { readableInk } from "@/lib/color";
import { createClient } from "@/lib/supabase/client";
import { navigateAfterAuth, resolveAuthRedirect } from "@/lib/auth-redirect";

/**
 * Profil-meni: klik na inicijale tima otvara prozorčić sa „Moja podešavanja”
 * i „Odjava”. Zatvara se klikom izvan, tasterom Escape i izborom stavke.
 */
export function UserMenu({
  teamName,
  teamColor,
}: {
  teamName: string;
  teamColor: string;
}) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

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

  async function handleLogout() {
    await supabase.auth.signOut();
    // Puna navigacija iz istog razloga kao kod prijave: server mora da iscrta
    // stranicu BEZ sesije, a klijentski keš rutera bi i dalje držao staru.
    navigateAfterAuth(resolveAuthRedirect(null, locale, "/login"));
  }

  return (
    <div className="relative shrink-0" ref={boxRef}>
      <span className="steel-ring block rounded-full p-[2px]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={teamName}
          title={teamName}
          className="w-9 h-9 sm:w-[38px] sm:h-[38px] rounded-full flex items-center justify-center font-display font-bold text-sm hover:brightness-110 transition"
          style={{ backgroundColor: teamColor, color: readableInk(teamColor) }}
        >
          {teamName.slice(0, 2).toUpperCase()}
        </button>
      </span>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 z-40 w-56 bg-navy-800 border border-navy-600 rounded-lg overflow-hidden shadow-lg shadow-black/40"
        >
          <div className="px-3 py-2.5 border-b border-navy-700 text-sm font-semibold truncate">
            {teamName}
          </div>
          <Link
            href="/podesavanja"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-300 hover:bg-navy-700 hover:text-chalk-50 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-400">
              <circle cx="12" cy="12" r="3" />
              <path
                d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
                strokeLinecap="round"
              />
            </svg>
            {t("mySettings")}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left text-slate-300 hover:bg-navy-700 hover:text-chalk-50 border-t border-navy-700 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-400">
              <path
                d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t("logout")}
          </button>
        </div>
      )}
    </div>
  );
}
