"use client";

import { useState, type ComponentProps } from "react";
import { Link as BaseLink } from "./base-navigation";

/**
 * Link koji počinje da učitava ciljnu stranicu tek kad pređeš mišem preko
 * njega, fokusiraš ga ili ga dodirneš. Do klika (obično 100–300 ms kasnije) je
 * veći deo posla gotov, pa se stranica otvara skoro odmah. Ne učitava ništa
 * unapred za linkove koje niko ne dodirne — stranice su dinamičke i svako
 * učitavanje košta (zato nema učitavanja svih linkova na ekranu).
 *
 * Izričito zadat `prefetch` ima prednost (strelice kola već traže pun prefetch).
 */
export function Link({ prefetch, onMouseEnter, onFocus, onTouchStart, ...rest }: ComponentProps<typeof BaseLink>) {
  const [intent, setIntent] = useState(false);
  const href = typeof rest.href === "string" ? rest.href : "";
  // /auth/* i /api/* rute imaju sporedne efekte (potvrda mejla, odjava...) — nikad unapred.
  const never = href.startsWith("/auth") || href.startsWith("/api");
  const mode = never ? false : prefetch !== undefined ? prefetch : intent;

  return (
    <BaseLink
      {...rest}
      prefetch={mode}
      onMouseEnter={(e) => {
        setIntent(true);
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        setIntent(true);
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        setIntent(true);
        onTouchStart?.(e);
      }}
    />
  );
}
