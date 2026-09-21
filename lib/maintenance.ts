/**
 * Održavanje kalendara — jedna implementacija, dva pozivaoca.
 *
 * Do sad su ovo bile tri CLI skripte koje su `console.log`-ovale i zvale
 * `process.exit`. Da bi ista stvar radila i kao dugme u admin panelu, logika
 * je preseljena ovde i vraća STRUKTURIRAN rezultat umesto da piše u terminal;
 * skripte u `scripts/` su sad tanki omotači koji taj rezultat ispišu.
 *
 * Isti obrazac kao `lib/ingestion.ts` (Faza 5), koju već dele cron ruta i
 * admin dugme — da se pravilo ne duplira na dva mesta i ne raziđe vremenom.
 *
 * ⚠️ Trajanje: pozivi ka TheSportsDB-u imaju razmak zbog rate limita (free
 * tier ~30 zahteva/min). Zato `refreshResults` radi U PORCIJAMA i vraća
 * `remaining` — admin klikne ponovo, posao se nastavlja gde je stao. Vercel
 * Hobby seče funkciju na 60s (uz `maxDuration`), a bez porcija bi kolo sa 7
 * mečeva u lošem trenutku umelo da pukne na pola.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseScore, parseUtcTimestamp } from "./api-parsing";
import {
  THESPORTSDB_LEAGUE_ID,
  THESPORTSDB_SEASON,
  thesportsdbBase,
  resolveClubId,
  sleep,
  type TheSportsDbEvent,
} from "./thesportsdb";

export type TaskResult = {
  ok: boolean;
  summary: string;
  lines: string[];
  warnings: string[];
  /** Koliko je posla ostalo za sledeće pokretanje (0 = gotovo). */
  remaining: number;
};

const DEFAULT_DELAY_MS = 1500;

// ----------------------------------------------------------------------------
// 1) Backfill api_thesportsdb_id
// ----------------------------------------------------------------------------

/**
 * Popunjava `fixtures.api_thesportsdb_id` za mečeve unete preko CSV kalendara.
 * Uparuje po PARU KLUBOVA, ne po datumu: termin se pomera (odloženi mečevi, TV
 * raspored), par se ne menja.
 *
 * ⚠️ NE koristi se `eventsseason.php` (kao ranije) — besplatan tier na tom
 * pozivu vraća najviše 15 događaja UKUPNO za sezonu (isto ograničenje kao kod
 * `importFixtures`, videti napomenu tamo), što je ~2 kola od 14 klubova. Sve
 * dalje kolo (npr. kolo 5) se nikad ne bi pojavilo u odgovoru, pa bi backfill
 * za njega ćutke i trajno javljao "nije nađeno" bez obzira koliko puta se
 * pokrene. Zato se ovde, kao i u `lib/ingestion.ts`, ide PO KOLU preko
 * `eventsround.php` — jedan poziv po kolu koje stvarno ima meč bez ID-ja.
 *
 * `apply: false` je probni prolaz — ništa se ne upisuje.
 */
