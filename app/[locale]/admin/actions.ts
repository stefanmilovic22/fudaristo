"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { runResultsIngestion } from "@/lib/ingestion";
import { parseWorldfootballLineup } from "@/lib/worldfootball-parser";
import { runScoringForGameweek } from "@/lib/scoring";
import {
  backfillFixtureIds,
  refreshResults,
  importFixtures,
  type TaskResult,
} from "@/lib/maintenance";

/**
 * Sve akcije ovde prvo prolaze requireAdmin() (redirect ako nije admin), pa
 * tek onda koriste service role klijent za pisanje — isti obrazac kao cron
 * ruta, samo pokrenut od strane admina umesto Vercel Cron-a.
 */

export async function triggerIngestionAction() {
  const { userId } = await requireAdmin();
  const supabase = createServiceRoleClient();
  await runResultsIngestion(supabase, userId);
  revalidatePath("/admin");
}

// ----------------------------------------------------------------------------
// Ručna izmena rezultata/statusa meča
// ----------------------------------------------------------------------------

export async function updateFixtureScoreAction(formData: FormData) {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const fixtureId = String(formData.get("fixtureId"));
  const status = String(formData.get("status"));
  const homeRaw = formData.get("home_score");
  const awayRaw = formData.get("away_score");

  const home_score = homeRaw === "" || homeRaw === null ? null : Number(homeRaw);
  const away_score = awayRaw === "" || awayRaw === null ? null : Number(awayRaw);

  const { error } = await supabase
    .from("fixtures")
    .update({ status, home_score, away_score })
    .eq("id", fixtureId);

  if (error) throw new Error(`Izmena rezultata nije sačuvana: ${error.message}`);

  revalidatePath(`/admin/mecevi/${fixtureId}`);
  revalidatePath("/admin");
}

// ----------------------------------------------------------------------------
// "Povuci sa worldfootball-a"
// ----------------------------------------------------------------------------

export type PullResult = {
  ok: boolean;
  warnings: string[];
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  matchedCount: number;
  unmatchedPageNames: string[];
};

/**
 * Povlači i parsira izveštaj (videti lib/worldfootball-parser.ts — namerno
 * ograničen obim posle testiranja), pa PRIPREMA (seed) player_gameweek_stats
 * redove za SVE igrače oba kluba iz ovog meča, sa is_admin_reviewed=false i
 * svim brojevima na 0. To je "draft" koji admin popunjava i potvrđuje ispod
 * — ništa se ne smatra konačnim dok admin ne klikne "Sačuvaj i potvrdi".
 *
 * Bezbedno je pokrenuti više puta: postojeći redovi (is_admin_reviewed=true)
 * se NE dodiruju ako je fixture već ranije potvrđen — samo redovi koji su i
 * dalje na is_admin_reviewed=false se osvežavaju.
 */
export async function pullWorldfootballAction(
  fixtureId: string,
  url: string
): Promise<PullResult> {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  if (!/^https?:\/\/(www\.)?worldfootball\.net\//.test(url)) {
    throw new Error("To ne izgleda kao worldfootball.net URL.");
  }

  await supabase.from("fixtures").update({ worldfootball_url: url }).eq("id", fixtureId);

  const res = await fetch(url, {
    headers: { "User-Agent": "Fudaristo-admin-pull/1.0 (rucno pokrenuto iz admin panela)" },
  });
  if (!res.ok) throw new Error(`Stranica nije dostupna (HTTP ${res.status}).`);
  const html = await res.text();
  const parsed = parseWorldfootballLineup(html);

  const { data: fixture } = await supabase
    .from("fixtures")
    .select("id, gameweek_id, home_club_id, away_club_id")
    .eq("id", fixtureId)
    .single();
  if (!fixture) throw new Error("Meč nije nađen.");

  const { data: squadPlayers } = await supabase
    .from("players")
    .select("id, first_name, last_name, club_id")
    .in("club_id", [fixture.home_club_id, fixture.away_club_id]);

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const pageNamesNormalized = parsed.players.map((p) => normalize(p.nameOnPage));
  const matched: string[] = [];

  for (const player of squadPlayers ?? []) {
    const lastName = normalize(player.last_name);
    const appearsOnPage = pageNamesNormalized.some((n) => n.includes(lastName) || lastName.includes(n));
    if (appearsOnPage) matched.push(`${player.first_name} ${player.last_name}`);

    // is_admin_reviewed=false znači "još nije potvrđeno" — upsert ovde samo
    // ako red NE POSTOJI ili je i dalje neuspoređen, da se ne prepiše
    // fixture koji je admin već ranije pregledao i potvrdio.
    const { data: existing } = await supabase
      .from("player_gameweek_stats")
      .select("id, is_admin_reviewed")
      .eq("player_id", player.id)
      .eq("fixture_id", fixtureId)
      .maybeSingle();

    if (existing?.is_admin_reviewed) continue;

    await supabase.from("player_gameweek_stats").upsert(
      {
        player_id: player.id,
        club_id: player.club_id,
        gameweek_id: fixture.gameweek_id,
        fixture_id: fixtureId,
        raw_api_data: { source: "worldfootball", appears_on_page: appearsOnPage, pulled_at: new Date().toISOString() },
        is_admin_reviewed: false,
      },
      { onConflict: "player_id,fixture_id" }
    );
  }

  const unmatchedPageNames = parsed.players
    .filter((p) => {
      const n = normalize(p.nameOnPage);
      return !(squadPlayers ?? []).some((pl: any) => {
        const ln = normalize(pl.last_name);
        return n.includes(ln) || ln.includes(n);
      });
    })
    .map((p) => p.nameOnPage);

  revalidatePath(`/admin/mecevi/${fixtureId}`);

  return {
    ok: true,
    warnings: parsed.warnings,
    homeTeamName: parsed.homeTeamName,
    awayTeamName: parsed.awayTeamName,
    homeScore: parsed.homeScore,
    awayScore: parsed.awayScore,
    matchedCount: matched.length,
    unmatchedPageNames,
  };
}

