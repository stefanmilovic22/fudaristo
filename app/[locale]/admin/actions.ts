"use server";

import { revalidatePath as nextRevalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  BROWSER_HEADERS,
  fetchReportIndex,
  findReportUrl,
} from "@/lib/worldfootball-fixtures";
import { runResultsIngestion } from "@/lib/ingestion";
import {
  parseWorldfootballLineup,
  extractMatchStats,
  extractMatchStatsFromText,
  type ExtractedMatch,
} from "@/lib/worldfootball-parser";
import { parseEspnSummary, extractEspnEventId } from "@/lib/espn-parser";
import { findEspnLinksForFixtures, type EspnLinksResult } from "@/lib/espn-fixtures";
import { runScoringForGameweek } from "@/lib/scoring";

import {
  backfillFixtureIds,
  refreshResults,
  importFixtures,
  type TaskResult,
} from "@/lib/maintenance";
import { parseSofascoreIncidents, parseSofascoreLineups, parseSofascoreLineupsObject } from "@/lib/sofascore-parser";
import type { Position } from "@/lib/fantasy-rules";
import { diffMatchEvents, eventsToPlayers, findPlayer, type EventDiffRow, type OurStatRow, type SquadPlayer } from "@/lib/sofascore-events";
import { mapMissingStatus, parseInjuriesFile, type PlayerStatus } from "@/lib/sofascore-injuries";
import { teamNamesMatch } from "@/lib/team-names";
import { selectAllPages } from "@/lib/db-paging";
import { countTransfers, suggestPrice } from "@/lib/price-rules";

/**
 * Svaka admin izmena podataka poništava i keš javnih podataka (statistike,
 * raspored, liga, igrači — lib/cached-data.ts), ne samo stranicu. Inače bi
 * posetioci do 60s videli stare rezultate.
 */
function revalidatePath(path: string) {
  nextRevalidatePath(path);
  revalidateTag("public-data", { expire: 0 });
}

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
    headers: BROWSER_HEADERS,
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
      .replace(/[̀-ͯ]/g, "");

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

  // Priprema pravi red za SVAKOG igrača oba kluba — oko 60 po meču. Red po red
  // to je 60 uzastopnih HTTP poziva i traje neprijatno dugo; u grupama po 20
  // paralelno je isti posao za tri kruga. Ograničenje na 20 je zato da se ne
  // otvori šezdeset konekcija odjednom.
  const ids = [...playerIds];
  const CHUNK = 20;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const results = await Promise.all(
      chunk.map(async (playerId) => {
        const values: Record<string, number> = {};
        for (const field of STAT_FIELDS) {
          const raw = formData.get(`stats[${playerId}][${field}]`);
          values[field] = raw === "" || raw === null ? 0 : Number(raw);
        }
        // Čista mreža se IZVODI, ne unosi: igrač mora da odigra bar 60 minuta
        // i da njegov tim ne primi gol. Ručni unos tog polja bi bio još jedna
        // prilika za grešku.
        const clean_sheet = values.goals_conceded === 0 && values.minutes_played >= 60;

        const { error } = await supabase
          .from("player_gameweek_stats")
          .update({ ...values, clean_sheet, is_admin_reviewed: true })
          .eq("player_id", playerId)
          .eq("fixture_id", fixtureId);

        return error ? `${playerId}: ${error.message}` : null;
      })
    );
    errors.push(...results.filter((r): r is string => r !== null));
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

// ----------------------------------------------------------------------------
// Priprema statistike za celo kolo
// ----------------------------------------------------------------------------

export type PrepareResult = {
  prepared: number;
  alreadyHadStats: number;
  seededRows: number;
  failed: { fixture: string; reason: string }[];
  /** Poruka ako URL-ovi nisu mogli da se povuku — priprema je svejedno gotova. */
  urlNote?: string;
};

/**
 * Za SVE mečeve kola koji još nemaju statistiku: nađi worldfootball izveštaj,
 * upiši mu URL i pripremi redove za unos.
 *
 * Ovo zamenjuje sedam ručnih koraka (otvori worldfootball → nađi meč →
 * kopiraj URL → otvori meč u panelu → nalepi → povuci) jednim klikom.
 *
 * ⚠️ NE OBRAČUNAVA POENE I NE POTVRĐUJE STATISTIKU, i to nije propust.
 * Parser namerno ne izvlači minute, golove, asistencije ni kartone — ranija
 * verzija je to pokušavala i pripisivala golove pogrešnim igračima (videti
 * komentar u lib/worldfootball-parser.ts). Automatsko potvrđivanje praznih
 * redova bi svakom igraču upisalo 0 minuta: auto-sub bi zamenio ceo tim, svi
 * bi dobili nulu, a kolo bi se zaključalo kao da je sve u redu. Brojeve i
 * dalje upisuje čovek, gledajući u isti izveštaj.
 */
export async function prepareGameweekStatsAction(gameweekId: string): Promise<PrepareResult> {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const { data: fixtures, error } = await supabase
    .from("fixtures")
    .select("id, gameweek_id, home_club_id, away_club_id, worldfootball_url, home:home_club_id(name), away:away_club_id(name)")
    .eq("gameweek_id", gameweekId)
    .eq("status", "finished");
  if (error) throw new Error(error.message);

  const result: PrepareResult = { prepared: 0, alreadyHadStats: 0, failed: [], seededRows: 0 };
  if (!fixtures || fixtures.length === 0) return result;

  const { data: existingRows } = await supabase
    .from("player_gameweek_stats")
    .select("fixture_id")
    .in("fixture_id", fixtures.map((f: any) => f.id));
  const withStats = new Set((existingRows ?? []).map((r: any) => r.fixture_id));

  const todo = fixtures.filter((f: any) => !withStats.has(f.id));
  result.alreadyHadStats = fixtures.length - todo.length;
  if (todo.length === 0) return result;

  // Svi igrači svih klubova iz ovih mečeva, jednim upitom.
  const clubIds = [...new Set(todo.flatMap((f: any) => [f.home_club_id, f.away_club_id]))];
  const { data: players } = await supabase
    .from("players")
    .select("id, club_id")
    .in("club_id", clubIds);

  const byClub = new Map<string, { id: string; club_id: string }[]>();
  for (const p of (players ?? []) as any[]) {
    if (!byClub.has(p.club_id)) byClub.set(p.club_id, []);
    byClub.get(p.club_id)!.push(p);
  }

  for (const fixture of todo) {
    const label = `${(fixture.home as any)?.name ?? "?"} — ${(fixture.away as any)?.name ?? "?"}`;
    const roster = [
      ...(byClub.get(fixture.home_club_id) ?? []),
      ...(byClub.get(fixture.away_club_id) ?? []),
    ];

    if (roster.length === 0) {
      result.failed.push({ fixture: label, reason: "Nijedan igrač ovih klubova nije u bazi." });
      continue;
    }

    // Jedan upsert po meču umesto reda po reda. Za 7 mečeva × ~50 igrača to je
    // 7 poziva umesto 700 — isti razlog kao u scoring engine-u.
    const { error: seedError } = await supabase.from("player_gameweek_stats").upsert(
      roster.map((p) => ({
        player_id: p.id,
        club_id: p.club_id,
        gameweek_id: fixture.gameweek_id,
        fixture_id: fixture.id,
        raw_api_data: { source: "roster", seeded_at: new Date().toISOString() },
        is_admin_reviewed: false,
      })),
      { onConflict: "player_id,fixture_id", ignoreDuplicates: false }
    );

    if (seedError) {
      result.failed.push({ fixture: label, reason: seedError.message });
      continue;
    }

    result.prepared++;
    result.seededRows += roster.length;
  }

  // Worldfootball URL je POGODNOST, ne uslov: admin ga otvara da gleda brojeve
  // dok ih upisuje. Ako sajt odbije zahtev (403 sa servera je čest — blokiraju
  // po User-Agentu i po IP opsegu), priprema je već završena i to se ovde samo
  // prijavljuje kao napomena.
  const needUrl = todo.filter((f: any) => !f.worldfootball_url);
  if (needUrl.length > 0) {
    try {
      const index = await fetchReportIndex();
      for (const fixture of needUrl) {
        const found = findReportUrl(
          index,
          (fixture.home as any)?.name ?? "",
          (fixture.away as any)?.name ?? ""
        );
        if (found.url !== null) {
          await supabase
            .from("fixtures")
            .update({ worldfootball_url: found.url })
            .eq("id", fixture.id);
        }
      }
    } catch (e) {
      result.urlNote = e instanceof Error ? e.message : String(e);
    }
  }

  revalidatePath("/admin");
  return result;
}

