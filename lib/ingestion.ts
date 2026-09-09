/**
 * Faza 5 — automatski ingestion rezultata.
 *
 * Ovo je SRCE cron posla, izdvojeno iz Route Handler-a da bi ga admin panel
 * mogao pozvati direktno (dugme "Pokreni sada") bez lažiranja CRON_SECRET
 * headera.
 *
 * DVE FAZE, sa različitim pristupom API-ju:
 *
 *   Faza A — POTVRDA REZULTATA. Za kola koja imaju scheduled/live meč čiji je
 *   kickoff već prošao, pozovi eventsround.php JEDNOM za celo kolo (7 mečeva
 *   odjednom, sedam puta manje poziva nego meč-po-meč). Ovo NE otkriva
 *   premeštanje u drugo kolo — samo potvrđuje rezultat/status meča U KOLU
 *   KOJE VEĆ TRAŽIMO.
 *
 *   Faza B — PREMEŠTANJE ODLOŽENIH. Round-based upit ne može otkriti da je
 *   meč premešten: kad se pita eventsround.php?r=1 za meč koji je TheSportsDB
 *   u međuvremenu prebacio u kolo 5, taj meč prosto NESTAJE iz odgovora za
 *   kolo 1 — nema šanse da se iz tog odgovora zaključi gde je otišao. Zato se
 *   za SVAKI meč sa statusom "postponed" poziva lookupevent.php?id={njegov
 *   sopstveni thesportsdb ID} — to je upit ka KONKRETNOM meču, ne ka kolu, pa
 *   uvek vraća njegovo TRENUTNO stanje (novi datum, novo kolo) bez obzira gde
 *   je premešten. Retko ih ima, pa je poziv-po-meču ovde u redu.
 *
 * ODLOŽENI MEČEVI: kad se u fazi B otkrije da je meč dobio novi termin u
 * drugom kolu, fixtures.gameweek_id se premešta na to kolo i upisuje se
 * original_gameweek_id (samo ako tamo već ne stoji nešto — trag ostaje na
 * PRVOM kolu iz kog je meč izašao). Poeni će se obračunati za kolo u kom se
 * meč STVARNO igra — to je odluka potvrđena za ovaj projekat.
 *
 * Idempotentno: ponovno pokretanje ništa ne kvari, samo osvežava ono što se
 * u međuvremenu promenilo.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseScore, parseUtcTimestamp } from "./api-parsing";
import {
  resolveClubId,
  sleep,
  thesportsdbBase,
  THESPORTSDB_LEAGUE_ID,
  THESPORTSDB_SEASON,
  type ClubRow,
  type TheSportsDbEvent,
} from "./thesportsdb";

export type IngestionResult = {
  ok: boolean;
  runId: string;
  roundsChecked: number[];
  postponedRechecked: number;
  fixturesTouched: number;
  gameweeksUpdated: number;
  errors: string[];
};

/** Kola koja imaju bar jedan scheduled/live meč čiji je kickoff već prošao. */
async function findDueRounds(supabase: SupabaseClient): Promise<number[]> {
  const { data: fixturesToCheck } = await supabase
    .from("fixtures")
    .select("status, kickoff_at, gameweeks(number)")
    .in("status", ["scheduled", "live"]);

  const now = Date.now();
  const result = new Set<number>();
  for (const f of fixturesToCheck ?? []) {
    const gw = f.gameweeks as unknown as { number: number } | null;
    if (!gw) continue;
    if (f.status === "live" || (f.kickoff_at && new Date(f.kickoff_at).getTime() < now)) {
      result.add(gw.number);
    }
  }
  return [...result].sort((a, b) => a - b);
}

/** Nađi ili napravi gameweek red za dato kolo, iz kickoff-ova tog kola. */
async function ensureGameweek(
  supabase: SupabaseClient,
  round: number,
  events: TheSportsDbEvent[]
): Promise<{ id: string; number: number } | null> {
  const { data: existing } = await supabase
    .from("gameweeks")
    .select("id, number")
    .eq("number", round)
    .maybeSingle();
  if (existing) return existing;

  const kickoffs = events
    .map((e) => parseUtcTimestamp(e.strTimestamp))
    .filter((t): t is string => t !== null)
    .sort();
  if (kickoffs.length === 0) return null;

  const firstKickoff = kickoffs[0];
  const lastKickoff = kickoffs[kickoffs.length - 1];
  const deadlineAt = new Date(new Date(firstKickoff).getTime() - 60 * 60 * 1000);
  const startsAt = new Date(firstKickoff);
  const endsAt = new Date(new Date(lastKickoff).getTime() + 2 * 60 * 60 * 1000);

  const { data: inserted, error } = await supabase
    .from("gameweeks")
    .insert({
      number: round,
      deadline_at: deadlineAt.toISOString(),
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "upcoming",
    })
    .select("id, number")
    .single();

  if (error) return null;
  return inserted;
}

