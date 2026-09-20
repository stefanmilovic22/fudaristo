/**
 * Faza 6 — scoring engine.
 *
 * Ulaz: player_gameweek_stats redovi koje je admin potvrdio (is_admin_reviewed
 * = true) za sve mečeve jednog kola. Izlaz: fantasy_points po redu,
 * players.total_points keš, user_gameweek_points po korisniku, users.total_points
 * keš, i pomeranje kola kroz data_pulled → admin_reviewed → finalized.
 *
 * Tri stvari koje GDD ne razrađuje eksplicitno, pa su ovde REŠENE kao
 * pretpostavka (isti obrazac kao ranije u fantasy-rules.ts — jasno
 * označeno, lako se menja ako se ne slaže sa namerom):
 *
 *   1) BONUS POENI (GDD sekcija 10: "najbolji u meču, BPS sistem, 1-3") — u
 *      bazi nema sirovih statistika (tackles/clearances/key passes...) iz
 *      kojih bi se pravi BPS mogao izračunati (sekcija 10 svesno preskače
 *      defanzivni doprinos), niti je admin forma ikad imala polje za ovo.
 *      Rešenje: `bonus_points` postaje RUČNO polje u admin formi (kao i sve
 *      ostalo što automatika ne pokriva) — admin dodeljuje 1-3 po sopstvenoj
 *      proceni (npr. gledajući whoscored.com), scoring engine ga samo sabira
 *      sa ostatkom. Ostaje 0 ako se ne unese, isto kao GK odbrane kad izvor
 *      ne postoji.
 *
 *   2) AUTO-SUB (klupa ulazi umesto igrača sa 0 odigranih minuta) — GDD nema
 *      posebnu sekciju o ovome, ali "identično FPL" (sekcija 1) plus
 *      squads.squad_order komentar ("redosled koji će auto-sub logika u Fazi
 *      6 koristiti") jasno signaliziraju da se očekuje. Implementiran je
 *      standardni FPL greedy algoritam (videti resolveEffectiveStartingXI).
 *
 *   3) ČIPOVI — Triple Captain i Favorite Club x2 SU implementirani ovde (čita
 *      se chips_usage ako red postoji), ali UI dugme za aktivaciju čipa NE
 *      postoji nigde u aplikaciji (potvrđeno: nula pominjanja "chip" izvan
 *      schema.sql pre ove runde) — to je hendover već označio kao "prirodan
 *      sledeći korak POSLE scoring engine-a", tj. namerno van obima Faze 6.
 *      Dok UI ne postoji, chips_usage je uvek prazna tabela i ovaj kod se
 *      svodi na "kapiten x2, bez klupskog bonusa" — bezopasno, ali spremno.
 *      Joker #1/#2 nemaju efekat OVDE (oni menjaju cenu transfera, ne poene)
 *      — to je posao make_transfer()/apply_transfers() kad god im UI stigne;
 *      scoring engine samo SABIRA transfers.points_cost, ne odlučuje o njemu.
 *
 * Idempotentno i bezbedno za ponovno pokretanje (uklj. posle finalized, radi
 * ispravki) — svaki upis je "izračunaj iznova iz sirovih podataka", ne
 * inkrementalna izmena.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { STARTING_XI_BOUNDS, type Position } from "./fantasy-rules";
import { selectAllPages } from "./db-paging";

// ----------------------------------------------------------------------------
// Tabela poena — GDD sekcija 10, identična aktuelnom FPL sistemu
// ----------------------------------------------------------------------------

const GOAL_POINTS: Record<Position, number> = { GK: 6, DEF: 6, MID: 5, FWD: 4 };
const CLEAN_SHEET_POINTS: Record<Position, number> = { GK: 4, DEF: 4, MID: 1, FWD: 0 };
const ASSIST_POINTS = 3;
const PENALTY_MISSED_POINTS = -2;
const YELLOW_CARD_POINTS = -1;
const RED_CARD_POINTS = -3;
const OWN_GOAL_POINTS = -2;
const PENALTY_SAVED_POINTS = 5;

export type RawStatRow = {
  position: Position;
  minutes_played: number;
  goals: number;
  assists: number;
  clean_sheet: boolean;
  goals_conceded: number;
  saves: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  own_goals: number;
  bonus_points: number;
};

/**
 * Poeni za JEDAN red sirove statistike (jedan igrač, jedan meč). Kod duplog
 * kola (meč premešten pa klub odigra 2 meča u istom gameweek-u, GDD sekcija
 * 15) ova funkcija se poziva po redu — svaki meč nosi svoje poene nezavisno,
 * sabiranje na nivou gameweek-a radi pozivalac (isto kao FPL double gameweek).
 */
