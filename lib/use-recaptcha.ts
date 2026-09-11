"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * reCAPTCHA v3 — nevidljiva provera, bez kvadratića i bez slika semafora.
 *
 * v3 umesto v2 zato što registraciju ne prekida ničim: Google vraća ocenu
 * 0.0–1.0 i server odlučuje. Cena je što nema sigurnog „ovo je čovek" — zato
 * prag na serveru namerno nije strog (videti actions.ts).
 *
 * Ako `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` nije podešen, hook se ponaša kao da
 * reCAPTCHA ne postoji i vraća null token. Server tada takođe preskače proveru
 * (obe strane gledaju isto podešavanje), pa lokalni razvoj i postojeći deploy
 * rade i pre nego što se ključevi dodaju. Čim se dodaju, provera se uključuje
 * sama, bez izmene koda.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
const SCRIPT_ID = "recaptcha-v3";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

export function useRecaptcha() {
  const [ready, setReady] = useState(false);
  const loading = useRef(false);

  useEffect(() => {
    if (!SITE_KEY || loading.current) return;
    loading.current = true;

    // Skripta se učitava jednom po stranici; ako je već tu (npr. posle
    // klijentske navigacije), samo sačekaj da bude spremna.
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      window.grecaptcha?.ready(() => setReady(true));
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
    script.async = true;
    script.onload = () => window.grecaptcha?.ready(() => setReady(true));
    script.onerror = () => {
      // Blokiran skript (adblock, mreža) ne sme da zaključa registraciju —
      // server i dalje odlučuje šta da radi sa praznim tokenom.
      console.warn("[recaptcha] skripta nije učitana");
    };
    document.head.appendChild(script);
  }, []);

  const execute = useCallback(async (action: string): Promise<string | null> => {
    if (!SITE_KEY || !ready || !window.grecaptcha) return null;
    try {
      return await window.grecaptcha.execute(SITE_KEY, { action });
    } catch {
      return null;
    }
  }, [ready]);

  // `enabled` trenutno nema pozivaoca — značka koju Google sam prikazuje
  // pokriva pravni uslov, pa forma nema šta da uslovljava. Ostaje u API-ju
  // jer je prirodan podatak za svakog budućeg pozivaoca.
  return { execute, enabled: Boolean(SITE_KEY) };
}