function deriveStatus(ev: TheSportsDbEvent, homeScore: number | null, awayScore: number | null) {
  if (ev.strPostponed === "yes") return "postponed" as const;
  if (ev.strStatus === "FT" && homeScore !== null && awayScore !== null) return "finished" as const;
  if (ev.strStatus && ev.strStatus !== "NS" && ev.strStatus !== "FT") return "live" as const;
  return "scheduled" as const;
}

/**
 * FAZA A — potvrdi status/rezultat mečeva IZ KOLA KOJE VEĆ TRAŽIMO. Ne radi
 * nikakvo premeštanje između kola (videti napomenu na vrhu fajla zašto to
 * ovde nije moguće) — ako meč izađe kao postponed, samo se upiše taj status;
 * pravo premeštanje radi Faza B.
 */
async function confirmRound(
  supabase: SupabaseClient,
  round: number,
  clubs: ClubRow[],
  errors: string[]
): Promise<{ gwId: string | null; touched: number }> {
  const res = await fetch(
    `${thesportsdbBase()}/eventsround.php?id=${THESPORTSDB_LEAGUE_ID}&r=${round}&s=${THESPORTSDB_SEASON}`
  );
  if (!res.ok) {
    errors.push(`Kolo ${round}: HTTP ${res.status}`);
    return { gwId: null, touched: 0 };
  }
  const json = await res.json();
  const events: TheSportsDbEvent[] = json?.events ?? [];

  const gw = await ensureGameweek(supabase, round, events);
  if (!gw) {
    errors.push(`Kolo ${round}: nema kickoff podataka, gameweek nije napravljen/nađen`);
    return { gwId: null, touched: 0 };
  }

  let touched = 0;
  for (const ev of events) {
    const homeClubId = resolveClubId(clubs, ev.strHomeTeam);
    const awayClubId = resolveClubId(clubs, ev.strAwayTeam);
    if (!homeClubId || !awayClubId) {
      errors.push(`Kolo ${round}: nepoznat klub "${ev.strHomeTeam}" vs "${ev.strAwayTeam}"`);
      continue;
    }

    const { data: fixture } = await supabase
      .from("fixtures")
      .select("id, status")
      .eq("home_club_id", homeClubId)
      .eq("away_club_id", awayClubId)
      .maybeSingle();
    if (!fixture) {
      errors.push(`Kolo ${round}: meč "${ev.strHomeTeam} vs ${ev.strAwayTeam}" nije nađen u bazi`);
      continue;
    }

    const homeScore = parseScore(ev.intHomeScore);
    const awayScore = parseScore(ev.intAwayScore);
    const status = deriveStatus(ev, homeScore, awayScore);
    const kickoffAt =
      parseUtcTimestamp(ev.strTimestamp) ?? parseUtcTimestamp(`${ev.dateEvent} ${ev.strTime ?? "00:00"}`);

    const patch: Record<string, unknown> = {
      status,
      home_score: homeScore,
      away_score: awayScore,
      api_thesportsdb_id: ev.idEvent,
    };
    if (kickoffAt) patch.kickoff_at = kickoffAt;

    const { error } = await supabase.from("fixtures").update(patch).eq("id", fixture.id);
    if (error) {
      errors.push(`Kolo ${round}, "${ev.strHomeTeam} vs ${ev.strAwayTeam}": ${error.message}`);
      continue;
    }
    touched++;
  }

  return { gwId: gw.id, touched };
}

/**
 * FAZA B — za svaki meč koji trenutno stoji kao "postponed", pitaj
 * TheSportsDB direktno za taj meč (ne za kolo) da li je dobio novi termin, i
 * ako je novo kolo drugačije od trenutnog, premesti ga.
 */