export function calculateRowFantasyPoints(stats: RawStatRow): number {
  let points = 0;

  // Minuti — ISKLJUČIVO, ne kumulativno (60+ min je 2, ne 1+2=3).
  if (stats.minutes_played >= 60) points += 2;
  else if (stats.minutes_played >= 1) points += 1;

  points += stats.goals * GOAL_POINTS[stats.position];
  points += stats.assists * ASSIST_POINTS;
  if (stats.clean_sheet) points += CLEAN_SHEET_POINTS[stats.position];

  if (stats.position === "GK") {
    points += Math.floor(stats.saves / 3);
    points += stats.penalties_saved * PENALTY_SAVED_POINTS;
  }

  if (stats.position === "GK" || stats.position === "DEF") {
    points += Math.floor(stats.goals_conceded / 2) * -1;
  }

  points += stats.penalties_missed * PENALTY_MISSED_POINTS;
  points += stats.yellow_cards * YELLOW_CARD_POINTS;
  points += stats.red_cards * RED_CARD_POINTS;
  points += stats.own_goals * OWN_GOAL_POINTS;
  points += stats.bonus_points;

  return points;
}

// ----------------------------------------------------------------------------
// Auto-sub + kapiten — rade nad AGREGIRANIM (po gameweek-u, ne po meču)
// minutima/poenima jednog igrača, da duplo kolo ne pokvari odluku.
// ----------------------------------------------------------------------------

export type SquadPlayerForScoring = {
  playerId: string;
  position: Position;
  isStarting: boolean;
  squadOrder: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  clubId: string; // snapshot iz player_gameweek_stats kad je dostupan, inače trenutni players.club_id
  minutesPlayed: number; // SABRANO preko svih mečeva ovog kola
  fantasyPoints: number; // SABRANO preko svih mečeva ovog kola
};

function formationValid(ids: Set<string>, squad: SquadPlayerForScoring[]): boolean {
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of squad) if (ids.has(p.playerId)) counts[p.position]++;
  const [dMin, dMax] = STARTING_XI_BOUNDS.DEF;
  const [mMin, mMax] = STARTING_XI_BOUNDS.MID;
  const [fMin, fMax] = STARTING_XI_BOUNDS.FWD;
  return (
    counts.GK === 1 &&
    counts.DEF >= dMin && counts.DEF <= dMax &&
    counts.MID >= mMin && counts.MID <= mMax &&
    counts.FWD >= fMin && counts.FWD <= fMax
  );
}

/**
 * Standardni FPL auto-sub: golman se menja samo golmanom (uvek validno);
 * za poziciona mesta se ide kroz klupu PO PRIORITETU (squad_order 1,2,3) i za
 * svakog kandidata traži bilo koji još-nezamenjeni starter sa 0 minuta čije
 * uklanjanje + ulazak kandidata i dalje poštuje STARTING_XI_BOUNDS. Ako
 * nijedna zamena za datog kandidata nije validna, taj igrač sa klupe ostaje
 * napolju (tim igra sa manje od 11 koji su doneli poene — retko, ali se
 * dešava i na pravom FPL-u kad je klupa neusklađena sa formacijom).
 *
 * "0 minuta" pokriva i slučaj da klub uopšte nije igrao ovo kolo (prazno
 * kolo, GDD sekcija 15) — nema redova, pa je agregat 0, isti tretman kao
 * "ušao pa izašao bez minuta".
 */
