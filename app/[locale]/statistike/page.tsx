import { createClient } from "@/lib/supabase/server";
import { StatsBoard, type StatsData } from "./stats-board";
import { DataLoadError } from "@/components/DataLoadError";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { playerFullName, playerShirtName, type Position } from "@/lib/fantasy-rules";
import { selectTeamOfTheWeek } from "@/lib/team-of-the-week";
import type { TeamOfWeekData } from "@/components/TeamOfWeekBoard";

/**
 * Faza 9 — top liste. Sve dolazi iz view-ova napisanih još u schema.sql
 * (sekcija 16): v_top_fantasy_by_position, v_top_scorers, v_top_assists,
 * v_club_fantasy_standings. Nijedan nije menjan.
 *
 * ⚠️ Zamka koju je lako prevideti: na startu sezone su SVI total_points nule,
 * pa `RANK()` u v_top_fantasy_by_position svakom igraču daje rang 1 — filter
 * "rank <= 5" bi vratio svih ~360 igrača kao "top 5". Zato svaka lista traži i
 * da je vrednost > 0. Nema poena → nema liste, uz poruku umesto lažne tabele.
 *
 * "Tim kola" (novi tab) NIJE iz view-a — bira se u Node-u (lib/team-of-the-week.ts)
 * nad SVIM player_gameweek_stats redovima poslednjeg ZAKLJUČANOG kola, po
 * istom principu kao autoPickSquad. Namerno bez view-a: formula (minimum po
 * poziciji pa najbolji ostatak) je previše logike za čist SQL, a dataset je
 * mali (jedno kolo, ne cela sezona).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "stats" });
  return { title: `${t("title")} — Fudaristo` };
}

export default async function StatistikePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();

  const [byPosition, scorers, assists, clubs, finalized] = await Promise.all([
    supabase
      .from("v_top_fantasy_by_position")
      .select("id, first_name, last_name, position, club_name, total_points, rank_in_position")
      .gt("total_points", 0)
      .lte("rank_in_position", 5)
      .order("position", { ascending: true })
      .order("total_points", { ascending: false }),
    supabase.from("v_top_scorers").select("id, first_name, last_name, club_name, total_goals"),
    supabase.from("v_top_assists").select("id, first_name, last_name, club_name, total_assists"),
    supabase
      .from("v_club_fantasy_standings")
      .select("id, name, total_club_fantasy_points")
      .order("total_club_fantasy_points", { ascending: false }),
    supabase
      .from("gameweeks")
      .select("id, number")
      .eq("status", "finalized")
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (byPosition.error || scorers.error || assists.error || clubs.error) {
    console.error("[/statistike]", {
      byPosition: byPosition.error,
      scorers: scorers.error,
      assists: assists.error,
      clubs: clubs.error,
    });
    return (
      <Shell>
        <DataLoadError
          whatKey="whatStats"
          error={byPosition.error ?? scorers.error ?? assists.error ?? clubs.error}
        />
      </Shell>
    );
  }

  // --- Tim kola --------------------------------------------------------------
  let teamOfWeek: TeamOfWeekData | null = null;
  if (finalized.data) {
    const { data: gwStatRows } = await supabase
      .from("player_gameweek_stats")
      .select(
        "player_id, fantasy_points, players(first_name, last_name, position, clubs(name, short_name, primary_color))"
      )
      .eq("gameweek_id", finalized.data.id);

    // Duplo kolo (klub odigra dva meča) — sabira se, isto kao svuda drugde
    // (scoring engine, javni pregled tima).
    const pointsByPlayer = new Map<string, number>();
    const metaByPlayer = new Map<
      string,
      { name: string; fullName: string; clubName: string; clubShort: string; clubColor: string; position: Position }
    >();
    for (const r of (gwStatRows ?? []) as any[]) {
      pointsByPlayer.set(r.player_id, (pointsByPlayer.get(r.player_id) ?? 0) + (r.fantasy_points ?? 0));
      if (!metaByPlayer.has(r.player_id) && r.players) {
        metaByPlayer.set(r.player_id, {
          name: playerShirtName(r.players),
          fullName: playerFullName(r.players),
          clubName: r.players.clubs?.name ?? "?",
          clubShort: r.players.clubs?.short_name ?? "?",
          clubColor: r.players.clubs?.primary_color ?? "#8494AC",
          position: r.players.position as Position,
        });
      }
    }

    const candidates = [...pointsByPlayer.entries()].map(([playerId, points]) => ({
      playerId,
      position: metaByPlayer.get(playerId)!.position,
      points,
    }));

    if (candidates.length >= 11) {
      const selectedIds = selectTeamOfTheWeek(candidates);
      teamOfWeek = {
        gameweekNumber: finalized.data.number,
        players: [...selectedIds].map((id) => {
          const meta = metaByPlayer.get(id)!;
          return {
            id,
            name: meta.name,
            fullName: meta.fullName,
            clubName: meta.clubName,
            clubShort: meta.clubShort,
            clubColor: meta.clubColor,
            position: meta.position,
            points: pointsByPlayer.get(id) ?? 0,
          };
        }),
      };
    }
  }

  // --- Ocene (SofaScore) ------------------------------------------------------
  // v_player_avg_rating (migracija 010) — najviše jedan red po igraču, bez
  // rizika od Supabase-ove tihe granice od 1000 redova. Minimum 3 ocenjena
  // nastupa da jedan izuzetno dobar/loš meč ne izbaci nekog na vrh liste.
  const { data: ratingRows } = await supabase
    .from("v_player_avg_rating")
    .select("player_id, avg_rating, rated_appearances")
    .gte("rated_appearances", 3)
    .order("avg_rating", { ascending: false })
    .limit(20);

  const ratingPlayerIds = (ratingRows ?? []).map((r: any) => r.player_id);
  const { data: ratingPlayers } =
    ratingPlayerIds.length > 0
      ? await supabase.from("players").select("id, first_name, last_name, clubs(name)").in("id", ratingPlayerIds)
      : { data: [] };
  const ratingPlayerById = new Map((ratingPlayers ?? []).map((p: any) => [p.id, p]));

  const ratings = (ratingRows ?? [])
    .map((r: any) => {
      const p = ratingPlayerById.get(r.player_id);
      if (!p) return null;
      return {
        id: r.player_id,
        name: playerFullName(p),
        clubName: p.clubs?.name ?? null,
        value: Number(r.avg_rating),
      };
    })
    .filter((x: any): x is NonNullable<typeof x> => x !== null);

  const data: StatsData = {
    byPosition: (byPosition.data ?? []).map((r: any) => ({
      id: r.id,
      name: playerFullName(r),
      position: r.position,
      clubName: r.club_name,
      value: r.total_points,
      rank: Number(r.rank_in_position),
    })),
    // Ovi view-ovi već nose LIMIT 5 u sebi, pa se filter na > 0 primenjuje na
    // tih pet — što je tačno ono što treba: ko ima 0 golova nije strelac.
    scorers: (scorers.data ?? [])
      .filter((r: any) => Number(r.total_goals) > 0)
      .map((r: any) => ({
        id: r.id,
        name: playerFullName(r),
        clubName: r.club_name,
        value: Number(r.total_goals),
      })),
    assists: (assists.data ?? [])
      .filter((r: any) => Number(r.total_assists) > 0)
      .map((r: any) => ({
        id: r.id,
        name: playerFullName(r),
        clubName: r.club_name,
        value: Number(r.total_assists),
      })),
    clubs: (clubs.data ?? [])
      .filter((r: any) => Number(r.total_club_fantasy_points) > 0)
      .map((r: any) => ({
        id: r.id,
        name: r.name,
        clubName: null,
        value: Number(r.total_club_fantasy_points),
      })),
    ratings,
    teamOfWeek,
  };

  const hasAnything =
    data.byPosition.length + data.scorers.length + data.assists.length + data.clubs.length + data.ratings.length >
    0;

  if (!hasAnything && !data.teamOfWeek) {
    return (
      <Shell>
        <EmptyStats />
      </Shell>
    );
  }

  return (
    <Shell lastGameweek={finalized.data?.number ?? null}>
      <StatsBoard data={data} />
    </Shell>
  );
}

async function EmptyStats() {
  const t = await getTranslations("stats");
  return <p className="text-slate-400">{t("noData")}</p>;
}

async function Shell({
  children,
  lastGameweek,
}: {
  children: React.ReactNode;
  lastGameweek?: number | null;
}) {
  const t = await getTranslations("stats");
  return (
    <div>
      <h2 className="font-display text-2xl mb-1">{t("title")}</h2>
      <p className="text-slate-400 text-sm mb-6">
        {lastGameweek ? t("subtitleWithGw", { number: lastGameweek }) : t("subtitle")}
      </p>
      {children}
    </div>
  );
}
