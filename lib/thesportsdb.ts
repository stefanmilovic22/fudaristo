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

const POSTPONED_STATUSES = new Set(["PPD", "POST", "POSTP", "POSTPONED"]);
const NOT_PLAYING_STATUSES = new Set(["", "NS", "NOT STARTED", "TBD", "CANC", "CANCELLED", "CANCELED", "ABD", "ABANDONED"]);
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "MATCH FINISHED"]);

/**
 * Status meča iz TheSportsDB događaja.
 *
 * Zašto ne samo `strPostponed`: za odložene mečeve izvor često ostavi
 * strPostponed="no", a u strStatus upiše "PPD". Ranije je svaki status osim
 * NS/FT tumačen kao "live", pa je odložen meč (npr. Atromitos – AEK) u
 * rasporedu stajao kao "uživo".
 */
export function eventStatus(
  ev: Pick<TheSportsDbEvent, "strStatus" | "strPostponed">,
  hasScore: boolean
): "scheduled" | "live" | "finished" | "postponed" {
  const st = (ev.strStatus ?? "").trim().toUpperCase();
  if (ev.strPostponed === "yes" || POSTPONED_STATUSES.has(st)) return "postponed";
  if (FINISHED_STATUSES.has(st)) return hasScore ? "finished" : "live";
  if (NOT_PLAYING_STATUSES.has(st)) return "scheduled";
  return "live";
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