export function resolveEffectiveStartingXI(squad: SquadPlayerForScoring[]): {
  effectiveIds: Set<string>;
  autoSubbedInIds: Set<string>;
} {
  const starters = squad.filter((p) => p.isStarting);
  const bench = [...squad.filter((p) => !p.isStarting)].sort((a, b) => a.squadOrder - b.squadOrder);

  const effective = new Set(starters.map((p) => p.playerId));
  const autoSubbedIn = new Set<string>();

  // 1) Golman — nezavisna zamena, uvek validna ako klupski golman ima minute.
  const starterGk = starters.find((p) => p.position === "GK");
  if (starterGk && starterGk.minutesPlayed === 0) {
    const benchGk = bench.find((p) => p.position === "GK" && p.minutesPlayed > 0);
    if (benchGk) {
      effective.delete(starterGk.playerId);
      effective.add(benchGk.playerId);
      autoSubbedIn.add(benchGk.playerId);
    }
  }

  // 2) Ostali — klupa u prioritetnom redosledu, svaki traži bilo kog validnog
  //    "izlaznog" startera.
  const nonPlayingStarters = starters
    .filter((p) => p.position !== "GK" && p.minutesPlayed === 0)
    .sort((a, b) => a.squadOrder - b.squadOrder);
  const availableBench = bench.filter((p) => p.position !== "GK" && p.minutesPlayed > 0);

  for (const candidate of availableBench) {
    for (const out of nonPlayingStarters) {
      if (!effective.has(out.playerId)) continue; // već zamenjen ranije u ovoj petlji

      const trial = new Set(effective);
      trial.delete(out.playerId);
      trial.add(candidate.playerId);

      if (formationValid(trial, squad)) {
        effective.delete(out.playerId);
        effective.add(candidate.playerId);
        autoSubbedIn.add(candidate.playerId);
        break;
      }
    }
  }

  return { effectiveIds: effective, autoSubbedInIds: autoSubbedIn };
}

export type ChipType = "joker_1" | "joker_2" | "triple_captain" | "favorite_club_x2" | null;

/**
 * GDD sekcija 6: kapiten nosi 2x (3x uz Triple Captain, sekcija 5); ako
 * kapiten odigra 0 minuta, vice-kapiten preuzima množilac. Ako ni vice nije
 * odigrao, niko ne nosi množilac to kolo (GDD ne pominje dalji fallback).
 *
 * `effectiveIds` (postava POSLE auto-sub-a) je obavezan uslov, ne samo minuti:
 * traka mora da padne na nekog ko je stvarno doneo poene. Bez toga bi kapiten
 * koji je ostao na klupi a odigrao (UI to danas ne dozvoljava, ali RPC-ovi ne
 * garantuju) pojeo množilac koji nigde ne bi bio primenjen — vice bi ostao
 * praznih ruku iako je igrao.
 */
export function resolveCaptainMultiplier(
  squad: SquadPlayerForScoring[],
  chipType: ChipType,
  effectiveIds?: Set<string>
): { captainId: string | null; multiplier: number } {
  const base = chipType === "triple_captain" ? 3 : 2;
  const eligible = (p: SquadPlayerForScoring | undefined) =>
    !!p && p.minutesPlayed > 0 && (!effectiveIds || effectiveIds.has(p.playerId));

  const captain = squad.find((p) => p.isCaptain);
  const vice = squad.find((p) => p.isViceCaptain);

  if (eligible(captain)) return { captainId: captain!.playerId, multiplier: base };
  if (eligible(vice)) return { captainId: vice!.playerId, multiplier: base };
  return { captainId: null, multiplier: 1 };
}

// ----------------------------------------------------------------------------
// Orkestracija — poziva se iz admin server action-a (finalizeGameweekAction)
// ----------------------------------------------------------------------------

export type ScoringResult = {
  ok: boolean;
  gameweekNumber: number;
  statRowsScored: number;
  playersUpdated: number;
  usersScored: number;
  finalized: boolean;
  errors: string[];
};

/**
 * Straničenje je u lib/db-paging.ts jer ga od Faze 9 koriste i /liga i
 * /statistike — isti razlog (Supabase ćutke odseca na 1000 redova).
 */

/**
 * Glavna funkcija. Validira da je kolo spremno (svi mečevi gotovi, statistika
 * uneta I potvrđena), pa: upisuje fantasy_points → osvežava players.total_points
 * keš → računa user_gameweek_points po korisniku (auto-sub, kapiten, čip,
 * transfer penal) → osvežava users.total_points keš → pomera kolo u finalized.
 *
 * Bezbedno za ponovno pokretanje bilo kad POSLE data_pulled (uklj. posle
 * finalized, npr. admin ispravi unetu statistiku i treba da se sve
 * prekalkuliše) — uvek iznova računa iz trenutnih sirovih vrednosti, ne
 * inkrementalno.
 *
 * SVI upisi idu kroz skupovne RPC-ove iz migracije 007 (jedan SQL izraz po
 * koraku) umesto red-po-red iz Node-a. Ceo obračun je ~15 poziva ka bazi bez
 * obzira na veličinu lige — ranije je bio ~1.800 za 50 korisnika, što je
 * probijalo Vercel limit trajanja funkcije.
 */