export async function backfillFixtureIds(
  supabase: SupabaseClient,
  opts: { apply: boolean }
): Promise<TaskResult> {
  const lines: string[] = [];
  const warnings: string[] = [];

  const { data: clubs, error: clubError } = await supabase.from("clubs").select("id, name");
  if (clubError) throw new Error(clubError.message);

  const { data: fixtures, error: fxError } = await supabase
    .from("fixtures")
    // "gameweeks!gameweek_id(...)" — fixtures ima DVA FK-a ka gameweeks
    // (gameweek_id i original_gameweek_id); bez pina na kolonu PostgREST ne
    // zna koji da embeduje i baca "more than one relationship was found".
    .select("id, home_club_id, away_club_id, kickoff_at, api_thesportsdb_id, gameweeks!gameweek_id(number)");
  if (fxError) throw new Error(fxError.message);

  const missing = (fixtures ?? []).filter((f) => !f.api_thesportsdb_id);
  lines.push(
    `Mečeva u bazi: ${(fixtures ?? []).length} · bez api_thesportsdb_id: ${missing.length}`
  );
  if (missing.length === 0) {
    return { ok: true, summary: "Svi mečevi već imaju ID — nema šta da se popuni.", lines, warnings, remaining: 0 };
  }

  const missingByRound = new Map<number, typeof missing>();
  let noRound = 0;
  for (const fx of missing) {
    const round = (fx.gameweeks as unknown as { number: number } | null)?.number ?? null;
    if (round === null) {
      noRound++;
      continue;
    }
    if (!missingByRound.has(round)) missingByRound.set(round, []);
    missingByRound.get(round)!.push(fx);
  }
  if (noRound > 0) {
    warnings.push(`${noRound} meč(eva) bez kola (gameweek) — preskačem, ne mogu se povezati sa API-jem po kolu.`);
  }

  const rounds = [...missingByRound.keys()].sort((a, b) => a - b);
  lines.push(`Kola koja treba proveriti: ${rounds.join(", ") || "—"}`);

  const byPair = new Map<string, TheSportsDbEvent[]>();
  const unresolved = new Set<string>();
  let eventsSeen = 0;

  for (let i = 0; i < rounds.length; i++) {
    if (i > 0) await sleep(1500); // free tier: 30 poziva/min
    const round = rounds[i];
    const url = `${thesportsdbBase()}/eventsround.php?id=${THESPORTSDB_LEAGUE_ID}&r=${round}&s=${THESPORTSDB_SEASON}`;
    const res = await fetch(url);
    if (!res.ok) {
      warnings.push(`Kolo ${round}: HTTP ${res.status} od TheSportsDB-a — preskačem.`);
      continue;
    }
    const json = (await res.json()) as { events: TheSportsDbEvent[] | null };
    const events = json.events ?? [];
    eventsSeen += events.length;

    for (const ev of events) {
      const home = resolveClubId(clubs ?? [], ev.strHomeTeam);
      const away = resolveClubId(clubs ?? [], ev.strAwayTeam);
      if (!home || !away) {
        unresolved.add(`${ev.strHomeTeam} — ${ev.strAwayTeam}`);
        continue;
      }
      const key = `${home}|${away}`;
      if (!byPair.has(key)) byPair.set(key, []);
      byPair.get(key)!.push(ev);
    }
  }
  lines.push(`TheSportsDB je vratio ${eventsSeen} meč(eva) za proverena kola.`);

  if (unresolved.size > 0) {
    warnings.push(
      `${unresolved.size} meč(eva) sa TheSportsDB-a nije upareno ni sa jednim klubom iz baze ` +
        `— proveri THESPORTSDB_CLUB_ALIASES u lib/thesportsdb.ts.`
    );
    for (const u of [...unresolved].slice(0, 10)) warnings.push(`   ${u}`);
  }

  const updates: { id: string; apiId: string }[] = [];
  let notFound = 0;
  let ambiguous = 0;

  for (const fx of missing) {
    const candidates = byPair.get(`${fx.home_club_id}|${fx.away_club_id}`) ?? [];
    if (candidates.length === 0) {
      notFound++;
      continue;
    }

    let chosen = candidates[0];
    if (candidates.length > 1) {
      // Isti par se u jednom kolu pojavljuje najviše jednom po smeru, pa je
      // ovo neočekivano (duplikat u izvoru ili plej-of susret gde se parovi
      // ponavljaju). Bira se najbliži termin, ali se slučaj PRIJAVLJUJE
      // umesto da se ćutke pogodi.
      const target = new Date(fx.kickoff_at).getTime();
      chosen = candidates.reduce((best, ev) => {
        const evTime = new Date(ev.strTimestamp ?? ev.dateEvent).getTime();
        const bestTime = new Date(best.strTimestamp ?? best.dateEvent).getTime();
        return Math.abs(evTime - target) < Math.abs(bestTime - target) ? ev : best;
      });
      ambiguous++;
      warnings.push(`${candidates.length} kandidata za isti par — biram najbliži termin (${chosen.dateEvent}).`);
    }

    updates.push({ id: fx.id, apiId: chosen.idEvent });
  }

  lines.push(
    `Upareno: ${updates.length} · nije nađeno: ${notFound}${ambiguous ? ` · višeznačno: ${ambiguous}` : ""}`
  );

  if (!opts.apply) {
    return {
      ok: true,
      summary: `Probni prolaz: uparilo bi ${updates.length} meč(eva). Ništa nije upisano.`,
      lines,
      warnings,
      remaining: updates.length,
    };
  }

  let written = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from("fixtures")
      .update({ api_thesportsdb_id: u.apiId })
      .eq("id", u.id);
    if (error) warnings.push(`${u.id}: ${error.message}`);
    else written++;
  }

  return {
    ok: written === updates.length,
    summary: `Upisano ${written} ID-jeva.`,
    lines,
    warnings,
    remaining: updates.length - written,
  };
}