// ----------------------------------------------------------------------------
// Čuvanje i potvrda unetih statistika
// ----------------------------------------------------------------------------

const STAT_FIELDS = [
  "minutes_played",
  "goals",
  "assists",
  "goals_conceded",
  "saves",
  "penalties_saved",
  "penalties_missed",
  "yellow_cards",
  "red_cards",
  "own_goals",
  "bonus_points",
] as const;

/**
 * Čita jedan veliki <form> (jedan red po igraču, polja imenovana
 * stats[<playerId>][<field>]), upisuje sve vrednosti i postavlja
 * is_admin_reviewed=true za ceo meč. clean_sheet se izvodi iz
 * goals_conceded=0 I minutes_played>=60 (FPL konvencija), ne unosi se
 * direktno.
 *
 * bonus_points (GDD sekcija 10, "najbolji u meču", 1-3) je jedino polje koje
 * admin unosi po sopstvenoj proceni — u bazi nema sirovih statistika iz kojih
 * bi se pravi BPS mogao izračunati (defanzivni doprinos je svesno preskočen,
 * sekcija 10), pa je ovo ručno kao i sve što automatika ne pokriva. 0 ako se
 * ne unese.
 */
export async function saveWorldfootballStatsAction(formData: FormData) {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const fixtureId = String(formData.get("fixtureId"));
  const playerIds = new Set<string>();
  for (const key of formData.keys()) {
    const m = key.match(/^stats\[([^\]]+)\]/);
    if (m) playerIds.add(m[1]);
  }

  const errors: string[] = [];
  for (const playerId of playerIds) {
    const values: Record<string, number> = {};
    for (const field of STAT_FIELDS) {
      const raw = formData.get(`stats[${playerId}][${field}]`);
      values[field] = raw === "" || raw === null ? 0 : Number(raw);
    }
    const clean_sheet = values.goals_conceded === 0 && values.minutes_played >= 60;

    const { error } = await supabase
      .from("player_gameweek_stats")
      .update({ ...values, clean_sheet, is_admin_reviewed: true })
      .eq("player_id", playerId)
      .eq("fixture_id", fixtureId);

    if (error) errors.push(`${playerId}: ${error.message}`);
  }

  if (errors.length > 0) throw new Error(`Neki redovi nisu sačuvani: ${errors.join("; ")}`);

  revalidatePath(`/admin/mecevi/${fixtureId}`);
  revalidatePath("/admin");
}

// ----------------------------------------------------------------------------
// Faza 6 — obračun poena za kolo
// ----------------------------------------------------------------------------

