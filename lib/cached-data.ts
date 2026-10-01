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
