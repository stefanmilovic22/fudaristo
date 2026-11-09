/**
 * Država igrača za prikaz: oznaka, zastava i naziv. Namerno lagan modul (bez
 * baze i bez parsera), da ga mogu da uvuku i klijentske komponente.
 */
import { intlTag } from "@/lib/intl-locale";

/** SofaScore za delove Ujedinjenog Kraljevstva koristi sopstvene oznake (EN, SC…). */
const SUBDIVISION_FLAG: Record<string, string> = { EN: "gb-eng", SC: "gb-sct", WA: "gb-wls", NI: "gb-nir" };

const SUBDIVISION_NAME: Record<string, Record<"sr" | "en" | "el", string>> = {
  EN: { sr: "Engleska", en: "England", el: "Αγγλία" },
  SC: { sr: "Škotska", en: "Scotland", el: "Σκωτία" },
  WA: { sr: "Vels", en: "Wales", el: "Ουαλία" },
  NI: { sr: "Severna Irska", en: "Northern Ireland", el: "Βόρεια Ιρλανδία" },
};

/** "gr", " GR " → "GR"; sve što nije dva slova → null. */
export function normalizeCountryCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = v.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

/** Adresa zastave (flagcdn). Širina 20 ili 40 px; za retina ekrane koristi se dvostruka. */
export function flagUrl(code: string, width: 20 | 40 | 80 = 20): string {
  const c = normalizeCountryCode(code);
  if (!c) return "";
  return `https://flagcdn.com/w${width}/${(SUBDIVISION_FLAG[c] ?? c.toLowerCase())}.png`;
}

/** Naziv države na jeziku sajta (Intl.DisplayNames — bez ručnog prevoda). */
export function countryName(code: string, locale: string): string {
  const c = normalizeCountryCode(code);
  if (!c) return "";
  const lang = (locale === "sr" || locale === "el" ? locale : "en") as "sr" | "en" | "el";
  if (SUBDIVISION_NAME[c]) return SUBDIVISION_NAME[c][lang];
  try {
    return new Intl.DisplayNames([intlTag(locale)], { type: "region" }).of(c) ?? c;
  } catch {
    return c;
  }
}