// ----------------------------------------------------------------------------
// 2) Osvežavanje rezultata (legacy put, po ID-ju meča)
// ----------------------------------------------------------------------------

/**
 * Osvežava status/rezultat mečeva čiji je termin prošao, jedan po jedan preko
 * `lookupevent.php`.
 *
 * ⚠️ Za redovan rad postoji BOLJI put: `runResultsIngestion()` iz
 * `lib/ingestion.ts` (dugme "Pokreni ingestion sada" i cron). On radi po KOLU
 * — jedan poziv za 7 mečeva umesto sedam poziva — i ne traži
 * `api_thesportsdb_id`. Ova funkcija ostaje kao rezerva za pojedinačan meč
 * koji ingestion iz nekog razloga ne uhvati.
 */
export async function refreshResults(
  supabase: SupabaseClient,
  opts: { limit?: number; delayMs?: number } = {}
): Promise<TaskResult> {
  const limit = opts.limit ?? Number.POSITIVE_INFINITY;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const lines: string[] = [];
  const warnings: string[] = [];

  const { data: allPending, error } = await supabase
    .from("fixtures")
    .select("id, api_thesportsdb_id, kickoff_at")
    .in("status", ["scheduled", "live"])
    .lte("kickoff_at", new Date().toISOString())
    .order("kickoff_at", { ascending: true });
  if (error) throw new Error(error.message);

  const pending = (allPending ?? []).filter((f) => f.api_thesportsdb_id);
  const withoutId = (allPending ?? []).length - pending.length;

  if (withoutId > 0) {
    warnings.push(
      `${withoutId} meč(eva) čeka rezultat ali nema api_thesportsdb_id — pokreni prvo backfill.`
    );
  }

  if (pending.length === 0) {
    return {
      ok: true,
      summary: "Nema mečeva koji čekaju osvežavanje rezultata.",
      lines,
      warnings,
      remaining: 0,
    };
  }

  const batch = pending.slice(0, limit);
  lines.push(
    `Mečeva na čekanju: ${pending.length}${batch.length < pending.length ? ` — obrađujem prvih ${batch.length}` : ""}`
  );

  let updated = 0;
  for (const fx of batch) {
    const res = await fetch(`${thesportsdbBase()}/lookupevent.php?id=${fx.api_thesportsdb_id}`);
    if (!res.ok) {
      warnings.push(`HTTP ${res.status} za meč ${fx.id}`);
      await sleep(delayMs);
      continue;
    }
    const json = await res.json();
    const ev = json.events?.[0];
    if (!ev) {
      warnings.push(`Nema podataka za meč ${fx.id}`);
      await sleep(delayMs);
      continue;
    }

    let status: "scheduled" | "finished" | "postponed" | "live" = "scheduled";
    if (ev.strPostponed === "yes") status = "postponed";
    else if (ev.strStatus === "FT") status = "finished";
    else if (ev.strStatus && ev.strStatus !== "NS") status = "live";

    const homeScore = parseScore(ev.intHomeScore);
    const awayScore = parseScore(ev.intAwayScore);

    // Ne proglašavaj meč završenim ako rezultat nije stvarno stigao — bolje
    // ostaviti "live" i pokušati opet nego upisati lažno 0:0 koje bi scoring
    // engine uzeo kao konačno.
    if (status === "finished" && (homeScore === null || awayScore === null)) {
      warnings.push(`${ev.strHomeTeam} vs ${ev.strAwayTeam}: status FT ali rezultat nedostaje — ostavljam nezavršen.`);
      status = "live";
    }

    const { error: updateError } = await supabase
      .from("fixtures")
      .update({ status, home_score: homeScore, away_score: awayScore })
      .eq("id", fx.id);

    if (updateError) warnings.push(`Upis za meč ${fx.id}: ${updateError.message}`);
    else {
      updated++;
      lines.push(`${ev.strHomeTeam} ${homeScore ?? "-"}–${awayScore ?? "-"} ${ev.strAwayTeam} (${status})`);
    }

    await sleep(delayMs);
  }

  const remaining = pending.length - batch.length;
  return {
    ok: true,
    summary:
      `Ažurirano ${updated}/${batch.length} mečeva.` +
      (remaining > 0 ? ` Ostalo još ${remaining} — pokreni ponovo.` : ""),
    lines,
    warnings,
    remaining,
  };
}

