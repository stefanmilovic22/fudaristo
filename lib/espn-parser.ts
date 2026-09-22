/**
 * Parser za ESPN-ov NEDOKUMENTOVAN ("skriveni") JSON API — alternativa
 * worldfootball.net toku, za slučaj da worldfootball vrati 403 ili da admin
 * radije koristi ESPN.
 *
 * ⚠️ VAŽNO: ovo je nezvaničan endpoint (site.api.espn.com) — ESPN ga ne
 * dokumentuje niti garantuje, može se promeniti ili ugasiti bez najave. Zato
 * je ovo DODATNA opcija pored worldfootball-a, ne zamena.
 *
 * PREDNOST u odnosu na worldfootball tekst: ESPN vraća STRUKTURIRANE podatke
 * po igraču (`rosters[].roster[].stats[]` — golovi, asistencije, kartoni,
 * autogolovi, odbrane...) i tipizovane događaje (`keyEvents[]` — gol/izmena)
 * sa TAČNIM minutom u sekundama (`clock.value`), ne tekst iz kog se minut
 * mora pogađati regex-om. Nema rizika od pogrešnog razdvajanja postava kao
 * kod nalepljenog worldfootball teksta (videti worldfootball-parser.ts) —
 * `rosters[]` već dolazi razdvojen po timu (`homeAway: "home"/"away"`).
 *
 * NEDOSTAJE: eksplicitno polje "minuti odigrani" po igraču. Računa se iz
 * `starter` + tačnog minuta izmene iz `keyEvents` (isti princip kao za
 * nalepljen tekst, samo sad nad pouzdanim, strukturiranim podacima).
 */

import type { ExtractedMatch, ExtractedPlayerStats } from "./worldfootball-parser";

type EspnAthlete = { id?: string | number; fullName?: string; displayName?: string };
type EspnStat = { name?: string; value?: number };
type EspnRosterPlayer = {
  athlete?: EspnAthlete;
  starter?: boolean;
  subbedIn?: boolean;
  subbedOut?: boolean;
  stats?: EspnStat[];
};
type EspnRosterSide = { homeAway?: "home" | "away"; team?: { id?: string }; roster?: EspnRosterPlayer[] };
type EspnKeyEvent = {
  type?: { type?: string };
  scoringPlay?: boolean;
  clock?: { value?: number };
  team?: { id?: string };
  participants?: { athlete?: EspnAthlete }[];
};

function statValue(stats: EspnStat[] | undefined, name: string): number {
  return stats?.find((s) => s.name === name)?.value ?? 0;
}

export function parseEspnSummary(json: any): ExtractedMatch {
  const warnings: string[] = [];

  const competitors = json?.header?.competitions?.[0]?.competitors ?? [];
  const homeComp = competitors.find((c: any) => c.homeAway === "home");
  const awayComp = competitors.find((c: any) => c.homeAway === "away");
  const homeTeamName = homeComp?.team?.displayName ?? "Domaći";
  const awayTeamName = awayComp?.team?.displayName ?? "Gosti";
  const homeScore = homeComp?.score != null ? Number(homeComp.score) : null;
  const awayScore = awayComp?.score != null ? Number(awayComp.score) : null;
  const homeTeamId = homeComp?.team?.id != null ? String(homeComp.team.id) : null;

  if (!homeComp || !awayComp) {
    warnings.push("Nisam prepoznao oba tima iz ESPN odgovora — proveri da li je event ID tačan.");
  }

  const rosters: EspnRosterSide[] = json?.rosters ?? [];
  if (rosters.length === 0) {
    warnings.push("ESPN odgovor nema 'rosters' — postave nisu dostupne za ovaj meč (možda još nije odigran).");
  }

  // Izmene i golovi iz keyEvents — minut je TAČAN broj (clock.value, u
  // sekundama), ne tekst iz kog se pogađa. Za izmenu, participants[0] je
  // igrač koji ULAZI, participants[1] onaj koji IZLAZI (potvrđeno unakrsnom
  // proverom sa subbedIn/subbedOut poljima u rosters).
  const keyEvents: EspnKeyEvent[] = json?.keyEvents ?? [];
  const subOnMinuteByAthleteId = new Map<string, number>();
  const subOffMinuteByAthleteId = new Map<string, number>();
  const goalMinutes: { minute: number; forHome: boolean | null }[] = [];

  for (const ev of keyEvents) {
    const minute = Math.round((ev.clock?.value ?? 0) / 60);
    if (ev.type?.type === "substitution") {
      const [incoming, outgoing] = ev.participants ?? [];
      const inId = incoming?.athlete?.id != null ? String(incoming.athlete.id) : null;
      const outId = outgoing?.athlete?.id != null ? String(outgoing.athlete.id) : null;
      if (inId) subOnMinuteByAthleteId.set(inId, minute);
      if (outId) subOffMinuteByAthleteId.set(outId, minute);
    } else if (ev.scoringPlay) {
      // scoringPlay pokriva i autogolove — ESPN već pripisuje "team" timu
      // kome gol IDE u korist (isto kao naš own_goals na igraču iz stats[]).
      const forHome = ev.team?.id != null ? String(ev.team.id) === homeTeamId : null;
      goalMinutes.push({ minute, forHome });
    }
  }

  const players: ExtractedPlayerStats[] = [];

  for (const side of rosters) {
    const isHome = side.homeAway === "home";
    for (const p of side.roster ?? []) {
      const athleteId = p.athlete?.id != null ? String(p.athlete.id) : null;
      const started = Boolean(p.starter);

      let minutesPlayed: number;
      let cameOnAt: number | null = null;
      if (started) {
        const offMinute = athleteId ? subOffMinuteByAthleteId.get(athleteId) : undefined;
        minutesPlayed = offMinute ?? 90;
      } else if (p.subbedIn) {
        const onMinute = athleteId ? subOnMinuteByAthleteId.get(athleteId) : undefined;
        cameOnAt = onMinute ?? null;
        minutesPlayed = onMinute != null ? 90 - onMinute : 0;
      } else {
        minutesPlayed = 0;
      }

      players.push({
        worldfootballId: null,
        nameOnPage: p.athlete?.fullName ?? p.athlete?.displayName ?? "?",
        minutesPlayed,
        goals: statValue(p.stats, "totalGoals"),
        assists: statValue(p.stats, "goalAssists"),
        yellowCards: statValue(p.stats, "yellowCards"),
        redCards: statValue(p.stats, "redCards"),
        ownGoals: statValue(p.stats, "ownGoals"),
        isHome,
        startedMatch: started,
        cameOnAt,
      });
    }
  }

  if (players.length === 0 && rosters.length > 0) {
    warnings.push("Postave postoje u ESPN odgovoru, ali nijedan igrač nije pročitan — proveri format ručno.");
  }
  warnings.push(
    "Odbrane golmana ESPN daje po igraču (stats: saves), ali se ovaj pregled na njih ne oslanja — proveri ih ručno u tabeli ispod ako želiš."
  );

  return {
    homeTeamName,
    awayTeamName,
    homeScore,
    awayScore,
    players,
    warnings,
    goalMinutes,
    confidence: {
      lineupsFound: rosters.length > 0,
      goalsFound: goalMinutes.length,
      cardsFound: 0,
      substitutionsFound: subOnMinuteByAthleteId.size,
    },
  };
}

/**
 * Prihvata ili goli ESPN event ID ("401896757"), ili pun link
 * (".../gameId/401896757/..." ili API URL sa "?event=401896757").
 */
export function extractEspnEventId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/(?:event=|gameId\/)(\d+)/);
  return m ? m[1] : null;
}
