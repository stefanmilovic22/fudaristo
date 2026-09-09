/**
 * Zajednički parseri za spoljne API-je i CSV unos.
 *
 * Razlog postojanja: TheSportsDB za neodigrane mečeve ne vraća uvek `null` —
 * ume da vrati prazan string, nulu kao string, ili polje uopšte ne postoji.
 * Raniji izraz `ev.intHomeScore !== null ? Number(ev.intHomeScore) : null` je
 * zato umeo da upiše 0:0 na neodigran meč (Number("") === 0) ili NaN
 * (Number(undefined)), što bi scoring engine u Fazi 6 uzeo zdravo za gotovo.
 */

/** Rezultat iz API odgovora — `null` za sve što nije stvaran broj. */
export function parseScore(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Vreme iz CSV-a ili API-ja u ISO string.
 *
 * Prihvata "2026-09-12 15:00", "2026-09-12T15:00:00", sa ili bez "Z"/offseta.
 * Ako oznaka zone nedostaje, tumači se kao UTC (tako je i dokumentovano u
 * scripts/fixtures-template.csv). Raniji `new Date(x + "Z")` je pucao čim bi
 * neko u CSV upisao vreme koje već ima "Z" ili "+02:00".
 */
export function parseUtcTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (raw === "") return null;

  const hasZone = /(?:Z|z|[+-]\d{2}:?\d{2})$/.test(raw);
  const normalized = raw.replace(" ", "T");
  const candidate = hasZone ? normalized : `${normalized}Z`;

  const d = new Date(candidate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
