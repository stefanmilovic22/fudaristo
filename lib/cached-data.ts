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
