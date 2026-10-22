import { computeLeagueTable, type TableClub, type TableFixture } from "./league-table";

/**
 * Težina narednog meča (FDR, 1 = lako … 5 = teško), po mestu PROTIVNIKA u
 * tabeli: tabela se podeli na pet jednakih grupa, gornja daje 5, donja 1.
 * Domaći teren / gost namerno ne utiče, da bi boja bila lako objašnjiva.
 *
 * Dok neki klub ima manje od MIN_PLAYED odigranih mečeva, tabela još ne
 * govori ništa — svi su srednji (3), da rano u sezoni ne bi bilo nasumičnih boja.
 */
export const MIN_PLAYED = 2;
export const NEUTRAL_DIFFICULTY = 3;

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export function computeDifficulty(clubs: TableClub[], fixtures: TableFixture[]): Map<string, Difficulty> {
  const table = computeLeagueTable(clubs, fixtures);
  const n = table.length;
  const out = new Map<string, Difficulty>();
  const early = n === 0 || table.some((r) => r.played < MIN_PLAYED);
  for (const row of table) {
    const d = early ? NEUTRAL_DIFFICULTY : 5 - Math.floor(((row.rank - 1) * 5) / n);
    out.set(row.clubId, Math.min(5, Math.max(1, d)) as Difficulty);
  }
  return out;
}