// ----------------------------------------------------------------------------
// Preskakanje kola
// ----------------------------------------------------------------------------

/**
 * Zatvara kolo BEZ obračuna. Za kola odigrana pre nego što je iko imao sastav
 * — obračun bi im dodelio poene nikome, a zaključavanje kao "finalized" bi
 * kasnije izgledalo kao da je obračun urađen pa nešto nije radilo.
 */
export async function skipGameweekAction(formData: FormData) {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const gameweekId = String(formData.get("gameweekId") ?? "");
  if (!gameweekId) throw new Error("Kolo nije prosleđeno.");

  const { count } = await supabase
    .from("user_gameweek_points")
    .select("id", { count: "exact", head: true })
    .eq("gameweek_id", gameweekId);

  if ((count ?? 0) > 0) {
    throw new Error(
      `Ovo kolo već ima obračunate poene za ${count} korisnika — ne može se označiti kao preskočeno.`
    );
  }

  const { error } = await supabase
    .from("gameweeks")
    .update({ status: "skipped" })
    .eq("id", gameweekId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

// ----------------------------------------------------------------------------
// Automatsko punjenje statistike — PREGLED pa PRIMENA
// ----------------------------------------------------------------------------

export type PreviewRow = {
  playerId: string;
  playerName: string;
  clubName: string;
  minutes_played: number;
  goals: number;
  assists: number;
  goals_conceded: number;
  yellow_cards: number;
  red_cards: number;
  own_goals: number;
  /** Šta je parser stvarno našao, a šta je ostalo na nuli jer nije znao. */
  filled: boolean;
};

export type PreviewResult = {
  rows: PreviewRow[];
  warnings: string[];
  homeScore: number | null;
  awayScore: number | null;
  matchedCount: number;
  unmatchedPageNames: string[];
};

/**
 * Pročita izveštaj i vrati ŠTA BI UPISAO — bez ijednog upisa u bazu.
 *
 * Odvojeno od primene namerno. Parser radi na strukturi stranice koju ne
 * kontrolišemo; ako se sajt promeni ili obrazac ne odgovara, rezultat može
 * biti prazan ili pogrešan. Pregled znači da to vidiš pre nego što uđe u
 * bazu, umesto da otkrivaš posle obračuna.
 */
/**
 * Zajedničko za oba puta (URL i nalepljen tekst): upari izvučene igrače sa
 * našom bazom i napravi redove pregleda.
 */
async function buildPreview(
  fixtureId: string,
  extracted: ExtractedMatch
): Promise<PreviewResult> {
  const supabase = createServiceRoleClient();

  const { data: fixture } = await supabase
    .from("fixtures")
    .select("home_club_id, away_club_id")
    .eq("id", fixtureId)
    .maybeSingle();
  if (!fixture) throw new Error("Meč nije nađen.");

  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, club_id, clubs(name)")
    .in("club_id", [fixture.home_club_id, fixture.away_club_id]);

  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

  const keyOf = (p: { worldfootballId: number | null; nameOnPage: string }) =>
    p.worldfootballId !== null ? `id:${p.worldfootballId}` : `name:${p.nameOnPage.toLowerCase()}`;

  const rows: PreviewRow[] = [];
  const usedPageKeys = new Set<string>();

  for (const player of (players ?? []) as any[]) {
    const lastName = normalize(player.last_name);
    const hit = extracted.players.find((p) => {
      const n = normalize(p.nameOnPage);
      return n === lastName || n.endsWith(" " + lastName) || n.includes(lastName);
    });

    const isHomeClub = player.club_id === fixture.home_club_id;
    const resolvedMinutes = hit ? (hit.minutesPlayed === null ? 90 : hit.minutesPlayed) : 0;

    // Primljeni golovi se računaju po MINUTIMA, ne kao pun rezultat meča.
    // Igrač koji je ušao u 80. minutu pri 3:0 nije primio ta tri gola, a
    // igrač koji je izašao u 20. nije primio one posle. Bez minuta golova to
    // se nije moglo razlikovati; sad se može.
    const onFrom = hit?.cameOnAt ?? 0;
    const onUntil = hit?.cameOnAt != null ? 90 : resolvedMinutes;

    let goalsConceded = 0;
    if (resolvedMinutes > 0) {
      const goalMinutes = extracted.goalMinutes;
      if (goalMinutes && goalMinutes.length > 0) {
        goalsConceded = goalMinutes.filter(
          (g) => g.forHome === !isHomeClub && g.minute >= onFrom && g.minute <= onUntil
        ).length;
      } else {
        // Bez minuta golova ostaje pun rezultat — grublje, ali vidljivo u pregledu.
        goalsConceded = isHomeClub ? extracted.awayScore ?? 0 : extracted.homeScore ?? 0;
      }
    }

    if (hit) usedPageKeys.add(keyOf(hit));

    rows.push({
      playerId: player.id,
      playerName: `${player.first_name} ${player.last_name}`,
      clubName: (player.clubs as any)?.name ?? "?",
      minutes_played: resolvedMinutes,
      goals: hit?.goals ?? 0,
      assists: hit?.assists ?? 0,
      goals_conceded: goalsConceded,
      yellow_cards: hit?.yellowCards ?? 0,
      red_cards: hit?.redCards ?? 0,
      own_goals: hit?.ownGoals ?? 0,
      filled: Boolean(hit),
    });
  }

  return {
    rows: rows.sort(
      (a, b) => b.minutes_played - a.minutes_played || a.playerName.localeCompare(b.playerName, "sr")
    ),
    warnings: extracted.warnings,
    homeScore: extracted.homeScore,
    awayScore: extracted.awayScore,
    matchedCount: usedPageKeys.size,
    unmatchedPageNames: extracted.players
      .filter((p) => !usedPageKeys.has(keyOf(p)))
      .map((p) => p.nameOnPage),
  };
}

/**
 * Pregled iz URL-a. Radi samo ako worldfootball prihvati zahtev sa servera —
 * često ne prihvata (HTTP 403 za data centre). Tada se koristi nalepljen tekst.
 */
export async function previewWorldfootballAction(
  fixtureId: string,
  url: string
): Promise<PreviewResult> {
  await requireAdmin();

  if (!/^https?:\/\/(www\.)?worldfootball\.net\//.test(url)) {
    throw new Error("To ne izgleda kao worldfootball.net URL.");
  }

  const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new Error(
      res.status === 403
        ? "Worldfootball odbija zahtev sa servera (HTTP 403). Otvori stranicu u pregledaču, kopiraj je celu i nalepi ispod."
        : `Stranica nije dostupna (HTTP ${res.status}).`
    );
  }

  return buildPreview(fixtureId, extractMatchStats(await res.text()));
}

/**
 * Pregled iz NALEPLJENOG sadržaja.
 *
 * Zaobilazi blokadu potpuno: stranicu dohvata tvoj pregledač, ne naš server.
 * Prima i HTML (ako je kopiran izvor stranice) i običan tekst (Ctrl+A, Ctrl+C
 * sa prikazane stranice) — HTML nosi više podataka, pa se prepoznaje i koristi
 * kad postoji.
 */
export async function previewPastedAction(
  fixtureId: string,
  pasted: string
): Promise<PreviewResult> {
  await requireAdmin();

  const trimmed = pasted.trim();
  if (trimmed.length < 50) {
    throw new Error("Nalepljeni sadržaj je prekratak — kopiraj celu stranicu sa postavama.");
  }

  const looksLikeHtml = /<(table|tr|div|a\s)/i.test(trimmed);
  const extracted = looksLikeHtml
    ? extractMatchStats(trimmed)
    : extractMatchStatsFromText(trimmed);

  return buildPreview(fixtureId, extracted);
}

// ----------------------------------------------------------------------------
// Alternativa worldfootball-u — ESPN-ov nezvaničan JSON API
// ----------------------------------------------------------------------------

const ESPN_SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/gre.1/summary";

/**
 * Isti PreviewResult oblik kao worldfootball tok (deli buildPreview i
 * applyWorldfootballStatsAction) — samo drugi izvor podataka. Videti
 * lib/espn-parser.ts za detalje i zašto je ovo DODATNA opcija, ne zamena
 * (nedokumentovan endpoint, ESPN ga može ugasiti bez najave).
 */
export async function previewEspnAction(fixtureId: string, input: string): Promise<PreviewResult> {
  await requireAdmin();

  const eventId = extractEspnEventId(input);
  if (!eventId) {
    throw new Error(
      "Nisam prepoznao ESPN event ID — nalepi ceo ESPN link meča (sa gameId) ili sam broj event ID-ja."
    );
  }

  const res = await fetch(`${ESPN_SUMMARY_URL}?event=${eventId}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`ESPN stranica nije dostupna (HTTP ${res.status}).`);

  const json = await res.json();
  const extracted = parseEspnSummary(json);
  return buildPreview(fixtureId, extracted);
}

export type { EspnLinksResult };

/**
 * "Nađi ESPN linkove" dugme na kartici kola — isto što i
 * `npm run find-espn-links`, samo iz panela. Ne piše ništa u bazu, samo vrati
 * spisak (link ili "nije nađen") da admin ručno nalepi svaki u previewEspnAction.
 */
export async function findEspnLinksAction(gameweekId: string): Promise<EspnLinksResult> {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const { data: fixtures, error } = await supabase
    .from("fixtures")
    .select("id, kickoff_at, home:home_club_id(name), away:away_club_id(name)")
    .eq("gameweek_id", gameweekId)
    .order("kickoff_at");
  if (error) throw new Error(error.message);

  const mapped = (fixtures ?? []).map((f: any) => ({
    id: f.id,
    kickoff_at: f.kickoff_at,
    homeClubName: f.home?.name ?? "?",
    awayClubName: f.away?.name ?? "?",
  }));

  return findEspnLinksForFixtures(mapped);
}

/**
 * Upisuje pregledane vrednosti — i dalje kao NEPOTVRĐENE.
 *
 * Potvrda ostaje zaseban, svestan klik na formi ispod. Automatsko punjenje
 * skraćuje kucanje, ne zamenjuje pregled: obračun i dalje traži da je čovek
 * pogledao svaki meč.
 *
 * ⚠️ ISPRAVKA: ranije je ovo radilo `.update()` — ako `player_gameweek_stats`
 * red za tog igrača i taj fixture NIJE prethodno postojao (npr. kolo nikad
 * nije "pripremljeno" preko "Pripremi statistiku" ni "Povuci sa
 * worldfootball-a" za ovaj meč), UPDATE pogodi 0 redova, NE javi grešku, i
 * ništa se ne upiše — u tabeli ispod ostane sve na 0 kao da dugme "Primeni"
 * nije ni pritisnuto. Zato je sada `.upsert()`, sa `club_id` domečitanim po
 * igraču (mora se popuniti i kod insert-a, NOT NULL kolona u šemi).
 */
export async function applyWorldfootballStatsAction(fixtureId: string, rows: PreviewRow[]) {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const { data: fixture } = await supabase
    .from("fixtures")
    .select("gameweek_id")
    .eq("id", fixtureId)
    .maybeSingle();
  if (!fixture) throw new Error("Meč nije nađen.");

  const { data: playerClubs } = await supabase
    .from("players")
    .select("id, club_id")
    .in("id", rows.map((r) => r.playerId));
  const clubIdByPlayer = new Map((playerClubs ?? []).map((p: any) => [p.id, p.club_id]));

  const CHUNK = 20;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const results = await Promise.all(
      rows.slice(i, i + CHUNK).map(async (r) => {
        const club_id = clubIdByPlayer.get(r.playerId);
        if (!club_id) return `${r.playerName}: klub nije nađen`;

        const clean_sheet = r.goals_conceded === 0 && r.minutes_played >= 60;
        const { error } = await supabase.from("player_gameweek_stats").upsert(
          {
            player_id: r.playerId,
            club_id,
            gameweek_id: fixture.gameweek_id,
            fixture_id: fixtureId,
            minutes_played: r.minutes_played,
            goals: r.goals,
            assists: r.assists,
            goals_conceded: r.goals_conceded,
            yellow_cards: r.yellow_cards,
            red_cards: r.red_cards,
            own_goals: r.own_goals,
            clean_sheet,
            // NAMERNO false: popunjeno je, ali nije pregledano.
            is_admin_reviewed: false,
          },
          { onConflict: "player_id,fixture_id" }
        );
        return error ? `${r.playerName}: ${error.message}` : null;
      })
    );
    errors.push(...results.filter((x): x is string => x !== null));
  }

  if (errors.length > 0) throw new Error(`Neki redovi nisu upisani: ${errors.join("; ")}`);

  revalidatePath(`/admin/mecevi/${fixtureId}`);
  revalidatePath("/admin");
  return { written: rows.length };
}

// ----------------------------------------------------------------------------
// SofaScore ocene — "paste JSON" tok (server ne zove SofaScore, videti
// komentar u lib/sofascore-parser.ts za zašto). Dva koraka: preview (parsira +
// predlaže uparivanje, ne piše ništa) pa confirm (upisuje SAMO sofascore_rating,
// ne dira ostale kolone/ne pravi nove redove za igrače koji nisu odigrali).
// ----------------------------------------------------------------------------

export type SofascoreRatingPreviewRow = {
  sofaName: string;
  sofaPosition: Position;
  rating: number;
  /** Predloženo po imenu — admin može da promeni pre potvrde. */
  matchedPlayerId: string | null;
};

export type SofascoreRatingPreview = {
  confirmed: boolean;
  warnings: string[];
  rows: SofascoreRatingPreviewRow[];
  /** Ceo sastav oba kluba iz ovog meča — za padajući meni ako predlog fali/greši. */
  squadPlayers: { id: string; name: string; position: Position }[];
};

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export async function previewSofascoreRatingsAction(
  fixtureId: string,
  jsonText: string
): Promise<SofascoreRatingPreview> {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const { data: fixture } = await supabase
    .from("fixtures")
    .select("id, home_club_id, away_club_id")
    .eq("id", fixtureId)
    .single();
  if (!fixture) throw new Error("Meč nije nađen.");

  const { data: squadPlayers } = await supabase
    .from("players")
    .select("id, first_name, last_name, position")
    .in("club_id", [fixture.home_club_id, fixture.away_club_id]);

  const squad = (squadPlayers ?? []).map((p: any) => ({
    id: p.id as string,
    name: `${p.first_name} ${p.last_name}`.trim(),
    position: p.position as Position,
  }));

  const parsed = parseSofascoreLineups(jsonText);

  // Samo igrači koji su stvarno odigrali (rating !== null) — nema smisla
  // prikazivati neiskorišćene rezerve u pregledu za upis ocene.
  const rows: SofascoreRatingPreviewRow[] = parsed.players
    .filter((p) => p.rating !== null)
    .map((p) => {
      const n = normalizeName(p.name);
      const match = squad.find((s: { id: string; name: string; position: Position }) => {
        const ln = normalizeName(s.name.split(" ").slice(-1)[0]);
        return ln.length > 0 && (n.includes(ln) || ln.includes(n));
      });
      return {
        sofaName: p.name,
        sofaPosition: p.position,
        rating: p.rating as number,
        matchedPlayerId: match?.id ?? null,
      };
    });

  return { confirmed: parsed.confirmed, warnings: parsed.warnings, rows, squadPlayers: squad };
}

export async function confirmSofascoreRatingsAction(
  fixtureId: string,
  entries: { playerId: string; rating: number }[]
): Promise<{ written: number }> {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const { data: fixture } = await supabase
    .from("fixtures")
    .select("id, gameweek_id")
    .eq("id", fixtureId)
    .single();
  if (!fixture) throw new Error("Meč nije nađen.");

  const { data: players } = await supabase
    .from("players")
    .select("id, club_id")
    .in(
      "id",
      entries.map((e) => e.playerId)
    );
  const clubByPlayer = new Map((players ?? []).map((p: any) => [p.id as string, p.club_id as string]));

  const errors: string[] = [];
  await Promise.all(
    entries.map(async (e) => {
      const clubId = clubByPlayer.get(e.playerId);
      if (!clubId) {
        errors.push(`${e.playerId}: igrač nije nađen.`);
        return;
      }
      const { error } = await supabase.from("player_gameweek_stats").upsert(
        {
          player_id: e.playerId,
          club_id: clubId,
          gameweek_id: fixture.gameweek_id,
          fixture_id: fixtureId,
          sofascore_rating: e.rating,
        },
        { onConflict: "player_id,fixture_id" }
      );
      if (error) errors.push(`${e.playerId}: ${error.message}`);
    })
  );

  if (errors.length > 0) throw new Error(`Neke ocene nisu upisane: ${errors.join("; ")}`);

  revalidatePath(`/admin/mecevi/${fixtureId}`);
  return { written: entries.length };
}

// ----------------------------------------------------------------------------
// SofaScore ocene — BULK unos (backfill više kola odjednom). Fajl dolazi iz
// browser-konzola skripte (data je admin-u posebno, nije deo koda ovde) koja,
// iz NJEGOVOG browsera, prođe kroz .../events/round/{n} pa .../lineups za
// svaki odigran meč, i spakuje sve u {matches: [{sofaEventId, homeTeam,
// awayTeam, round, lineups}]}.
//
// Isti dvokoračni princip kao pojedinačni meč: preview (upari mečeve I
// igrače, ne piše ništa) pa confirm.
// ----------------------------------------------------------------------------

export type SofascoreBulkMatch = {
  sofaEventId: number | string;
  sofaHomeTeam: string;
  sofaAwayTeam: string;
  round: number | null;
  matchedFixtureId: string | null;
  /** "Levadiakos — Olympiacos (kolo 5)" — za prikaz kad NIJE nađen naš meč. */
  label: string;
  rows: SofascoreRatingPreviewRow[];
  squadPlayers: { id: string; name: string; position: Position }[];
  warnings: string[];
};

export type SofascoreBulkPreview = {
  matches: SofascoreBulkMatch[];
};

export async function previewSofascoreBulkAction(bulkJsonText: string): Promise<SofascoreBulkPreview> {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  let bulk: any;
  try {
    bulk = JSON.parse(bulkJsonText);
  } catch {
    throw new Error("Ovo nije validan JSON — proveri da li je ceo fajl učitan.");
  }
  const bulkMatches: any[] = Array.isArray(bulk?.matches) ? bulk.matches : [];
  if (bulkMatches.length === 0) throw new Error("Fajl ne sadrži nijedan meč ('matches' je prazno).");

  const { data: fixtures } = await supabase
    .from("fixtures")
    .select("id, home_club_id, away_club_id, home:home_club_id(name), away:away_club_id(name), gameweeks!gameweek_id(number)");

  const { data: allPlayers } = await supabase.from("players").select("id, first_name, last_name, position, club_id");
  const playersByClub = new Map<string, { id: string; name: string; position: Position }[]>();
  for (const p of (allPlayers ?? []) as any[]) {
    const list = playersByClub.get(p.club_id) ?? [];
    list.push({ id: p.id, name: `${p.first_name} ${p.last_name}`.trim(), position: p.position as Position });
    playersByClub.set(p.club_id, list);
  }

  const matches: SofascoreBulkMatch[] = bulkMatches.map((m) => {
    const homeTeam = String(m.homeTeam ?? "?");
    const awayTeam = String(m.awayTeam ?? "?");
    const round = typeof m.round === "number" ? m.round : null;
    const label = `${homeTeam} — ${awayTeam}${round !== null ? ` (kolo ${round})` : ""}`;
    const warnings: string[] = [];

    // Liga se igra na dva kruga (svaki par klubova igra i kod i gost tokom
    // sezone), pa "obrnut redosled dozvoljen" bez ograničenja na kolo uvek
    // nalazi OBA kruga kao kandidate. Prvo pokušaj TAČNO kolo (i tu je
    // obrnut redosled bezbedan — pokriva slučaj da izvori ne slažu ko je
    // domaćin za ISTI meč, ne meša dva različita meča). Ako to ne uspe (npr.
    // brojevi kola između SofaScore-a i nas nisu poravnati), padni na tačan
    // redosled bez obzira na kolo — to i dalje razdvaja dva kruga, jer je
    // domaćin/gost obrnut između njih.
    let candidates = (fixtures ?? []).filter(
      (f: any) =>
        (f.gameweeks as any)?.number === round &&
        ((teamNamesMatch(f.home?.name ?? "", homeTeam) && teamNamesMatch(f.away?.name ?? "", awayTeam)) ||
          (teamNamesMatch(f.home?.name ?? "", awayTeam) && teamNamesMatch(f.away?.name ?? "", homeTeam)))
    );
    if (candidates.length !== 1) {
      candidates = (fixtures ?? []).filter(
        (f: any) => teamNamesMatch(f.home?.name ?? "", homeTeam) && teamNamesMatch(f.away?.name ?? "", awayTeam)
      );
    }

    if (candidates.length === 0) {
      warnings.push("Nije nađen odgovarajući meč u našoj bazi — proveri ručno preko pojedinačnog unosa.");
      return {
        sofaEventId: m.sofaEventId,
        sofaHomeTeam: homeTeam,
        sofaAwayTeam: awayTeam,
        round,
        matchedFixtureId: null,
        label,
        rows: [],
        squadPlayers: [],
        warnings,
      };
    }
    if (candidates.length > 1) {
      warnings.push(`Nađeno ${candidates.length} mogućih mečeva u bazi — preskačem, uparuj ručno.`);
      return {
        sofaEventId: m.sofaEventId,
        sofaHomeTeam: homeTeam,
        sofaAwayTeam: awayTeam,
        round,
        matchedFixtureId: null,
        label,
        rows: [],
        squadPlayers: [],
        warnings,
      };
    }

    const fixture = candidates[0] as any;
    const squadPlayers = [
      ...(playersByClub.get(fixture.home_club_id) ?? []),
      ...(playersByClub.get(fixture.away_club_id) ?? []),
    ];

    const parsed = parseSofascoreLineupsObject(m.lineups);
    warnings.push(...parsed.warnings);

    const rows: SofascoreRatingPreviewRow[] = parsed.players
      .filter((p) => p.rating !== null)
      .map((p) => {
        const n = normalizeName(p.name);
        const match = squadPlayers.find((s) => {
          const ln = normalizeName(s.name.split(" ").slice(-1)[0]);
          return ln.length > 0 && (n.includes(ln) || ln.includes(n));
        });
        return {
          sofaName: p.name,
          sofaPosition: p.position,
          rating: p.rating as number,
          matchedPlayerId: match?.id ?? null,
        };
      });

    return {
      sofaEventId: m.sofaEventId,
      sofaHomeTeam: homeTeam,
      sofaAwayTeam: awayTeam,
      round,
      matchedFixtureId: fixture.id,
      label: `${fixture.home?.name ?? homeTeam} — ${fixture.away?.name ?? awayTeam} (kolo ${(fixture.gameweeks as any)?.number ?? "?"})`,
      rows,
      squadPlayers,
      warnings,
    };
  });

  return { matches };
}

export async function confirmSofascoreBulkAction(
  entries: { fixtureId: string; playerId: string; rating: number }[]
): Promise<{ written: number }> {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const fixtureIds = [...new Set(entries.map((e) => e.fixtureId))];
  const { data: fixtures } = await supabase.from("fixtures").select("id, gameweek_id").in("id", fixtureIds);
  const gwByFixture = new Map((fixtures ?? []).map((f: any) => [f.id as string, f.gameweek_id as string]));

  const playerIds = [...new Set(entries.map((e) => e.playerId))];
  const { data: players } = await supabase.from("players").select("id, club_id").in("id", playerIds);
  const clubByPlayer = new Map((players ?? []).map((p: any) => [p.id as string, p.club_id as string]));

  const errors: string[] = [];
  await Promise.all(
    entries.map(async (e) => {
      const gameweekId = gwByFixture.get(e.fixtureId);
      const clubId = clubByPlayer.get(e.playerId);
      if (!gameweekId || !clubId) {
        errors.push(`${e.playerId}@${e.fixtureId}: meč ili igrač nije nađen.`);
        return;
      }
      const { error } = await supabase.from("player_gameweek_stats").upsert(
        {
          player_id: e.playerId,
          club_id: clubId,
          gameweek_id: gameweekId,
          fixture_id: e.fixtureId,
          sofascore_rating: e.rating,
        },
        { onConflict: "player_id,fixture_id" }
      );
      if (error) errors.push(`${e.playerId}@${e.fixtureId}: ${error.message}`);
    })
  );

  if (errors.length > 0) throw new Error(`Neke ocene nisu upisane: ${errors.join("; ")}`);

  revalidatePath("/admin");
  return { written: entries.length };
}

// ----------------------------------------------------------------------------
// SofaScore golovi / asistencije / autogolovi — isti fajl kao za ocene (bulk),
// ali ovde se poredi sa onim što je kod nas upisano i predlažu se SAMO razlike
// (videti lib/sofascore-events.ts za bezbednosne provere). Dva koraka: preview
// (ne piše ništa) pa confirm (menja samo ta tri polja, ništa drugo).
// ----------------------------------------------------------------------------

export type SofascoreEventsMatch = {
  sofaEventId: number | string;
  label: string;
  fixtureId: string | null;
  gameweekNumber: number | null;
  scoreOk: boolean;
  scoreText: string;
  warnings: string[];
  rows: EventDiffRow[];
  squadPlayers: { id: string; name: string }[];
};

export type SofascoreEventsPreview = { matches: SofascoreEventsMatch[] };

export async function previewSofascoreEventsAction(bulkJsonText: string): Promise<SofascoreEventsPreview> {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  let bulk: any;
  try {
    bulk = JSON.parse(bulkJsonText);
  } catch {
    throw new Error("Ovo nije validan JSON — proveri da li je ceo fajl učitan.");
  }
  const bulkMatches: any[] = Array.isArray(bulk?.matches) ? bulk.matches : [];
  if (bulkMatches.length === 0) throw new Error("Fajl ne sadrži nijedan meč ('matches' je prazno).");

  const { data: fixtures } = await supabase
    .from("fixtures")
    .select(
      "id, home_club_id, away_club_id, home_score, away_score, home:home_club_id(name), away:away_club_id(name), gameweeks!gameweek_id(number)"
    );
  const { data: allPlayers } = await supabase.from("players").select("id, first_name, last_name, club_id");
  const squadAll: SquadPlayer[] = ((allPlayers ?? []) as any[]).map((p) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`.trim(),
    clubId: p.club_id,
  }));

  const matches: SofascoreEventsMatch[] = [];
  for (const m of bulkMatches) {
    const homeTeam = String(m.homeTeam ?? "?");
    const awayTeam = String(m.awayTeam ?? "?");
    const round = typeof m.round === "number" ? m.round : null;

    // Isto uparivanje meča kao kod ocena: prvo tačno kolo (dozvoljen obrnut
    // redosled), pa tačan redosled bez obzira na kolo.
    const all = (fixtures ?? []) as any[];
    let candidates = all.filter(
      (f) =>
        f.gameweeks?.number === round &&
        ((teamNamesMatch(f.home?.name ?? "", homeTeam) && teamNamesMatch(f.away?.name ?? "", awayTeam)) ||
          (teamNamesMatch(f.home?.name ?? "", awayTeam) && teamNamesMatch(f.away?.name ?? "", homeTeam)))
    );
    if (candidates.length !== 1) {
      candidates = all.filter(
        (f) => teamNamesMatch(f.home?.name ?? "", homeTeam) && teamNamesMatch(f.away?.name ?? "", awayTeam)
      );
    }

    const label0 = `${homeTeam} — ${awayTeam}${round !== null ? ` (kolo ${round})` : ""}`;
    if (candidates.length !== 1) {
      matches.push({
        sofaEventId: m.sofaEventId,
        label: label0,
        fixtureId: null,
        gameweekNumber: null,
        scoreOk: false,
        scoreText: "",
        warnings: [
          candidates.length === 0
            ? "Nije nađen odgovarajući meč u našoj bazi."
            : `Nađeno ${candidates.length} mogućih mečeva u bazi — preskačem.`,
        ],
        rows: [],
        squadPlayers: [],
      });
      continue;
    }

    const fx = candidates[0];
    const parsed = parseSofascoreLineupsObject(m.lineups);
    // SofaScore domaćin/gost ne mora da se poklopi sa našim (isti par, obrnut) —
    // ako je obrnut, zameni strane da isHome znači "naš domaćin".
    const swapped = !(teamNamesMatch(fx.home?.name ?? "", homeTeam));
    const ourSquad = squadAll.filter((p) => p.clubId === fx.home_club_id || p.clubId === fx.away_club_id);
    const homeSquad = ourSquad.filter((p) => p.clubId === fx.home_club_id);
    const awaySquad = ourSquad.filter((p) => p.clubId === fx.away_club_id);

    // Golovi dolaze iz "incidents" (skripta ih dodaje u fajl); sastavi ih ne
    // nose. Ako fajl nema incidents, pada se na polja iz statistike sastava.
    const hasIncidents = Array.isArray(m.incidents);
    let sofaPlayers = hasIncidents
      ? eventsToPlayers(parseSofascoreIncidents(m.incidents), homeSquad, awaySquad)
      : parsed.players;
    if (!hasIncidents && swapped) sofaPlayers = sofaPlayers.map((p) => ({ ...p, isHome: !p.isHome }));
    // (eventsToPlayers već koristi naše sastavove, pa strane ne treba menjati.)

    const noEventData =
      !hasIncidents && !parsed.players.some((p) => p.goals > 0 || p.assists > 0 || p.ownGoals > 0);
    if (noEventData && ((fx.home_score ?? 0) + (fx.away_score ?? 0) > 0)) {
      matches.push({
        sofaEventId: m.sofaEventId,
        label: `${fx.home?.name ?? homeTeam} — ${fx.away?.name ?? awayTeam} (kolo ${fx.gameweeks?.number ?? "?"})`,
        fixtureId: fx.id,
        gameweekNumber: fx.gameweeks?.number ?? null,
        scoreOk: false,
        scoreText: "",
        warnings: [
          "Fajl nema podatke o golovima za ovaj meč (nema 'incidents'). Skini fajl ponovo skriptom scripts/sofascore-bulk-konzola.js i učitaj ga ponovo.",
        ],
        rows: [],
        squadPlayers: [],
      });
      continue;
    }

    const { data: statRows } = await supabase
      .from("player_gameweek_stats")
      .select("player_id, goals, assists, own_goals")
      .eq("fixture_id", fx.id);
    const ours: OurStatRow[] = ((statRows ?? []) as any[]).map((r) => ({
      playerId: r.player_id,
      goals: r.goals ?? 0,
      assists: r.assists ?? 0,
      ownGoals: r.own_goals ?? 0,
    }));

    const squad = ourSquad;
    const diff = diffMatchEvents({
      sofaPlayers,
      fixture: {
        homeClubId: fx.home_club_id,
        awayClubId: fx.away_club_id,
        homeScore: fx.home_score,
        awayScore: fx.away_score,
      },
      squad,
      ours,
    });

    matches.push({
      sofaEventId: m.sofaEventId,
      label: `${fx.home?.name ?? homeTeam} — ${fx.away?.name ?? awayTeam} (kolo ${fx.gameweeks?.number ?? "?"})`,
      fixtureId: fx.id,
      gameweekNumber: fx.gameweeks?.number ?? null,
      scoreOk: diff.scoreOk,
      scoreText: diff.scoreText,
      warnings: [...(hasIncidents ? [] : parsed.warnings.filter((w) => !w.includes("nepotvrđen"))), ...diff.warnings],
      rows: diff.rows,
      squadPlayers: squad.map((p) => ({ id: p.id, name: p.name })),
    });
  }

  return { matches };
}

