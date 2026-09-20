/**
 * Prepoznavanje greške „Server Action nije nađena".
 *
 * ŠTA SE DESILO: stranica je učitana iz jednog deploya, a Server Action je
 * pozvana posle novog. Next pri svakom buildu računa nove, nepogodive ID-jeve
 * akcija (to je bezbednosna mera), pa stari ID na novom serveru ne postoji.
 *
 * ZAŠTO NE VERCEL SKEW PROTECTION: ta funkcija je na Pro i Enterprise
 * planovima. Na Hobby planu jedino rešenje je da klijent prepozna situaciju i
 * ponovo učita stranicu.
 *
 * ZAŠTO NIJE DOVOLJNO OSLONITI SE NA ERROR BOUNDARY: Next ovu grešku ne
 * prosleđuje pouzdano granici greške (vercel/next.js#75541) — u klijentskim
 * komponentama stigne kao obična greška iz `await akcija()`. Zato je hvatamo
 * tamo gde akcije zovemo.
 */

const MARKERS = [
  "was not found on the server",
  "failed to find server action",
  "server action",
];

export function isStaleDeploymentError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  // Traži se i "not found", da obična greška iz akcije ne bude proglašena
  // zastarelim deployem samo zato što reč "action" postoji u tekstu.
  return (
    MARKERS.some((m) => lower.includes(m)) &&
    (lower.includes("not found") || lower.includes("failed to find"))
  );
}

export const STALE_DEPLOYMENT_MESSAGE =
  "Objavljena je nova verzija aplikacije dok je ova stranica bila otvorena. Osveži stranicu i pokušaj ponovo — ništa nije upisano.";
