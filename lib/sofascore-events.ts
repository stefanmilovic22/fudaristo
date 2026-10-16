/**
 * Poređenje golova / asistencija / autogolova iz SofaScore-ovog sastava sa
 * onim što je upisano kod nas. Čista funkcija (bez baze), da se može proveriti
 * bez pokretanja sajta.
 *
 * Bezbednosne provere — SofaScore je izvor, ali se ne upisuje naslepo:
 *  - golovi/autogolovi se predlažu SAMO ako njihov zbir odgovara rezultatu meča
 *    u našoj bazi (domaći = golovi domaćih + autogolovi gostiju i obrnuto);
 *    inače se meč preskače sa objašnjenjem;
 *  - asistencije se predlažu samo za mečeve sa potvrđenim golovima i samo ako
 *    ih SofaScore uopšte navodi (ukupno > 0); inače polje verovatno nije
 *    prepoznato, pa se naše vrednosti ne diraju.
 */
import type { SofascoreEvent, SofascorePlayerRating } from "./sofascore-parser";

export type EventCounts = { goals: number; assists: number; ownGoals: number };

export type OurStatRow = { playerId: string; goals: number; assists: number; ownGoals: number };
export type SquadPlayer = { id: string; name: string; clubId: string };

export type EventDiffRow = {
  /** Ime kod SofaScore-a; null kad igrača SofaScore uopšte ne navodi (naš višak). */
  sofaName: string | null;
  /** Naš igrač (predlog po imenu); null = admin bira ručno. */
  playerId: string | null;
  /** Upareno tačnim imenom (true) ili samo po prezimenu (false — admin treba da proveri). */
  exact: boolean;
  current: EventCounts;
  sofa: EventCounts;
  /** Koja polja se stvarno menjaju (neka su isključena bezbednosnim proverama). */
  change: { goals: boolean; assists: boolean; ownGoals: boolean };
};

export type EventDiffResult = {
  scoreOk: boolean;
  /** "SofaScore 4:0 · rezultat 4:0" */
  scoreText: string;
  assistsUsable: boolean;
  warnings: string[];
  rows: EventDiffRow[];
};

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Isto pravilo kao kod ocena (prezime sadržano u imenu), uz prednost tačnom imenu. */
export function findPlayer(sofaName: string, candidates: SquadPlayer[]): { player: SquadPlayer; exact: boolean } | null {
  const n = norm(sofaName);
  const exact = candidates.find((c) => norm(c.name) === n);
  if (exact) return { player: exact, exact: true };
  const byLast = candidates.filter((c) => {
    const last = norm(c.name.split(" ").slice(-1)[0]);
    return last.length > 0 && (n.includes(last) || last.includes(n));
  });
  return byLast[0] ? { player: byLast[0], exact: false } : null;
}

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const hasEvents = (c: EventCounts) => c.goals > 0 || c.assists > 0 || c.ownGoals > 0;