export async function confirmSofascoreEventsAction(
  entries: { fixtureId: string; playerId: string; goals?: number; assists?: number; ownGoals?: number }[]
): Promise<{ written: number; gameweeks: number[] }> {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const fixtureIds = [...new Set(entries.map((e) => e.fixtureId))];
  const { data: fixtures } = await supabase
    .from("fixtures")
    .select("id, gameweek_id, gameweeks!gameweek_id(number)")
    .in("id", fixtureIds);
  const fxById = new Map((fixtures ?? []).map((f: any) => [f.id as string, f]));

  const playerIds = [...new Set(entries.map((e) => e.playerId))];
  const { data: players } = await supabase.from("players").select("id, club_id").in("id", playerIds);
  const clubByPlayer = new Map((players ?? []).map((p: any) => [p.id as string, p.club_id as string]));

  const errors: string[] = [];
  const gameweeks = new Set<number>();
  await Promise.all(
    entries.map(async (e) => {
      const fx: any = fxById.get(e.fixtureId);
      const clubId = clubByPlayer.get(e.playerId);
      if (!fx || !clubId) {
        errors.push(`${e.playerId}@${e.fixtureId}: meč ili igrač nije nađen.`);
        return;
      }
      const values: Record<string, number> = {};
      for (const [key, col] of [["goals", "goals"], ["assists", "assists"], ["ownGoals", "own_goals"]] as const) {
        const v = e[key];
        if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 20) values[col] = Math.round(v);
      }
      if (Object.keys(values).length === 0) return;
      const { error } = await supabase.from("player_gameweek_stats").upsert(
        {
          player_id: e.playerId,
          club_id: clubId,
          gameweek_id: fx.gameweek_id,
          fixture_id: e.fixtureId,
          ...values,
          is_admin_reviewed: true,
        },
        { onConflict: "player_id,fixture_id" }
      );
      if (error) errors.push(`${e.playerId}@${e.fixtureId}: ${error.message}`);
      else if (fx.gameweeks?.number != null) gameweeks.add(fx.gameweeks.number);
    })
  );

  if (errors.length > 0) throw new Error(`Neke izmene nisu upisane: ${errors.join("; ")}`);

  revalidatePath("/admin");
  return { written: entries.length, gameweeks: [...gameweeks].sort((a, b) => a - b) };
}