// ----------------------------------------------------------------------------
// 3) Uvoz kalendara sa TheSportsDB
// ----------------------------------------------------------------------------

/**
 * ⚠️ OVA FUNKCIJA MENJA KALENDAR: pravi kola koja ne postoje i prepisuje
 * termine postojećim mečevima. Ako su termini sređivani ručno, ovo ih gazi.
 * Zato dugme u admin panelu traži potvrdu, a za samo popunjavanje ID-jeva
 * postoji `backfillFixtureIds`, koja ne dira ništa drugo.
 *
 * OGRANIČENJE (zvanična TheSportsDB dokumentacija): besplatan tier na
 * `eventsseason.php` vraća najviše 15 događaja po pozivu. Za ligu od 14
 * klubova to je ~2 kola, NE cela sezona. Za pun raspored ide
 * `scripts/import-fixtures-csv.ts`.
 */
export async function importFixtures(
  supabase: SupabaseClient,
  opts: { delayMs?: number } = {}
): Promise<TaskResult> {
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const lines: string[] = [];
  const warnings: string[] = [];
  const base = thesportsdbBase();

  const pastRes = await fetch(`${base}/eventsseason.php?id=${THESPORTSDB_LEAGUE_ID}&s=${THESPORTSDB_SEASON}`);
  if (!pastRes.ok) throw new Error(`HTTP ${pastRes.status} pri povlačenju sezone.`);
  const pastEvents: TheSportsDbEvent[] = (await pastRes.json()).events ?? [];
  lines.push(`Odigranih mečeva sa API-ja: ${pastEvents.length}`);

  await sleep(delayMs);

  const nextRes = await fetch(`${base}/eventsnextleague.php?id=${THESPORTSDB_LEAGUE_ID}`);
  let nextEvents: TheSportsDbEvent[] = [];
  if (nextRes.ok) {
    nextEvents = (await nextRes.json()).events ?? [];
    lines.push(`Predstojećih mečeva sa API-ja: ${nextEvents.length}`);
  } else {
    warnings.push(`HTTP ${nextRes.status} za predstojeće mečeve — nastavljam samo sa odigranim.`);
  }

  const seen = new Set<string>();
  const events: TheSportsDbEvent[] = [];
  for (const ev of [...pastEvents, ...nextEvents]) {
    if (seen.has(ev.idEvent)) continue;
    seen.add(ev.idEvent);
    events.push(ev);
  }
  lines.push(`Jedinstvenih mečeva za obradu: ${events.length}`);

  if (events.length === 0) {
    return {
      ok: false,
      summary: "API je vratio nula mečeva — proveri ligu i sezonu u lib/thesportsdb.ts.",
      lines,
      warnings,
      remaining: 0,
    };
  }

  // 1) Kola
  const rounds = [...new Set(events.map((e) => e.intRound).filter(Boolean))] as string[];
  rounds.sort((a, b) => Number(a) - Number(b));

  const gameweekIdByRound = new Map<string, string>();
  let createdGameweeks = 0;
  for (const round of rounds) {
    const kickoffs = events
      .filter((e) => e.intRound === round)
      .map((e) => parseUtcTimestamp(e.strTimestamp))
      .filter((t): t is string => t !== null)
      .sort();
    const firstKickoff = kickoffs[0];
    if (!firstKickoff) continue;
    const lastKickoff = kickoffs[kickoffs.length - 1] ?? firstKickoff;

    const { data: existing } = await supabase
      .from("gameweeks")
      .select("id")
      .eq("number", Number(round))
      .maybeSingle();

    if (existing) {
      gameweekIdByRound.set(round, existing.id);
      continue;
    }

    const { data: inserted, error } = await supabase
      .from("gameweeks")
      .insert({
        number: Number(round),
        deadline_at: new Date(new Date(firstKickoff).getTime() - 60 * 60 * 1000).toISOString(),
        starts_at: new Date(firstKickoff).toISOString(),
        ends_at: new Date(new Date(lastKickoff).getTime() + 2 * 60 * 60 * 1000).toISOString(),
        status: "upcoming",
      })
      .select("id")
      .single();

    if (error) {
      warnings.push(`Kolo ${round}: ${error.message}`);
      continue;
    }
    if (inserted) {
      gameweekIdByRound.set(round, inserted.id);
      createdGameweeks++;
    }
  }
  lines.push(`Kola spremna: ${gameweekIdByRound.size} (novih: ${createdGameweeks})`);

  const { data: clubs } = await supabase.from("clubs").select("id, name");

  // 2) Mečevi
  let ok = 0;
  let skipped = 0;

  for (const ev of events) {
    if (!ev.intRound || !gameweekIdByRound.has(ev.intRound)) {
      skipped++;
      continue;
    }
    const gameweekId = gameweekIdByRound.get(ev.intRound)!;
    const homeClubId = resolveClubId(clubs ?? [], ev.strHomeTeam);
    const awayClubId = resolveClubId(clubs ?? [], ev.strAwayTeam);

    if (!homeClubId || !awayClubId) {
      warnings.push(`Nepoznat klub: "${ev.strHomeTeam}" vs "${ev.strAwayTeam}" — preskačem.`);
      skipped++;
      continue;
    }

    const kickoffAt =
      parseUtcTimestamp(ev.strTimestamp) ??
      parseUtcTimestamp(`${ev.dateEvent} ${ev.strTime ?? "00:00"}`);
    if (!kickoffAt) {
      warnings.push(`Neupotrebljiv termin: "${ev.strHomeTeam} vs ${ev.strAwayTeam}" — preskačem.`);
      skipped++;
      continue;
    }

    const homeScore = parseScore(ev.intHomeScore);
    const awayScore = parseScore(ev.intAwayScore);

    let status: "scheduled" | "finished" | "postponed" = "scheduled";
    if (ev.strPostponed === "yes") status = "postponed";
    else if (ev.strStatus === "FT" && homeScore !== null && awayScore !== null) status = "finished";

    // Prvo traži RUČNO uneti red (bez api_thesportsdb_id), i to SAMO po paru
    // klubova, ne i po kolu — svaki uređeni par se pojavljuje tačno jednom u
    // sezoni, pa se red pronađe i ako je meč u međuvremenu premešten zbog
    // odlaganja (tada se staro kolo čuva u original_gameweek_id).
    const { data: manualExisting } = await supabase
      .from("fixtures")
      .select("id, gameweek_id, original_gameweek_id")
      .eq("home_club_id", homeClubId)
      .eq("away_club_id", awayClubId)
      .is("api_thesportsdb_id", null)
      .maybeSingle();

    let writeError;
    if (manualExisting) {
      const moved = manualExisting.gameweek_id !== gameweekId;
      const result = await supabase
        .from("fixtures")
        .update({
          gameweek_id: gameweekId,
          kickoff_at: kickoffAt,
          status,
          home_score: homeScore,
          away_score: awayScore,
          api_thesportsdb_id: ev.idEvent,
          original_gameweek_id: moved
            ? manualExisting.original_gameweek_id ?? manualExisting.gameweek_id
            : manualExisting.original_gameweek_id,
        })
        .eq("id", manualExisting.id);
      writeError = result.error;
    } else {
      const result = await supabase.from("fixtures").upsert(
        {
          gameweek_id: gameweekId,
          home_club_id: homeClubId,
          away_club_id: awayClubId,
          kickoff_at: kickoffAt,
          status,
          home_score: homeScore,
          away_score: awayScore,
          api_thesportsdb_id: ev.idEvent,
        },
        { onConflict: "api_thesportsdb_id" }
      );
      writeError = result.error;
    }

    if (writeError) {
      warnings.push(`"${ev.strHomeTeam} vs ${ev.strAwayTeam}": ${writeError.message}`);
      skipped++;
      continue;
    }
    ok++;
  }

  return {
    ok: skipped === 0,
    summary: `Upisano/ažurirano ${ok} mečeva, preskočeno ${skipped}.`,
    lines,
    warnings,
    remaining: 0,
  };
}
