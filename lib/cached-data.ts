import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * Javni podaci koji su isti za sve korisnike i menjaju se retko (admin unosi
 * rezultate/cene). Keširaju se između zahteva, pa svaka poseta ne ide ka bazi.
 *
 * Svežina: TTL je kratak (60s) i svaki unos ima tag "public-data" — admin akcije
 * koje zovu revalidateTag/revalidatePath poništavaju ga odmah. Ništa što pripada
 * korisniku (squads, chips_usage, users) ne sme ovde: klijent je bez sesije.
 *
 * Greške se bacaju (ne keširaju se) — pozivalac odlučuje šta da prikaže.
 */
const TTL = 60;
const TAGS = ["public-data"];

function throwIfError<T>(res: { data: T | null; error: { message: string } | null }, label: string): T {
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
  return (res.data ?? []) as T;
}

export const getActivePlayersCached = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    return throwIfError(
      await supabase
        .from("players")
        .select(
          "id, first_name, last_name, position, price, status, club_id, total_points, clubs(name, short_name, primary_color, jersey_photo_url)"
        )
        .eq("is_active", true)
        .order("position")
        .order("price", { ascending: false }),
      "players"
    ) as any[];
  },
  ["active-players-v1"],
  { revalidate: TTL, tags: TAGS }
);

export const getAvgRatingsCached = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    return throwIfError(
      await supabase.from("v_player_avg_rating").select("player_id, avg_rating"),
      "v_player_avg_rating"
    ) as { player_id: string; avg_rating: number }[];
  },
  ["avg-ratings-v1"],
  { revalidate: TTL, tags: TAGS }
);

export const getUpcomingFixturesCached = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    return throwIfError(
      await supabase
        .from("fixtures")
        .select(
          "home_club_id, away_club_id, kickoff_at, home:home_club_id(short_name), away:away_club_id(short_name)"
        )
        .eq("status", "scheduled")
        .order("kickoff_at", { ascending: true }),
      "fixtures(upcoming)"
    ) as any[];
  },
  ["upcoming-fixtures-v1"],
  { revalidate: TTL, tags: TAGS }
);

export const getGameweekFixturesCached = unstable_cache(
  async (gameweekId: string) => {
    const supabase = createPublicClient();
    return throwIfError(
      await supabase
        .from("fixtures")
        .select("home_club_id, away_club_id, status, home:home_club_id(short_name), away:away_club_id(short_name)")
        .eq("gameweek_id", gameweekId)
        .neq("status", "cancelled"),
      "fixtures(gameweek)"
    ) as any[];
  },
  ["gameweek-fixtures-v1"],
  { revalidate: TTL, tags: TAGS }
);

export const getClubsCached = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    return throwIfError(
      await supabase.from("clubs").select("id, name, primary_color").order("name"),
      "clubs"
    ) as { id: string; name: string; primary_color: string }[];
  },
  ["clubs-v1"],
  { revalidate: 300, tags: TAGS }
);

/** Mečevi jednog kola sa imenima i bojama klubova — kartica "Sledeći mečevi" na početnoj. */
export const getRoundMatchesCached = unstable_cache(
  async (gameweekId: string) => {
    const supabase = createPublicClient();
    return throwIfError(
      await supabase
        .from("fixtures")
        .select(
          "id, kickoff_at, status, home:home_club_id(name, short_name, primary_color), away:away_club_id(name, short_name, primary_color)"
        )
        .eq("gameweek_id", gameweekId)
        .neq("status", "cancelled")
        .order("kickoff_at", { ascending: true })
        .limit(8),
      "fixtures(round)"
    ) as any[];
  },
  ["round-matches-v1"],
  { revalidate: TTL, tags: TAGS }
);

/** Klubovi + odigrani mečevi za tabelu Super lige (lib/league-table.ts). */
export const getTableDataCached = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const [clubsRes, fxRes] = await Promise.all([
      supabase.from("clubs").select("id, name, short_name, primary_color").eq("is_active", true),
      supabase
        .from("fixtures")
        .select("home_club_id, away_club_id, home_score, away_score, kickoff_at")
        .eq("status", "finished")
        .order("kickoff_at", { ascending: true }),
    ]);
    if (clubsRes.error) throw new Error(`clubs: ${clubsRes.error.message}`);
    if (fxRes.error) throw new Error(`fixtures(finished): ${fxRes.error.message}`);
    return { clubs: clubsRes.data ?? [], fixtures: fxRes.data ?? [] };
  },
  ["league-table-v1"],
  { revalidate: TTL, tags: TAGS }
);

/**
 * Najtraženiji igrači: procenat sastava koji sadrži igrača, za najnovije kolo
 * koje ima sastave (v_player_ownership, migracija 012). Vraća do 3 igrača.
 * Kratak keš (5 min): menja se dok korisnici sastavljaju timove.
 */