// ----------------------------------------------------------------------------
// Termini mečeva po SofaScore-u — usklađuje kickoff_at za mečeve koji još nisu
// odigrani (i, po želji, rok / početak / kraj kola). Fajl pravi skripta
// scripts/sofascore-termini-konzola.js. Dva koraka: preview (ne piše ništa) pa
// confirm. Odigrani i mečevi u toku se nikad ne diraju.
// ----------------------------------------------------------------------------

export type KickoffRow = {
  sofaEventId: number | string;
  label: string;
  round: number | null;
  fixtureId: string | null;
  ourKickoff: string | null;
  sofaKickoff: string | null;
  ourStatus: string | null;
  sofaStatus: string;
  /** Razlika veća od minuta. */
  changed: boolean;
  /** Može da se primeni (naš meč nije odigran, SofaScore ima važeći termin i nije odložen). */
  selectable: boolean;
  /** Naš meč je bio odložen, a SofaScore ima novi termin — vraća ga u "zakazan". */
  reschedules: boolean;
  note: string | null;
};

export type KickoffGameweek = {
  number: number;
  current: { deadline: string; starts: string; ends: string };
  proposed: { deadline: string; starts: string; ends: string };
};

export type KickoffPreview = { rows: KickoffRow[]; gameweeks: KickoffGameweek[]; warnings: string[] };