export function diffMatchEvents(input: {
  sofaPlayers: SofascorePlayerRating[];
  fixture: { homeClubId: string; awayClubId: string; homeScore: number | null; awayScore: number | null };
  squad: SquadPlayer[];
  ours: OurStatRow[];
}): EventDiffResult {
  const { sofaPlayers, fixture, squad, ours } = input;
  const warnings: string[] = [];

  // --- Provera golova naspram rezultata ---------------------------------
  const homeSofa = sofaPlayers.filter((p) => p.isHome);
  const awaySofa = sofaPlayers.filter((p) => !p.isHome);
  const sofaHome = sum(homeSofa, (p) => p.goals) + sum(awaySofa, (p) => p.ownGoals);
  const sofaAway = sum(awaySofa, (p) => p.goals) + sum(homeSofa, (p) => p.ownGoals);
  const haveScore = fixture.homeScore !== null && fixture.awayScore !== null;
  const scoreOk = haveScore && sofaHome === fixture.homeScore && sofaAway === fixture.awayScore;
  const scoreText = `SofaScore ${sofaHome}:${sofaAway} · ${haveScore ? `rezultat ${fixture.homeScore}:${fixture.awayScore}` : "rezultat nije upisan"}`;
  if (!scoreOk) {
    warnings.push(
      haveScore
        ? "Golovi iz SofaScore-a se ne slažu sa rezultatom meča u našoj bazi — ništa se ne predlaže. Proveri rezultat meča, ili da li polje 'goals' postoji u fajlu."
        : "Meč nema upisan rezultat — prvo ga upiši."
    );
  }

  const sofaAssists = sum(sofaPlayers, (p) => p.assists);
  const ourAssists = sum(ours, (o) => o.assists);
  const assistsUsable = sofaAssists > 0 || ourAssists === 0;
  if (!assistsUsable) {
    warnings.push("SofaScore ne navodi nijednu asistenciju za ovaj meč (polje možda nije prepoznato) — asistencije se ne diraju.");
  }

  // --- Pravljenje redova -----------------------------------------------
  const ourById = new Map(ours.map((o) => [o.playerId, o]));
  const rows: EventDiffRow[] = [];
  const covered = new Set<string>();

  for (const sp of sofaPlayers) {
    const sofa: EventCounts = { goals: sp.goals, assists: sp.assists, ownGoals: sp.ownGoals };
    const side = squad.filter((s) => s.clubId === (sp.isHome ? fixture.homeClubId : fixture.awayClubId));
    const found = findPlayer(sp.name, side);
    const match = found?.player ?? null;
    const cur = match ? ourById.get(match.id) : undefined;
    const current: EventCounts = cur
      ? { goals: cur.goals, assists: cur.assists, ownGoals: cur.ownGoals }
      : { goals: 0, assists: 0, ownGoals: 0 };
    if (match) covered.add(match.id);
    // Igrač bez ikakvih događaja sa obe strane nije zanimljiv.
    if (!hasEvents(sofa) && !hasEvents(current)) continue;
    rows.push(makeRow(sp.name, match?.id ?? null, found?.exact ?? false, current, sofa, scoreOk, assistsUsable));
  }

  // Naši igrači sa događajima koje SofaScore ne navodi (npr. gol pripisan pogrešnom igraču).
  for (const o of ours) {
    if (covered.has(o.playerId)) continue;
    const current: EventCounts = { goals: o.goals, assists: o.assists, ownGoals: o.ownGoals };
    if (!hasEvents(current)) continue;
    rows.push(makeRow(null, o.playerId, true, current, { goals: 0, assists: 0, ownGoals: 0 }, scoreOk, assistsUsable));
  }

  return { scoreOk, scoreText, assistsUsable, warnings, rows: rows.filter((r) => r.change.goals || r.change.assists || r.change.ownGoals) };
}

function makeRow(
  sofaName: string | null,
  playerId: string | null,
  exact: boolean,
  current: EventCounts,
  sofa: EventCounts,
  scoreOk: boolean,
  assistsUsable: boolean
): EventDiffRow {
  return {
    sofaName,
    playerId,
    exact,
    current,
    sofa,
    change: {
      goals: scoreOk && current.goals !== sofa.goals,
      ownGoals: scoreOk && current.ownGoals !== sofa.ownGoals,
      // Asistencije se menjaju samo kad su golovi potvrđeni rezultatom i kad ih SofaScore navodi.
      assists: scoreOk && assistsUsable && current.assists !== sofa.assists,
    },
  };
}

/**
 * Pretvara spisak incidenata u oblik koji diffMatchEvents već razume (igrač +
 * brojevi + strana). Strana igrača se određuje iz NAŠIH sastavova (ime igrača
 * u sastavu domaćina ili gosta) — pouzdanije od `isHome` iz incidenta, koji kod
 * autogola ne mora da označava stranu igrača. Kad ime ne nađemo ni u jednom
 * sastavu: za gol/asistenciju važi isHome iz incidenta, a za autogol suprotna strana.
 */
export function eventsToPlayers(
  events: SofascoreEvent[],
  homeSquad: SquadPlayer[],
  awaySquad: SquadPlayer[]
): SofascorePlayerRating[] {
  const byKey = new Map<string, SofascorePlayerRating>();
  for (const ev of events) {
    const inHome = findPlayer(ev.name, homeSquad);
    const inAway = findPlayer(ev.name, awaySquad);
    let isHome: boolean;
    if (inHome && !inAway) isHome = true;
    else if (inAway && !inHome) isHome = false;
    else isHome = ev.kind === "ownGoal" ? !ev.incidentHome : ev.incidentHome;

    const key = `${isHome ? "h" : "a"}:${norm(ev.name)}`;
    let p = byKey.get(key);
    if (!p) {
      p = {
        name: ev.name,
        shortName: ev.name,
        position: "MID",
        isHome,
        substitute: false,
        captain: false,
        rating: null,
        minutesPlayed: null,
        goals: 0,
        assists: 0,
        ownGoals: 0,
      };
      byKey.set(key, p);
    }
    if (ev.kind === "goal") p.goals += 1;
    else if (ev.kind === "assist") p.assists += 1;
    else p.ownGoals += 1;
  }
  return [...byKey.values()];
}
