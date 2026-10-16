/**
 * Parser za SofaScore-ov lineups odgovor (.../api/v1/event/{id}/lineups) —
 * jedini izvor prave ocene igrača po meču koji smo našli (ESPN je proveren
 * ručno na stvarnom meču Super lige Grčke i NEMA ocene za ovu ligu).
 *
 * ⚠️ SofaScore-ov API vraća 403 kad ga zove Vercel (potvrđeno probom pre
 * ove funkcije) — verovatno isto ograničenje na data-centar IP adrese kao kod
 * drugih skrejp-meta. Zato admin NE zove SofaScore sa servera: sam otvori
 * meč na sofascore.com u browseru (DevTools → Network → .../lineups →
 * Response), i nalepi taj JSON tekst ovde. Ova funkcija samo PARSIRA već
 * dobijen tekst — nikakav fetch ka SofaScore-u.
 *
 * Ocena postoji SAMO za igrače koji su stvarno odigrali minut (statistics
 * ima "rating"); neiskorišćene rezerve imaju statistics skoro prazan
 * ({totalShots:0,...}, bez "rating") — to je čist signal "nije igrao", ne
 * greška u parsiranju.
 */

import type { Position } from "./fantasy-rules";

const SOFASCORE_POSITION: Record<string, Position> = {
  G: "GK",
  D: "DEF",
  M: "MID",
  F: "FWD",
};

export type SofascorePlayerRating = {
  /** Puno ime kako ga SofaScore piše — npr. "Niv Eliasi". Osnova za uparivanje. */
  name: string;
  shortName: string;
  /** Njegova OPŠTA pozicija (player.position) — ne taktička pozicija u ovom meču. */
  position: Position;
  isHome: boolean;
  /** Bio je u prvih 11 (false) ili je krenuo sa klupe (true). */
  substitute: boolean;
  captain: boolean;
  /** null = nije odigrao nijedan minut (SofaScore nema ocenu za njega). */
  rating: number | null;
  minutesPlayed: number | null;
  /** Golovi / asistencije / autogolovi iz statistics (0 kad polje ne postoji). */
  goals: number;
  assists: number;
  ownGoals: number;
};

export type SofascoreLineupsResult = {
  confirmed: boolean;
  players: SofascorePlayerRating[];
  warnings: string[];
};

/** Nenegativan ceo broj ili 0 — polje koje ne postoji znači "nije bilo". */
function count(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

type SofascoreRosterPlayer = {
  player?: { name?: string; shortName?: string; position?: string };
  position?: string;
  substitute?: boolean;
  captain?: boolean;
  statistics?: {
    rating?: number;
    minutesPlayed?: number;
    goals?: number;
    goalAssist?: number;
    assists?: number;
    ownGoals?: number;
  };
};

type SofascoreSide = { players?: SofascoreRosterPlayer[] };

/**
 * `jsonText` je TAČNO ono što admin nalepi (ceo Response body sa DevTools-a).
 * Ne baca grešku na loš JSON — vraća prazan rezultat sa upozorenjem, isto kao
 * espn-parser.ts, da admin panel može da prikaže poruku umesto da puca.
 */
export function parseSofascoreLineups(jsonText: string): SofascoreLineupsResult {
  let json: any;
  try {
    json = JSON.parse(jsonText);
  } catch {
    return { confirmed: false, players: [], warnings: ["Ovo nije validan JSON — proveri da li je ceo tekst kopiran."] };
  }
  return parseSofascoreLineupsObject(json);
}

/**
 * Isto kao parseSofascoreLineups, ali nad već parsiranim objektom — koristi
 * bulk-unos (browser-konzola skripta skine JEDAN fajl sa više mečeva, svaki
 * meč nosi svoj "lineups" kao ugnježden objekat, ne kao zaseban JSON tekst).
 */
export function parseSofascoreLineupsObject(json: any): SofascoreLineupsResult {
  const warnings: string[] = [];

  const confirmed = Boolean(json?.confirmed);
  if (!confirmed) {
    warnings.push("SofaScore ovaj meč označava kao 'nepotvrđen' — ocene mogu još da se promene.");
  }

  const sides: [string, SofascoreSide | undefined, boolean][] = [
    ["home", json?.home, true],
    ["away", json?.away, false],
  ];

  const players: SofascorePlayerRating[] = [];
  for (const [label, side, isHome] of sides) {
    if (!side?.players || side.players.length === 0) {
      warnings.push(`Nema sastava za ${label === "home" ? "domaćina" : "gosta"} u ovom JSON-u.`);
      continue;
    }
    for (const p of side.players) {
      const name = p.player?.name;
      if (!name) continue; // podržavajuće osoblje bez "player" objekta, npr. supportStaff
      const posLetter = p.player?.position ?? p.position ?? "";
      players.push({
        name,
        shortName: p.player?.shortName ?? name,
        position: SOFASCORE_POSITION[posLetter] ?? "MID",
        isHome,
        substitute: Boolean(p.substitute),
        captain: Boolean(p.captain),
        rating: typeof p.statistics?.rating === "number" ? p.statistics.rating : null,
        minutesPlayed: typeof p.statistics?.minutesPlayed === "number" ? p.statistics.minutesPlayed : null,
        goals: count(p.statistics?.goals),
        assists: count(p.statistics?.goalAssist ?? p.statistics?.assists),
        ownGoals: count(p.statistics?.ownGoals),
      });
    }
  }

  if (players.length === 0) {
    warnings.push("Nijedan igrač nije pročitan iz ovog JSON-a — proveri da li si nalepio tačan odgovor.");
  }

  return { confirmed, players, warnings };
}

// ----------------------------------------------------------------------------
// Incidents — golovi, asistencije i autogolovi. Odgovor sa sastavima
// (lineups) NE nosi ih (u fajlu ostaju samo ocena i minuti), pa se čitaju iz
// .../event/{id}/incidents, koji za svaki gol navodi strelca i asistenta.
// ----------------------------------------------------------------------------

export type SofascoreEvent = {
  kind: "goal" | "assist" | "ownGoal";
  name: string;
  /** isHome iz samog incidenta (strana na koju gol ide, ne nužno strana igrača kod autogola). */
  incidentHome: boolean;
};

/**
 * `incidents` je niz iz odgovora (ili već sužen na golove skriptom). Čitaju se
 * samo incidenti tipa "goal": običan gol i penal daju gol (+ asistenciju kad
 * postoji), "ownGoal" daje autogol. Sve ostalo (kartoni, izmene, VAR) se
 * preskače. Ako za kraj podaci nisu u očekivanom obliku, vraća prazan niz —
 * pozivalac to proverava poređenjem sa rezultatom meča.
 */
export function parseSofascoreIncidents(incidents: unknown): SofascoreEvent[] {
  if (!Array.isArray(incidents)) return [];
  const out: SofascoreEvent[] = [];
  for (const inc of incidents as any[]) {
    if (inc?.incidentType !== "goal") continue;
    const name: unknown = inc?.player?.name ?? inc?.playerName;
    if (typeof name !== "string" || !name) continue;
    const incidentHome = Boolean(inc?.isHome);
    if (inc?.incidentClass === "ownGoal") {
      out.push({ kind: "ownGoal", name, incidentHome });
      continue;
    }
    out.push({ kind: "goal", name, incidentHome });
    const assist: unknown = inc?.assist1?.name ?? inc?.assist1Name;
    if (typeof assist === "string" && assist) out.push({ kind: "assist", name: assist, incidentHome });
  }
  return out;
}