const HOUR_MS = 60 * 60 * 1000;

/** Rok = sat pre prvog meča; kraj = dva sata posle poslednjeg (isto kao uvoz rasporeda). */
function gameweekWindow(kickoffs: number[]) {
  const first = Math.min(...kickoffs);
  const last = Math.max(...kickoffs);
  return {
    deadline: new Date(first - HOUR_MS).toISOString(),
    starts: new Date(first).toISOString(),
    ends: new Date(last + 2 * HOUR_MS).toISOString(),
  };
}

export async function previewSofascoreKickoffsAction(jsonText: string): Promise<KickoffPreview> {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  let json: any;
  try {
    json = JSON.parse(jsonText);
  } catch {
    throw new Error("Ovo nije validan JSON — proveri da li je ceo fajl učitan.");
  }
  const list: any[] = Array.isArray(json?.fixtures) ? json.fixtures : [];
  if (list.length === 0) throw new Error("Fajl ne sadrži nijedan meč ('fixtures' je prazno).");

  const { data: fixtures } = await supabase
    .from("fixtures")
    .select(
      "id, gameweek_id, kickoff_at, status, home_club_id, away_club_id, home:home_club_id(name), away:away_club_id(name), gameweeks!gameweek_id(number, status, deadline_at, starts_at, ends_at)"
    );
  const all = (fixtures ?? []) as any[];

  const rows: KickoffRow[] = [];
  const warnings: string[] = [];
  /** fixtureId -> novi termin (ms) za mečeve koji se mogu primeniti. */
  const proposed = new Map<string, number>();

  for (const f of list) {
    const homeTeam = String(f.homeTeam ?? "?");
    const awayTeam = String(f.awayTeam ?? "?");
    const round = typeof f.round === "number" ? f.round : null;
    const sofaStatus = String(f.status ?? "");
    const ts = typeof f.startTimestamp === "number" ? f.startTimestamp * 1000 : NaN;
    const sofaKickoff = Number.isFinite(ts) ? new Date(ts).toISOString() : null;

    let candidates = all.filter(
      (x) =>
        x.gameweeks?.number === round &&
        ((teamNamesMatch(x.home?.name ?? "", homeTeam) && teamNamesMatch(x.away?.name ?? "", awayTeam)) ||
          (teamNamesMatch(x.home?.name ?? "", awayTeam) && teamNamesMatch(x.away?.name ?? "", homeTeam)))
    );
    if (candidates.length !== 1) {
      candidates = all.filter(
        (x) => teamNamesMatch(x.home?.name ?? "", homeTeam) && teamNamesMatch(x.away?.name ?? "", awayTeam)
      );
    }

    const base = {
      sofaEventId: f.sofaEventId,
      round,
      sofaKickoff,
      sofaStatus,
    };

    if (candidates.length !== 1) {
      rows.push({
        ...base,
        label: `${homeTeam} — ${awayTeam}${round !== null ? ` (kolo ${round})` : ""}`,
        fixtureId: null,
        ourKickoff: null,
        ourStatus: null,
        changed: false,
        selectable: false,
        reschedules: false,
        note: candidates.length === 0 ? "Nema ga u našoj bazi (kolo nije uvezeno?)" : "Više mogućih mečeva — preskačem",
      });
      continue;
    }

    const fx = candidates[0];
    const ourMs = new Date(fx.kickoff_at).getTime();
    const open = fx.status === "scheduled" || fx.status === "postponed";
    const sofaPostponed = sofaStatus === "postponed" || sofaStatus === "canceled" || sofaStatus === "cancelled";
    const validTime = Number.isFinite(ts);
    const changed = validTime && Math.abs(ts - ourMs) >= 60_000;
    const selectable = open && validTime && !sofaPostponed && changed;

    let note: string | null = null;
    if (!open) note = "Već odigran / u toku — ne diram";
    else if (sofaPostponed) note = "SofaScore ga vodi kao odloženog";
    else if (!validTime) note = "SofaScore nema termin";

    if (selectable) proposed.set(fx.id, ts);

    rows.push({
      ...base,
      label: `${fx.home?.name ?? homeTeam} — ${fx.away?.name ?? awayTeam} (kolo ${fx.gameweeks?.number ?? "?"})`,
      fixtureId: fx.id,
      ourKickoff: fx.kickoff_at,
      ourStatus: fx.status,
      changed,
      selectable,
      reschedules: selectable && fx.status === "postponed" && !sofaPostponed,
      note,
    });
  }

  // Predlog roka po kolu — samo za kola koja još nisu počela i imaju izmenjen meč.
  const gameweeks: KickoffGameweek[] = [];
  const byGw = new Map<number, any[]>();
  for (const fx of all) {
    const n = fx.gameweeks?.number;
    if (typeof n !== "number") continue;
    (byGw.get(n) ?? byGw.set(n, []).get(n)!).push(fx);
  }
  for (const [number, fxs] of [...byGw.entries()].sort((a, b) => a[0] - b[0])) {
    if (!fxs.some((x) => proposed.has(x.id))) continue;
    const gw = fxs[0].gameweeks;
    if (gw.status !== "upcoming") continue;
    const times = fxs
      .filter((x) => x.status !== "cancelled" && !(x.status === "postponed" && !proposed.has(x.id)))
      .map((x) => proposed.get(x.id) ?? new Date(x.kickoff_at).getTime());
    if (times.length === 0) continue;
    const next = gameweekWindow(times);
    const differs =
      Math.abs(new Date(next.deadline).getTime() - new Date(gw.deadline_at).getTime()) >= 60_000 ||
      Math.abs(new Date(next.ends).getTime() - new Date(gw.ends_at).getTime()) >= 60_000;
    if (!differs) continue;
    gameweeks.push({
      number,
      current: { deadline: gw.deadline_at, starts: gw.starts_at, ends: gw.ends_at },
      proposed: next,
    });
  }

  if (gameweeks.length > 0) {
    warnings.push("Pomeranje roka kola menja trenutak do kog korisnici mogu da menjaju tim — proveri pre potvrde.");
  }
  return { rows, gameweeks, warnings };
}

