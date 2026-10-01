import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { selectAllPages } from "@/lib/db-paging";

/**
 * Rang lista je ista za sve — računa se jednom u 30s (i odmah posle
 * obračuna, tag "public-data"). Poredak se ne menja između obračuna, pa
 * čitanje za svakog posetioca nema smisla. Greška se ne kešira.
 */
const loadLeagueCached = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const [standingsRes, finalizedRes] = await Promise.all([
      supabase
        .from("v_global_league_standings")
        .select("user_id, team_name, team_color, total_points, rank")
        .order("total_points", { ascending: false })
        .order("user_id", { ascending: true })
        .range(0, 999),
      // Poslednje zaključano kolo — jedino čiji su poeni konačni.
      supabase
        .from("gameweeks")
        .select("id, number")
        .eq("status", "finalized")
        .order("number", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (standingsRes.error) throw Object.assign(new Error("standings"), { pg: standingsRes.error });

    const lastFinalized = finalizedRes.data;
    let gwPoints: [string, number][] = [];
    if (lastFinalized) {
      const gwRows = await selectAllPages<{ user_id: string; total_points: number }>(
        "user_gameweek_points",
        (from, to) =>
          supabase
            .from("user_gameweek_points")
            .select("user_id, total_points")
            .eq("gameweek_id", lastFinalized.id)
            .order("user_id", { ascending: true })
            .range(from, to)
      );
      gwPoints = gwRows.map((r) => [r.user_id, r.total_points]);
    }
    return { standings: standingsRes.data ?? [], lastFinalized, gwPoints };
  },
  ["league-v1"],
  { revalidate: 30, tags: ["public-data"] }
);

export async function loadLeague() {
  try {
    const r = await loadLeagueCached();
    return {
      error: null,
      standings: r.standings,
      lastFinalized: r.lastFinalized,
      gwPointsByUser: new Map<string, number>(r.gwPoints),
    };
  } catch (e) {
    const pg = (e as { pg?: any }).pg;
    console.error("[/liga]", pg ?? e);
    return { error: pg ?? { message: (e as Error).message }, standings: [], lastFinalized: null, gwPointsByUser: new Map<string, number>() };
  }
}
