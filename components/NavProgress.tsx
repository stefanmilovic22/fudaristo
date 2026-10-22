"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Tanka traka na vrhu ekrana dok se otvara druga stranica.
 *
 * Umesto skeleta: stara stranica ostaje na ekranu dok nova ne bude gotova pa se
 * zameni odjednom (nema „praznih" međustanja), a ovo daje povratnu informaciju
 * da je klik primljen. Traka se pojavljuje tek posle 150 ms — brza otvaranja
 * ne prikazuju ništa. Završava se kad se promeni adresa.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const failSafe = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);

  function clearTimers() {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (tick.current) clearInterval(tick.current);
    if (failSafe.current) clearTimeout(failSafe.current);
    showTimer.current = tick.current = failSafe.current = null;
  }

  function finish() {
    if (!active.current) return;
    active.current = false;
    clearTimers();
    setWidth(100);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 250);
  }

  function start() {
    if (active.current) return;
    active.current = true;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    showTimer.current = setTimeout(() => {
      setVisible(true);
      setWidth(12);
      tick.current = setInterval(() => setWidth((w) => w + (90 - w) * 0.08), 200);
    }, 150);
    // Ako se adresa nikad ne promeni (npr. greška na mreži), traka ne ostaje večno.
    failSafe.current = setTimeout(finish, 20_000);
  }

  // Nova adresa stigla → gotovo.
  useEffect(() => {
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.href) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname.startsWith("/api") || url.pathname.startsWith("/auth")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", start);
      clearTimers();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[300] h-[3px] pointer-events-none transition-opacity duration-200"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        className="h-full bg-gold-400 shadow-[0_0_8px_rgba(90,180,255,0.7)] transition-[width] duration-200 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