/**
 * "Obračunaj poene" dugme na /admin. Validacija (svi mečevi gotovi, sva
 * statistika potvrđena) i sav upis su u lib/scoring.ts — ovo je samo tanak
 * omotač koji prolazi kroz requireAdmin() i prijavljuje grešku formom kao i
 * ostale admin akcije.
 *
 * Namerno bez statusne provere ovde (dozvoljeno i nad admin_reviewed i nad
 * finalized) — runScoringForGameweek() je bezbedan za ponovno pokretanje,
 * pa ovo dugme radi i kao "ispravi i prekalkuliši" posle finalizacije.
 */
export async function finalizeGameweekAction(formData: FormData) {
  const { userId } = await requireAdmin();
  const supabase = createServiceRoleClient();

  const gameweekId = String(formData.get("gameweekId"));
  const result = await runScoringForGameweek(supabase, gameweekId, userId);

  if (!result.ok) {
    // Kolo NIJE zaključano u ovom slučaju (ostaje na admin_reviewed) — admin
    // ispravi šta piše u poruci i klikne isto dugme ponovo.
    throw new Error(
      `Kolo ${result.gameweekNumber}: obračun nije zaključan — ${result.errors.join("; ")}`
    );
  }

  revalidatePath("/admin");
  revalidatePath("/liga");
  revalidatePath("/statistike");
}

// ----------------------------------------------------------------------------
// Prozor za Joker #1 (zimska pauza)
// ----------------------------------------------------------------------------

/**
 * Joker #2 ("prelazak u plej-of") migracija 008 sama postavlja na prvo kolo
 * van 'regular' faze — to se da izvesti iz gameweeks.phase. Joker #1
 * ("zimska pauza") se NE da: nijedna kolona u šemi ne opisuje pauzu. Zato ga
 * admin bira ovde, jednom po sezoni.
 *
 * Prazna vrednost skida prozor, čime Joker #1 prestaje da se nudi ikome
 * (activate_chip ga odbija van prozora). Unikatan indeks na joker_window
 * garantuje da postoji najviše jedno takvo kolo — zato se prvo briše stari.
 */
export async function setJokerWindowAction(formData: FormData) {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const gameweekId = String(formData.get("gameweekId") ?? "");

  const { error: clearError } = await supabase
    .from("gameweeks")
    .update({ joker_window: null })
    .eq("joker_window", "joker_1");
  if (clearError) throw new Error(`Stari prozor nije uklonjen: ${clearError.message}`);

  if (gameweekId) {
    const { error } = await supabase
      .from("gameweeks")
      .update({ joker_window: "joker_1" })
      .eq("id", gameweekId);
    if (error) throw new Error(`Prozor nije postavljen: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/moj-tim");
}

// ----------------------------------------------------------------------------
// Održavanje kalendara — isto što i CLI skripte, samo iz panela
// ----------------------------------------------------------------------------

/**
 * Ove tri akcije VRAĆAJU rezultat pozivaocu umesto da samo osveže stranicu —
 * zato ih zove klijentska komponenta (MaintenancePanel), ne <form action>.
 * Poslu koji zove spoljni API treba i ispis, ne samo "gotovo": koji meč je
 * ažuriran, šta nije upareno, koliko je ostalo.
 *
 * Logika je u lib/maintenance.ts i deljena je sa skriptama u scripts/, da se
 * ne razidje — isti obrazac kao lib/ingestion.ts između cron-a i panela.
 *
 * ⚠️ Trajanje: app/admin/page.tsx nosi `export const maxDuration = 60`, jer
 * pozivi ka TheSportsDB-u imaju razmak zbog rate limita i podrazumevanih 10s
 * na Vercel Hobby planu nije dovoljno. refreshResultsAction zato radi u
 * porcijama i vraća `remaining`.
 */

export async function backfillFixtureIdsAction(apply: boolean): Promise<TaskResult> {
  await requireAdmin();
  const supabase = createServiceRoleClient();
  const result = await backfillFixtureIds(supabase, { apply });
  if (apply) revalidatePath("/admin");
  return result;
}

export async function refreshResultsAction(): Promise<TaskResult> {
  await requireAdmin();
  const supabase = createServiceRoleClient();
  // 15 mečeva × 1.5s pauze ≈ 23s + mrežno vreme — staje u 60s sa rezervom.
  const result = await refreshResults(supabase, { limit: 15 });
  revalidatePath("/admin");
  revalidatePath("/raspored");
  return result;
}

export async function importFixturesAction(): Promise<TaskResult> {
  await requireAdmin();
  const supabase = createServiceRoleClient();
  const result = await importFixtures(supabase);
  revalidatePath("/admin");
  revalidatePath("/raspored");
  return result;
}