export const getMostSelectedCached = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data: latest, error: latestError } = await supabase
      .from("v_player_ownership")
      .select("gameweek_id, gameweek_number")
      .order("gameweek_number", { ascending: false })
      .limit(1);
    if (latestError) throw new Error(`v_player_ownership: ${latestError.message}`);
    const gw = latest?.[0];
    if (!gw) return { gameweekNumber: null as number | null, players: [] as any[] };

    const { data: top, error: topError } = await supabase
      .from("v_player_ownership")
      .select("player_id, pct, picks")
      .eq("gameweek_id", gw.gameweek_id)
      .order("pct", { ascending: false })
      .limit(3);
    if (topError) throw new Error(`v_player_ownership(top): ${topError.message}`);
    const ids = (top ?? []).map((r: any) => r.player_id);
    if (ids.length === 0) return { gameweekNumber: gw.gameweek_number as number, players: [] as any[] };

    const { data: players, error: pError } = await supabase
      .from("players")
      .select("id, first_name, last_name, position, clubs(name, short_name, primary_color)")
      .in("id", ids);
    if (pError) throw new Error(`players: ${pError.message}`);
    const byId = new Map((players ?? []).map((p: any) => [p.id, p]));
    return {
      gameweekNumber: gw.gameweek_number as number,
      players: (top ?? []).map((r: any) => ({ pct: Number(r.pct), picks: r.picks, player: byId.get(r.player_id) })).filter((x) => x.player),
    };
  },
  ["most-selected-v1"],
  { revalidate: 300, tags: TAGS }
);

/** Povređeni, suspendovani i neizvesni igrači (tab „Povređeni” u Statistikama). */
export const getUnavailablePlayersCached = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    return throwIfError(
      await supabase
        .from("players")
        .select(
          "id, first_name, last_name, position, price, status, status_note, status_until, club_id, total_points, clubs(name, short_name, primary_color, jersey_photo_url)"
        )
        .eq("is_active", true)
        .neq("status", "available"),
      "players(unavailable)"
    ) as any[];
  },
  ["unavailable-players-v1"],
  { revalidate: TTL, tags: TAGS }
);

/** Kada je neki spisak poslednji put ažuriran (tabela data_updates). null = nikad. */
export const getDataUpdateCached = unstable_cache(
  async (key: string) => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("data_updates")
      .select("updated_at, note")
      .eq("key", key)
      .maybeSingle();
    if (error) throw new Error(`data_updates: ${error.message}`);
    return (data ?? null) as { updated_at: string; note: string | null } | null;
  },
  ["data-update-v1"],
  { revalidate: TTL, tags: TAGS }
);

export type GameweekRow = { id: string; number: number; status: string; deadline_at: string | null };

/**
 * Sva kola (ima ih desetak-tridesetak) — služi da se „naredno kolo" i „poslednje
 * zaključano kolo" odrede bez upita ka bazi pri svakom otvaranju stranice.
 * Posle zaključavanja kola / izmene roka admin akcije poništavaju keš.
 */
export const getGameweeksCached = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    return throwIfError(
      await supabase.from("gameweeks").select("id, number, status, deadline_at").order("number", { ascending: true }),
      "gameweeks"
    ) as GameweekRow[];
  },
  ["gameweeks-v1"],
  { revalidate: TTL, tags: TAGS }
);

/** Broj menadžera u globalnoj ligi — ista vrednost za sve, ne treba je tražiti za svakog posetioca. */
export const getManagerCountCached = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { count, error } = await supabase
      .from("v_global_league_standings")
      .select("user_id", { count: "exact", head: true });
    if (error) throw new Error(`v_global_league_standings: ${error.message}`);
    return count ?? 0;
  },
  ["manager-count-v1"],
  { revalidate: TTL, tags: TAGS }
);

/**
 * Statistika svih igrača za jedno kolo (sirove vrednosti + fantasy poeni) —
 * za javni pregled tima, poređenje i sliku za deljenje. Isto je za sve koji
 * gledaju to kolo, pa se čita jednom na minut umesto pri svakoj poseti.
 */
export const getGameweekStatsCached = unstable_cache(
  async (gameweekId: string) => {
    const supabase = createPublicClient();
    return throwIfError(
      await supabase
        .from("player_gameweek_stats")
        .select(
          "player_id, fixture_id, minutes_played, goals, assists, clean_sheet, goals_conceded, saves, " +
            "penalties_saved, penalties_missed, yellow_cards, red_cards, own_goals, bonus_points, fantasy_points, " +
            "sofascore_rating"
        )
        .eq("gameweek_id", gameweekId),
      "player_gameweek_stats"
    ) as any[];
  },
  ["gw-stats-v1"],
  { revalidate: TTL, tags: TAGS }
);
