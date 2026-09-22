/**
 * ⚠️ NAMERNO bez `import "server-only"` (za razliku od worldfootball-fixtures.ts):
 * ovaj fajl deli scripts/find-espn-links.ts (obican tsx/Node, van Next-ovog
 * build pipeline-a) — "server-only" tamo baca grešku već pri importu, jer taj
 * paket radi samo unutar Next-ovog servera. Isti razlog kao lib/maintenance.ts.
 *
 * Nalaženje ESPN linkova za mečeve jednog kola — isti princip kao
 * lib/worldfootball-fixtures.ts (fetchReportIndex/findReportUrl), samo nad
 * ESPN-ovim nedokumentovanim scoreboard API-jem.
 *
 * Za razliku od worldfootball-a, ovde NEMA ručnog mapiranja slugova — ESPN u
 * scoreboard odgovoru vraća puno ime kluba (team.displayName), isto kao u
 * lib/espn-parser.ts, pa se uparuje normalizovanim imenom.
 *
 * Deljeno između admin panela (find-espn-links-button.tsx) i CLI skripte
 * (scripts/find-espn-links.ts) — isti razlog kao lib/maintenance.ts.
 */

const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/gre.1/scoreboard";
const MATCH_PAGE_BASE = "https://www.espn.com/soccer/match/_/gameId";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\bfc\b|\bafc\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function toYyyymmdd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

type EspnEvent = { id: string; home: string; away: string };

async function fetchEspnEventsForDate(yyyymmdd: string): Promise<EspnEvent[]> {
  const res = await fetch(`${SCOREBOARD_URL}?dates=${yyyymmdd}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const json: any = await res.json();
  const events: EspnEvent[] = [];
  for (const ev of json?.events ?? []) {
    const comp = ev?.competitions?.[0];
    const home = comp?.competitors?.find((c: any) => c.homeAway === "home")?.team?.displayName;
    const away = comp?.competitors?.find((c: any) => c.homeAway === "away")?.team?.displayName;
    if (home && away) events.push({ id: String(ev.id), home, away });
  }
  return events;
}

export type EspnFixtureInput = {
  id: string;
  kickoff_at: string;
  homeClubName: string;
  awayClubName: string;
};

export type EspnLinkRow = {
  fixtureId: string;
  label: string;
  url: string | null;
};

export type EspnLinksResult = {
  rows: EspnLinkRow[];
  foundCount: number;
};

/**
 * Za dati spisak mečeva: skupi sve relevantne datume (kickoff ± 1 dan, zbog
 * UTC pomaka oko ponoći), povuci ESPN scoreboard za svaki JEDNOM, pa upari po
 * normalizovanom imenu oba kluba.
 */
export async function findEspnLinksForFixtures(fixtures: EspnFixtureInput[]): Promise<EspnLinksResult> {
  const datesToFetch = new Set<string>();
  for (const f of fixtures) {
    const d = new Date(f.kickoff_at);
    for (const offset of [-1, 0, 1]) {
      const shifted = new Date(d);
      shifted.setUTCDate(shifted.getUTCDate() + offset);
      datesToFetch.add(toYyyymmdd(shifted));
    }
  }

  const allEvents: EspnEvent[] = [];
  for (const d of datesToFetch) {
    allEvents.push(...(await fetchEspnEventsForDate(d)));
  }

  // Ne tačno poklapanje — ESPN ume da ima blago drugačiji pun naziv od našeg
  // (potvrđeno na stvarnom primeru: ESPN piše "Asteras Tripoli", naša baza
  // "Asteras Tripolis"; slično se očekuje i za "OFI"/"OFI Crete",
  // "Kifisia"/"AE Kifisia"). Dovoljno je da jedan naziv sadrži drugi.
  const namesMatch = (a: string, b: string) => a === b || a.includes(b) || b.includes(a);

  // Proverava se i OBRNUT redosled: ESPN i naša baza se povremeno ne slažu ko
  // je domaćin (potvrđeno na primeru: ESPN "Asteras Tripoli at Iraklis" —
  // tj. Asteras je domaćin, Iraklis gost — dok naša baza ima obrnuto). Cilj je
  // naći MEČ, ne ponovo proveravati ko je stvarno igrao kod kuće.
  const rows: EspnLinkRow[] = fixtures.map((f) => {
    const homeN = normalize(f.homeClubName);
    const awayN = normalize(f.awayClubName);
    const hit = allEvents.find(
      (e) =>
        (namesMatch(normalize(e.home), homeN) && namesMatch(normalize(e.away), awayN)) ||
        (namesMatch(normalize(e.home), awayN) && namesMatch(normalize(e.away), homeN))
    );
    return {
      fixtureId: f.id,
      label: `${f.homeClubName} — ${f.awayClubName}`,
      url: hit ? `${MATCH_PAGE_BASE}/${hit.id}` : null,
    };
  });

  return { rows, foundCount: rows.filter((r) => r.url !== null).length };
}
