/**
 * Javna adresa sajta za apsolutne linkove u pregledima (Open Graph) — društvene
 * mreže traže pun URL. Redosled: NEXT_PUBLIC_SITE_URL (kad stigne domen),
 * pa Vercel produkcijska adresa, pa poznata adresa.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "https://fudaristo.vercel.app";
}