export async function runScoringForGameweek(
  supabase: SupabaseClient,
  gameweekId: string,
  triggeredBy: string
): Promise<ScoringResult> {
  const errors: string[] = [];

  const { data: gw } = await supabase
    .from("gameweeks")
    .select("id, number, status")
    .eq("id", gameweekId)
    .single();
  if (!gw) throw new Error("Kolo ne postoji.");
  // NAMERNO nema provere gw.status ovde.
  //
  // Ranije je kolo u statusu "upcoming" ili "in_progress" bilo odbijeno. To je
  // izgledalo kao razumna zaštita, ali je status polje koje menja SAMO
  // ingestion — ako admin unese rezultate ručno (SQL, ispravka odloženog
  // meča), mečevi su odigrani a status je i dalje "upcoming", pa se kolo nije
  // moglo obračunati iako je sve spremno.
  //
  // Prava provera je stanje mečeva, i ona ionako sledi niže: svi moraju biti
  // finished ili cancelled, svaki odigran mora imati statistiku, i sva
  // statistika mora biti potvrđena. Te tri provere pokrivaju sve što je status
  // trebalo da spreči, i daju konkretniju poruku o tome šta tačno fali.

  // Isti dnevnik kao Faza 5 (ingestion_runs) — "kind" razlikuje unos, ostatak
  // kolona se prirodno preklapa (rounds_checked = [broj kola], fixtures_touched
  // = koliko statRows redova je preračunato).
  const { data: run } = await supabase
    .from("ingestion_runs")
    .insert({ kind: "admin_scoring_finalize", triggered_by: triggeredBy, rounds_checked: [gw.number] })
    .select("id")
    .single();

  // Dnevnik se zatvara i kad obračun pukne na validaciji — inače bi red ostao
  // zauvek bez finished_at i na dashboard-u izgledao kao posao "u toku".
  const closeRun = async (touched: number, runErrors: string[]) => {
    if (!run) return;
    await supabase
      .from("ingestion_runs")
      .update({ finished_at: new Date().toISOString(), fixtures_touched: touched, errors: runErrors })
      .eq("id", run.id);
  };

  let statRowsScored = 0;

  try {
    // --- 0) Validacija spremnosti kola ---------------------------------------
    const { data: fixtures } = await supabase
      .from("fixtures")
      .select("id, status")
      .eq("gameweek_id", gameweekId);

    const allFixtures = fixtures ?? [];
    const notDone = allFixtures.filter((f) => f.status !== "finished" && f.status !== "cancelled");
    if (notDone.length > 0) {
      throw new Error(`Kolo ${gw.number}: ${notDone.length} meč(eva) još nije odigrano ili otkazano.`);
    }
    const fixtureIds = allFixtures.map((f) => f.id);

    const rows =
      fixtureIds.length === 0
        ? []
        : await selectAllPages<any>("player_gameweek_stats", (from, to) =>
            supabase
              .from("player_gameweek_stats")
              .select(
                "id, player_id, club_id, fixture_id, minutes_played, goals, assists, clean_sheet, " +
                  "goals_conceded, saves, penalties_saved, penalties_missed, yellow_cards, red_cards, " +
                  "own_goals, bonus_points, is_admin_reviewed, players(position)"
              )
              .in("fixture_id", fixtureIds)
              .order("id", { ascending: true })
              .range(from, to)
          );

    const unreviewed = rows.filter((r) => !r.is_admin_reviewed);
    if (unreviewed.length > 0) {
      throw new Error(
        `Kolo ${gw.number}: ${unreviewed.length} red(ova) statistike još nije potvrđeno ("Sačuvaj i potvrdi" na meču).`
      );
    }

    // Odigran meč BEZ ijednog reda statistike je najopasniji tihi slučaj:
    // provera iznad ga propušta (nema nepotvrđenih redova jer nema redova), pa
    // bi se kolo zaključalo a svi igrači iz tog meča dobili nulu. Otkazan meč
    // je legitimno prazan i ne broji se.
    const fixturesWithRows = new Set(rows.map((r) => r.fixture_id));
    const emptyFinished = allFixtures.filter((f) => f.status === "finished" && !fixturesWithRows.has(f.id));
    if (emptyFinished.length > 0) {
      throw new Error(
        `Kolo ${gw.number}: ${emptyFinished.length} odigran(ih) meč(eva) nema unetu statistiku — ` +
          `otvori ih u admin panelu, povuci sastave i potvrdi pre obračuna.`
      );
    }

    // Iz BILO KOG stanja pre finalized — ne samo iz data_pulled — da ručno
    // unet rezultat ne ostavi kolo zauvek u "upcoming".
    if (gw.status !== "admin_reviewed" && gw.status !== "finalized") {
      await supabase.from("gameweeks").update({ status: "admin_reviewed" }).eq("id", gameweekId);
    }

    // --- 1) fantasy_points po redu, jednim upisom ----------------------------
    type Computed = { playerId: string; clubId: string; minutes: number; points: number };
    const computed: Computed[] = [];
    const pointRows: { id: string; points: number }[] = [];

    for (const row of rows) {
      const position = (row.players as unknown as { position: Position } | null)?.position;
      if (!position) {
        errors.push(`player_gameweek_stats ${row.id}: igrač bez poznate pozicije, preskočeno.`);
        continue;
      }
      const points = calculateRowFantasyPoints({
        position,
        minutes_played: row.minutes_played,
        goals: row.goals,
        assists: row.assists,
        clean_sheet: row.clean_sheet,
        goals_conceded: row.goals_conceded,
        saves: row.saves,
        penalties_saved: row.penalties_saved,
        penalties_missed: row.penalties_missed,
        yellow_cards: row.yellow_cards,
        red_cards: row.red_cards,
        own_goals: row.own_goals,
        bonus_points: row.bonus_points,
      });

      pointRows.push({ id: row.id, points });
      computed.push({ playerId: row.player_id, clubId: row.club_id, minutes: row.minutes_played, points });
    }

    if (pointRows.length > 0) {
      const { error } = await supabase.rpc("score_write_stat_points", { p_rows: pointRows });
      if (error) throw new Error(`Upis fantasy poena nije uspeo: ${error.message}`);
    }
    statRowsScored = computed.length;

    // --- 2) players.total_points keš (SUM cele sezone, u bazi) ---------------
    const touchedPlayerIds = new Set(computed.map((c) => c.playerId));
    {
      const { error } = await supabase.rpc("score_refresh_player_totals", { p_gameweek_id: gameweekId });
      if (error) errors.push(`players.total_points keš: ${error.message}`);
    }

    // --- 3) agregat po igraču ZA OVO KOLO (sabira duplo kolo) ----------------
    const gwPoints = new Map<string, number>();
    const gwMinutes = new Map<string, number>();
    const gwClub = new Map<string, string>();
    for (const c of computed) {
      gwPoints.set(c.playerId, (gwPoints.get(c.playerId) ?? 0) + c.points);
      gwMinutes.set(c.playerId, (gwMinutes.get(c.playerId) ?? 0) + c.minutes);
      gwClub.set(c.playerId, c.clubId); // isti klub u oba meča dupla kola, poslednji upis je ok
    }

    // --- 4) Sve što treba po korisniku, u tri upita umesto tri po korisniku --
    const squadRows = await selectAllPages<any>("squads", (from, to) =>
      supabase
        .from("squads")
        .select("user_id, player_id, is_starting, squad_order, is_captain, is_vice_captain, players(position, club_id)")
        .eq("gameweek_id", gameweekId)
        .order("user_id", { ascending: true })
        .order("player_id", { ascending: true })
        .range(from, to)
    );

    const squadsByUser = new Map<string, any[]>();
    for (const row of squadRows) {
      if (!squadsByUser.has(row.user_id)) squadsByUser.set(row.user_id, []);
      squadsByUser.get(row.user_id)!.push(row);
    }

    const userIds = [...squadsByUser.keys()];

    const profileRows = await selectAllPages<any>("users", (from, to) =>
      supabase.from("users").select("id, favorite_club_id").order("id", { ascending: true }).range(from, to)
    );
    const favoriteClubByUser = new Map<string, string | null>(
      profileRows.map((u) => [u.id, u.favorite_club_id ?? null])
    );

    const chipRows = await selectAllPages<any>("chips_usage", (from, to) =>
      supabase
        .from("chips_usage")
        .select("user_id, chip_type")
        .eq("gameweek_id", gameweekId)
        .order("user_id", { ascending: true })
        .range(from, to)
    );
    const chipByUser = new Map<string, ChipType>(chipRows.map((c) => [c.user_id, c.chip_type as ChipType]));

    const transferRows = await selectAllPages<any>("transfers", (from, to) =>
      supabase
        .from("transfers")
        .select("user_id, points_cost")
        .eq("gameweek_id", gameweekId)
        .order("user_id", { ascending: true })
        .range(from, to)
    );
    const transferCostByUser = new Map<string, number>();
    for (const t of transferRows) {
      transferCostByUser.set(t.user_id, (transferCostByUser.get(t.user_id) ?? 0) + t.points_cost);
    }

    // --- 5) Obračun po korisniku (u memoriji), pa dva skupovna upisa ---------
    const userPointRows: {
      user_id: string;
      raw_points: number;
      transfer_cost: number;
      chip_type_used: ChipType;
      total_points: number;
    }[] = [];
    const autoSubRows: { user_id: string; player_id: string }[] = [];

    for (const userId of userIds) {
      const squadPlayers: SquadPlayerForScoring[] = squadsByUser.get(userId)!.map((r) => {
        const playerMeta = r.players as unknown as { position: Position; club_id: string } | null;
        return {
          playerId: r.player_id,
          position: playerMeta?.position ?? "MID",
          isStarting: r.is_starting,
          squadOrder: r.squad_order,
          isCaptain: r.is_captain,
          isViceCaptain: r.is_vice_captain,
          clubId: gwClub.get(r.player_id) ?? playerMeta?.club_id ?? "",
          minutesPlayed: gwMinutes.get(r.player_id) ?? 0,
          fantasyPoints: gwPoints.get(r.player_id) ?? 0,
        };
      });

      const { effectiveIds, autoSubbedInIds } = resolveEffectiveStartingXI(squadPlayers);
      const chipType = chipByUser.get(userId) ?? null;
      const favoriteClubId = favoriteClubByUser.get(userId) ?? null;
      const { captainId, multiplier: captainMultiplier } = resolveCaptainMultiplier(
        squadPlayers,
        chipType,
        effectiveIds
      );

      let rawPoints = 0;
      let multipliedPoints = 0;
      for (const p of squadPlayers) {
        if (!effectiveIds.has(p.playerId)) continue;
        rawPoints += p.fantasyPoints;

        let mult = 1;
        if (p.playerId === captainId) mult *= captainMultiplier;
        if (chipType === "favorite_club_x2" && favoriteClubId && p.clubId === favoriteClubId) {
          mult *= 2;
        }
        multipliedPoints += p.fantasyPoints * mult;
      }

      const transferCost = transferCostByUser.get(userId) ?? 0;

      userPointRows.push({
        user_id: userId,
        raw_points: rawPoints,
        transfer_cost: transferCost,
        chip_type_used: chipType,
        total_points: multipliedPoints + transferCost,
      });

      for (const playerId of autoSubbedInIds) {
        autoSubRows.push({ user_id: userId, player_id: playerId });
      }
    }

    if (userPointRows.length > 0) {
      const { error } = await supabase.rpc("score_write_user_points", {
        p_gameweek_id: gameweekId,
        p_rows: userPointRows,
      });
      if (error) throw new Error(`Upis korisničkih poena nije uspeo: ${error.message}`);
    }

    // Poziva se i sa praznim nizom — tada samo briše stari trag (ispravka
    // već obračunatog kola u kom auto-sub-a više nema).
    {
      const { error } = await supabase.rpc("score_write_auto_subs", {
        p_gameweek_id: gameweekId,
        p_rows: autoSubRows,
      });
      if (error) errors.push(`Trag o auto-sub izmenama: ${error.message}`);
    }

    // --- 6) Zaključavanje kola SAMO ako je sve prošlo ------------------------
    // Ranije se status postavljao bezuslovno, pa je admin dobijao crvenu
    // poruku nad kolom koje je već zaključano. Kolo sa greškama ostaje na
    // admin_reviewed da se dugme može ponovo kliknuti posle ispravke.
    const finalized = errors.length === 0;
    if (finalized) {
      await supabase.from("gameweeks").update({ status: "finalized" }).eq("id", gameweekId);
    }

    await closeRun(statRowsScored, errors);

    return {
      ok: errors.length === 0,
      gameweekNumber: gw.number,
      statRowsScored,
      playersUpdated: touchedPlayerIds.size,
      usersScored: userPointRows.length,
      finalized,
      errors,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await closeRun(statRowsScored, [...errors, message]);
    throw e;
  }
}