export async function confirmSofascoreKickoffsAction(input: {
  fixtures: { fixtureId: string; kickoffAt: string; reschedules: boolean }[];
  gameweekNumbers: number[];
}): Promise<{ fixturesUpdated: number; gameweeksUpdated: number[] }> {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const errors: string[] = [];
  let fixturesUpdated = 0;

  for (const f of input.fixtures) {
    const ms = new Date(f.kickoffAt).getTime();
    // Razuman opseg: sprečava slučajno upisivanje 1970. ili 2099. zbog lošeg fajla.
    if (!Number.isFinite(ms) || ms < Date.UTC(2025, 0, 1) || ms > Date.UTC(2028, 0, 1)) {
      errors.push(`${f.fixtureId}: neprihvatljiv termin`);
      continue;
    }
    const patch: Record<string, unknown> = { kickoff_at: new Date(ms).toISOString() };
    if (f.reschedules) patch.status = "scheduled";
    const { error, data } = await supabase
      .from("fixtures")
      .update(patch)
      .eq("id", f.fixtureId)
      .in("status", ["scheduled", "postponed"]) // odigrane i mečeve u toku ne diramo
      .select("id");
    if (error) errors.push(`${f.fixtureId}: ${error.message}`);
    else fixturesUpdated += data?.length ?? 0;
  }

  // Rok/početak/kraj kola se računaju iz STVARNIH termina u bazi posle izmene,
  // da odgovaraju onome što je upisano (a ne onome što je pregled predlagao).
  const gameweeksUpdated: number[] = [];
  for (const number of input.gameweekNumbers) {
    const { data: gw } = await supabase.from("gameweeks").select("id, status").eq("number", number).maybeSingle();
    if (!gw || gw.status !== "upcoming") continue;
    const { data: fxs } = await supabase
      .from("fixtures")
      .select("kickoff_at, status")
      .eq("gameweek_id", gw.id);
    const times = ((fxs ?? []) as any[])
      .filter((x) => x.status !== "cancelled" && x.status !== "postponed")
      .map((x) => new Date(x.kickoff_at).getTime());
    if (times.length === 0) continue;
    const w = gameweekWindow(times);
    const { error } = await supabase
      .from("gameweeks")
      .update({ deadline_at: w.deadline, starts_at: w.starts, ends_at: w.ends })
      .eq("id", gw.id);
    if (error) errors.push(`kolo ${number}: ${error.message}`);
    else gameweeksUpdated.push(number);
  }

  if (errors.length > 0) throw new Error(`Neke izmene nisu upisane: ${errors.join("; ")}`);

  revalidatePath("/admin");
  revalidatePath("/raspored");
  return { fixturesUpdated, gameweeksUpdated };
}

