/**
 * Deljena logika za TheSportsDB integraciju — koriste je i
 * scripts/import-fixtures-thesportsdb.ts (ručno pokretanje) i
 * lib/ingestion.ts (cron/admin automatski ingestion), da se pravilo
 * uparivanja klubova ne duplira na dva mesta.
 */

export const THESPORTSDB_LEAGUE_ID = "4336"; // Greek Super League 1 — potvrđeno u Fazi 4
export const THESPORTSDB_SEASON = "2026-2027"; // potvrđeno u Fazi 4

export function thesportsdbBase(apiKey?: string) {
  const key = apiKey || process.env.THESPORTSDB_API_KEY || "123"; // "123" = javni free test ključ
  return `https://www.thesportsdb.com/api/v1/json/${key}`;
}

// Poznata odstupanja u imenima između TheSportsDB i naše baze (Faza 1 ručni seed).
export const THESPORTSDB_CLUB_ALIASES: Record<string, string> = {
  "Iraklis 1908": "Iraklis",
};

export type ClubRow = { id: string; name: string };

/**
 * Nađi naš club.id za ime kluba kako ga TheSportsDB piše. Prvo tačno
 * poklapanje (uz poznate alias-e), pa fuzzy fallback (jedno ime sadrži
 * drugo) za sitne razlike kao "AEK Athens FC" vs "AEK Athens".
 */
export function resolveClubId(clubs: ClubRow[], apiName: string): string | undefined {
  const normalized = THESPORTSDB_CLUB_ALIASES[apiName] ?? apiName;
  const exact = clubs.find((c) => c.name === normalized);
  if (exact) return exact.id;
  const fuzzy = clubs.find((c) => c.name.includes(normalized) || normalized.includes(c.name));
  return fuzzy?.id;
}

export type TheSportsDbEvent = {
  idEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  strTimestamp: string | null;
  dateEvent: string;
  strTime: string | null;
  intRound: string | null;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string | null;
  strPostponed: string | null;
};

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
