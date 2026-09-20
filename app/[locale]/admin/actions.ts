"use server";

import { revalidatePath } from "next/cache";
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
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

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

/**
 * Upisuje pregledane vrednosti — i dalje kao NEPOTVRĐENE.
 *
 * Potvrda ostaje zaseban, svestan klik na formi ispod. Automatsko punjenje
 * skraćuje kucanje, ne zamenjuje pregled: obračun i dalje traži da je čovek
 * pogledao svaki meč.
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

  const CHUNK = 20;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const results = await Promise.all(
      rows.slice(i, i + CHUNK).map(async (r) => {
        const clean_sheet = r.goals_conceded === 0 && r.minutes_played >= 60;
        const { error } = await supabase
          .from("player_gameweek_stats")
          .update({
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
          })
          .eq("player_id", r.playerId)
          .eq("fixture_id", fixtureId);
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