async function recheckPostponed(
  supabase: SupabaseClient,
  errors: string[]
): Promise<{ rechecked: number; touched: number; touchedGameweekIds: Set<string> }> {
  const { data: postponedFixtures } = await supabase
    .from("fixtures")
    .select("id, gameweek_id, original_gameweek_id, api_thesportsdb_id, gameweeks(number)")
    .eq("status", "postponed");

  const rows = (postponedFixtures ?? []).filter((f) => f.api_thesportsdb_id);
  let touched = 0;
  const touchedGameweekIds = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const f = rows[i];
    if (i > 0) await sleep(1500);
    touchedGameweekIds.add(f.gameweek_id); // kolo iz kog meč IZLAZI (ili ostaje) — provera lifecycle-a i za njega

    try {
      const res = await fetch(`${thesportsdbBase()}/lookupevent.php?id=${f.api_thesportsdb_id}`);
      if (!res.ok) {
        errors.push(`Odloženi meč ${f.api_thesportsdb_id}: HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      const ev: TheSportsDbEvent | undefined = json?.events?.[0];
      if (!ev) {
        errors.push(`Odloženi meč ${f.api_thesportsdb_id}: TheSportsDB ga ne vraća više`);
        continue;
      }

      const homeScore = parseScore(ev.intHomeScore);
      const awayScore = parseScore(ev.intAwayScore);
      const status = deriveStatus(ev, homeScore, awayScore);
      const kickoffAt =
        parseUtcTimestamp(ev.strTimestamp) ?? parseUtcTimestamp(`${ev.dateEvent} ${ev.strTime ?? "00:00"}`);

      const currentRound = (f.gameweeks as unknown as { number: number } | null)?.number ?? null;
      const newRound = ev.intRound ? Number(ev.intRound) : null;
      const moved = newRound !== null && newRound !== currentRound;

      const patch: Record<string, unknown> = { status, home_score: homeScore, away_score: awayScore };
      if (kickoffAt) patch.kickoff_at = kickoffAt;

      if (moved) {
        const { data: targetGw } = await supabase
          .from("gameweeks")
          .select("id")
          .eq("number", newRound!)
          .maybeSingle();
        if (targetGw) {
          patch.gameweek_id = targetGw.id;
          patch.original_gameweek_id = f.original_gameweek_id ?? f.gameweek_id;
          // Kolo u koje meč ULAZI mora se i ono provisi — ako je već bilo
          // data_pulled (sva svoja kola gotova), ovaj novi nedovršen meč ga
          // vraća na in_progress dok se i on ne odigra.
          touchedGameweekIds.add(targetGw.id);
        } else {
          errors.push(
            `Odloženi meč ${f.api_thesportsdb_id}: novo kolo ${newRound} ne postoji u bazi — uvezi ga (npr. dopuni fixtures-template.csv) pa pokreni ingestion ponovo`
          );
        }
      }

      const { error } = await supabase.from("fixtures").update(patch).eq("id", f.id);
      if (error) {
        errors.push(`Odloženi meč ${f.api_thesportsdb_id}: ${error.message}`);
        continue;
      }
      touched++;
    } catch (err) {
      errors.push(`Odloženi meč ${f.api_thesportsdb_id}: ${(err as Error).message}`);
    }
  }

  return { rechecked: rows.length, touched, touchedGameweekIds };
}

/**
 * Kad su svi mečevi jednog kola gotovi (finished/cancelled), kolo prelazi u
 * data_pulled — spremno za admin pregled. Dok ima i jedan postponed ili
 * scheduled/live meč, kolo ostaje in_progress. Nikad ne vraća kolo nazad iz
 * admin_reviewed/finalized — to su koraci koje samo admin/scoring engine
 * pomera napred (Faza 6/7).
 */
async function updateGameweekLifecycle(supabase: SupabaseClient, gameweekId: string): Promise<void> {
  const { data: gw } = await supabase
    .from("gameweeks")
    .select("status, deadline_at")
    .eq("id", gameweekId)
    .single();
  if (!gw || gw.status === "admin_reviewed" || gw.status === "finalized") return;

  // Kolo čiji rok još nije prošao je legitimno "upcoming" bez obzira na to
  // da li u njega upravo upada neki premešten (odložen pa rasporedjen) meč —
  // ne diramo status dok se rok ne približi/prođe. Bez ovoga bi jedan
  // premešten meč iz decembra u kolo koje se igra tek u martu preskočio to
  // kolo pravo u "in_progress" iako niko još nije ni predao sastav.
  if (new Date(gw.deadline_at) > new Date()) return;

  const { data: fixtures } = await supabase
    .from("fixtures")
    .select("status")
    .eq("gameweek_id", gameweekId);

  const rows = fixtures ?? [];
  if (rows.length === 0) return;

  const allDone = rows.every((f) => f.status === "finished" || f.status === "cancelled");
  const nextStatus = allDone ? "data_pulled" : "in_progress";
  if (nextStatus !== gw.status) {
    await supabase.from("gameweeks").update({ status: nextStatus }).eq("id", gameweekId);
  }
}

/** Tačno jedno kolo je is_current: prvo in_progress, inače najbliže upcoming. */
async function refreshCurrentGameweek(supabase: SupabaseClient): Promise<void> {
  const { data: inProgress } = await supabase
    .from("gameweeks")
    .select("id")
    .eq("status", "in_progress")
    .order("number", { ascending: true })
    .limit(1)
    .maybeSingle();

  let targetId = inProgress?.id ?? null;

  if (!targetId) {
    const { data: upcoming } = await supabase
      .from("gameweeks")
      .select("id")
      .eq("status", "upcoming")
      .order("number", { ascending: true })
      .limit(1)
      .maybeSingle();
    targetId = upcoming?.id ?? null;
  }

  const { data: currentlyMarked } = await supabase
    .from("gameweeks")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  if (currentlyMarked?.id === targetId) return; // već tačno

  if (currentlyMarked) {
    await supabase.from("gameweeks").update({ is_current: false }).eq("id", currentlyMarked.id);
  }
  if (targetId) {
    await supabase.from("gameweeks").update({ is_current: true }).eq("id", targetId);
  }
}

/**
 * Glavna funkcija — poziva je i cron ruta i admin "Pokreni sada" dugme.
 * `triggeredBy` je null za automatski cron, ili users.id admina koji je
 * ručno pokrenuo.
 */
export async function runResultsIngestion(
  supabase: SupabaseClient,
  triggeredBy: string | null = null
): Promise<IngestionResult> {
  const errors: string[] = [];
  let fixturesTouched = 0;

  const { data: run, error: runError } = await supabase
    .from("ingestion_runs")
    .insert({ kind: triggeredBy ? "admin_manual_trigger" : "cron_results", triggered_by: triggeredBy })
    .select("id")
    .single();

  if (runError || !run) {
    // Ne prekidaj ingestion samo zato što log ne može da se upiše — ali
    // prijavi grešku u rezultatu da se primeti.
    errors.push(`Nije upisan ingestion_runs red: ${runError?.message}`);
  }
  const runId = run?.id ?? "unknown";

  const { data: allClubs } = await supabase.from("clubs").select("id, name");
  const clubs: ClubRow[] = allClubs ?? [];

  // --- Faza A: potvrda rezultata po kolu -----------------------------------
  const dueRounds = await findDueRounds(supabase);
  const touchedGameweekIds = new Set<string>();

  for (let i = 0; i < dueRounds.length; i++) {
    if (i > 0) await sleep(1500); // free tier: 30 poziva/min, budi obazriv
    const { gwId, touched } = await confirmRound(supabase, dueRounds[i], clubs, errors);
    if (gwId) touchedGameweekIds.add(gwId);
    fixturesTouched += touched;
  }

  // --- Faza B: da li je neki odloženi meč dobio novi termin? --------------
  const { rechecked, touched: postponedTouched, touchedGameweekIds: postponedGwIds } =
    await recheckPostponed(supabase, errors);
  fixturesTouched += postponedTouched;
  for (const id of postponedGwIds) touchedGameweekIds.add(id);

  for (const gwId of touchedGameweekIds) {
    await updateGameweekLifecycle(supabase, gwId);
  }
  await refreshCurrentGameweek(supabase);

  if (run) {
    await supabase
      .from("ingestion_runs")
      .update({
        finished_at: new Date().toISOString(),
        rounds_checked: dueRounds,
        fixtures_touched: fixturesTouched,
        errors,
      })
      .eq("id", run.id);
  }

  return {
    ok: errors.length === 0,
    runId,
    roundsChecked: dueRounds,
    postponedRechecked: rechecked,
    fixturesTouched,
    gameweeksUpdated: touchedGameweekIds.size,
    errors,
  };
}