// ----------------------------------------------------------------------------
// Povrede i suspenzije po SofaScore-u — jednom nedeljno, pred kolo. Fajl pravi
// scripts/sofascore-povrede-konzola.js. Spisak je "snimak stanja": igrač koji
// je bio označen, a više nije na spisku kluba čiji je spisak u fajlu, vraća se
// na "dostupan". Dva koraka: preview (ne piše ništa) pa confirm.
// ----------------------------------------------------------------------------

const PLAYER_STATUSES: PlayerStatus[] = ["available", "injured", "suspended", "doubtful", "unavailable"];

export type InjuryRow = {
  team: string;
  /** Ime kod SofaScore-a; null = igrač koji se vraća na "dostupan" (nema ga na novom spisku). */
  sofaName: string | null;
  playerId: string | null;
  /** Upareno tačnim imenom (true) ili samo po prezimenu (false). */
  exact: boolean;
  currentStatus: string;
  proposedStatus: PlayerStatus;
  note: string | null;
  until: string | null;
  /** Naše ime igrača za prikaz. */
  playerName: string | null;
};

export type InjuriesPreview = {
  round: number | null;
  fetchedAt: string | null;
  rows: InjuryRow[];
  squadPlayers: { id: string; name: string; club: string }[];
  warnings: string[];
};

export async function previewSofascoreInjuriesAction(jsonText: string): Promise<InjuriesPreview> {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  let json: unknown;
  try {
    json = JSON.parse(jsonText);
  } catch {
    throw new Error("Ovo nije validan JSON — proveri da li je ceo fajl učitan.");
  }
  const file = parseInjuriesFile(json);
  if (file.teams.length === 0) throw new Error("Fajl ne sadrži nijedan klub ('teams' je prazno).");

  const { data: clubs } = await supabase.from("clubs").select("id, name");
  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, club_id, status, status_note, status_until")
    .eq("is_active", true);
  const clubList = (clubs ?? []) as { id: string; name: string }[];
  const playerList = (players ?? []) as any[];

  const warnings: string[] = [];
  const rows: InjuryRow[] = [];
  const squadPlayers: InjuriesPreview["squadPlayers"] = [];

  for (const t of file.teams) {
    const club = clubList.find((c) => teamNamesMatch(c.name, t.team));
    if (!club) {
      warnings.push(`Klub „${t.team}” nije nađen u našoj bazi — preskačem.`);
      continue;
    }
    const squad: (SquadPlayer & { raw: any })[] = playerList
      .filter((p) => p.club_id === club.id)
      .map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`.trim(), clubId: club.id, raw: p }));
    for (const p of squad) squadPlayers.push({ id: p.id, name: p.name, club: club.name });

    const handled = new Set<string>();
    for (const m of t.missing) {
      const found = findPlayer(m.name, squad);
      const raw = squad.find((s) => s.id === found?.player.id)?.raw;
      if (found) handled.add(found.player.id);
      const proposed = mapMissingStatus(m.type, m.reason, m.description);
      const sameUntil = (raw?.status_until ?? null) === m.until || (!raw?.status_until && !m.until);
      // Bez promene (isti status, napomena i datum) — nema šta da se prikaže.
      if (raw && raw.status === proposed && (raw.status_note ?? null) === (m.description ?? null) && sameUntil) continue;
      rows.push({
        team: club.name,
        sofaName: m.name,
        playerId: found?.player.id ?? null,
        exact: found?.exact ?? false,
        currentStatus: raw?.status ?? "available",
        proposedStatus: proposed,
        note: m.description,
        until: m.until,
        playerName: found?.player.name ?? null,
      });
    }

    // Označeni, a nema ih na novom spisku → vraćaju se.
    for (const p of squad) {
      if (handled.has(p.id)) continue;
      if (p.raw.status && p.raw.status !== "available") {
        rows.push({
          team: club.name,
          sofaName: null,
          playerId: p.id,
          exact: true,
          currentStatus: p.raw.status,
          proposedStatus: "available",
          note: null,
          until: null,
          playerName: p.name,
        });
      }
    }
  }

  return { round: file.round, fetchedAt: file.fetchedAt, rows, squadPlayers, warnings };
}

export async function confirmSofascoreInjuriesAction(input: {
  round: number | null;
  entries: { playerId: string; status: PlayerStatus; note: string | null; until: string | null }[];
}): Promise<{ updated: number }> {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const errors: string[] = [];
  let updated = 0;
  for (const e of input.entries) {
    if (!PLAYER_STATUSES.includes(e.status)) {
      errors.push(`${e.playerId}: nepoznat status`);
      continue;
    }
    const available = e.status === "available";
    const untilMs = e.until ? new Date(e.until).getTime() : NaN;
    const { error } = await supabase
      .from("players")
      .update({
        status: e.status,
        status_note: available ? null : (e.note ?? null)?.slice(0, 200) ?? null,
        status_until: available || !Number.isFinite(untilMs) ? null : new Date(untilMs).toISOString(),
      })
      .eq("id", e.playerId);
    if (error) errors.push(`${e.playerId}: ${error.message}`);
    else updated++;
  }
  if (errors.length > 0) throw new Error(`Neke izmene nisu upisane: ${errors.join("; ")}`);

  // Vreme poslednjeg ažuriranja za prikaz u Statistikama — i kad nije bilo izmena
  // (spisak je proveren, samo se ništa nije promenilo).
  const { error: stampError } = await supabase.from("data_updates").upsert(
    {
      key: "injuries",
      updated_at: new Date().toISOString(),
      note: input.round !== null ? String(input.round) : null, // samo broj kola; tekst se sklapa po jeziku
    },
    { onConflict: "key" }
  );
  if (stampError) throw new Error(`Izmene su upisane, ali vreme ažuriranja nije: ${stampError.message}`);

  revalidatePath("/admin");
  revalidatePath("/statistike");
  return { updated };
}


// ----------------------------------------------------------------------------
// Cene igrača — ručna rekalkulacija (migracija 017)
// ----------------------------------------------------------------------------

export type PriceRow = {
  playerId: string;
  name: string;
  clubShort: string;
  clubColor: string;
  price: number;
  ins: number;
  outs: number;
  net: number;
  /** 0 kad je red dodat ručno. */
  delta: number;
  newPrice: number;
};

export type PricePreview =
  | { ok: true; since: string | null; gameweekId: string; gameweekNumber: number; rows: PriceRow[]; transfersCounted: number }
  | { ok: false; error: string };

const num = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** Kolo na koje se odnosi izmena: prvo sledeće sa rokom u budućnosti, inače poslednje. */
async function priceTargetGameweek(supabase: ReturnType<typeof createServiceRoleClient>) {
  const { data: next } = await supabase
    .from("gameweeks")
    .select("id, number")
    .gt("deadline_at", new Date().toISOString())
    .order("number", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (next) return next;
  const { data: last } = await supabase
    .from("gameweeks")
    .select("id, number")
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return last;
}

/** Kolo za koje se upisuje izmena (koristi se kad je cena dodata ručno, bez predloga). */
export async function priceTargetGameweekAction(): Promise<{ ok: true; gameweekId: string } | { ok: false; error: string }> {
  await requireAdmin();
  const gw = await priceTargetGameweek(createServiceRoleClient());
  return gw ? { ok: true, gameweekId: gw.id } : { ok: false, error: "Nema nijednog kola u bazi." };
}

/**
 * Predlog izmena cena: transferi od poslednje izmene (ili svi, ako je ovo
 * prva) → ulazi/izlazi po igraču → predlog po pragu. Ništa se ne upisuje.
 */
export async function previewPriceChangesAction(threshold: number, step: number): Promise<PricePreview> {
  await requireAdmin();
  const supabase = createServiceRoleClient();
  const th = Math.max(1, Math.round(num(threshold, 5)));
  const st = Math.min(1, Math.max(0.1, Math.round(num(step, 0.1) * 10) / 10));

  const gw = await priceTargetGameweek(supabase);
  if (!gw) return { ok: false, error: "Nema nijednog kola u bazi." };

  const { data: last } = await supabase
    .from("player_price_history")
    .select("changed_at")
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const since: string | null = last?.changed_at ?? null;

  let transfers: { player_in_id: string; player_out_id: string }[];
  try {
    transfers = await selectAllPages<{ player_in_id: string; player_out_id: string }>("transfers", (from, to) => {
      let q = supabase.from("transfers").select("player_in_id, player_out_id, created_at, id");
      if (since) q = q.gt("created_at", since);
      return q.order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to);
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { ins, outs } = countTransfers(transfers);
  const ids = [...new Set([...ins.keys(), ...outs.keys()])];
  if (ids.length === 0) {
    return { ok: true, since, gameweekId: gw.id, gameweekNumber: gw.number, rows: [], transfersCounted: transfers.length };
  }

  const { data: players, error } = await supabase
    .from("players")
    .select("id, first_name, last_name, price, clubs(short_name, primary_color)")
    .in("id", ids);
  if (error) return { ok: false, error: error.message };

  const rows: PriceRow[] = [];
  for (const p of (players ?? []) as any[]) {
    const i = ins.get(p.id) ?? 0;
    const o = outs.get(p.id) ?? 0;
    const sug = suggestPrice(Number(p.price), i - o, th, st);
    if (!sug) continue;
    rows.push({
      playerId: p.id,
      name: `${p.first_name} ${p.last_name}`.trim(),
      clubShort: p.clubs?.short_name ?? "?",
      clubColor: p.clubs?.primary_color ?? "#93ADCC",
      price: Number(p.price),
      ins: i,
      outs: o,
      net: i - o,
      delta: sug.delta,
      newPrice: sug.newPrice,
    });
  }
  rows.sort((a, b) => b.net - a.net);
  return { ok: true, since, gameweekId: gw.id, gameweekNumber: gw.number, rows, transfersCounted: transfers.length };
}

/** Pretraga igrača za ručnu izmenu cene (po imenu ili prezimenu). */
export async function searchPlayersForPriceAction(query: string): Promise<PriceRow[]> {
  await requireAdmin();
  const q = String(query ?? "").trim().replace(/[%,()]/g, "");
  if (q.length < 2) return [];
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("players")
    .select("id, first_name, last_name, price, clubs(short_name, primary_color)")
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
    .eq("is_active", true)
    .order("last_name")
    .limit(8);
  return ((data ?? []) as any[]).map((p) => ({
    playerId: p.id,
    name: `${p.first_name} ${p.last_name}`.trim(),
    clubShort: p.clubs?.short_name ?? "?",
    clubColor: p.clubs?.primary_color ?? "#93ADCC",
    price: Number(p.price),
    ins: 0,
    outs: 0,
    net: 0,
    delta: 0,
    newPrice: Number(p.price),
  }));
}

export type ApplyPricesResult = { ok: true; applied: number } | { ok: false; error: string };

/** Primena izabranih izmena — jedna transakcija u bazi (apply_price_changes). */
export async function applyPriceChangesAction(
  gameweekId: string,
  changes: { playerId: string; newPrice: number; net: number }[]
): Promise<ApplyPricesResult> {
  await requireAdmin();
  if (!Array.isArray(changes) || changes.length === 0) return { ok: false, error: "Nema izmena za primenu." };
  const payload = changes.map((c) => ({
    player_id: String(c.playerId),
    new_price: Math.round(num(c.newPrice, NaN) * 10) / 10,
    net_transfers: Math.round(num(c.net, 0)),
  }));
  if (payload.some((c) => !Number.isFinite(c.new_price))) return { ok: false, error: "Neispravna cena u jednom od redova." };

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("apply_price_changes", { p_gameweek_id: gameweekId, p_changes: payload });
  if (error) {
    const missing = /apply_price_changes|function/i.test(error.message) && /not exist|find|schema cache/i.test(error.message);
    return {
      ok: false,
      error: missing ? "Pokreni migrations/017-promene-cena.sql u Supabase SQL editoru." : error.message,
    };
  }
  revalidatePath("/admin");
  revalidatePath("/igraci");
  revalidatePath("/igraci/cene");
  revalidatePath("/moj-tim");
  return { ok: true, applied: Number((data as any)?.applied ?? 0) };
}
