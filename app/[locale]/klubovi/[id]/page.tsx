import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  getActivePlayersCached,
  getAvgRatingsCached,
  getTableDataCached,
  getUpcomingFixturesCached,
} from "@/lib/cached-data";
import { computeLeagueTable } from "@/lib/league-table";
import { POSITIONS, type Position } from "@/lib/fantasy-rules";
import { ClubBadge } from "@/components/ClubBadge";
import { FormDots } from "@/components/FormDots";
import { LocalTime } from "@/components/LocalTime";
import { PlayerLine, PlayerLineHeader } from "@/components/PlayerLine";
import { ExpandableList } from "@/components/ExpandableList";
import { DataLoadError } from "@/components/DataLoadError";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const data = await getTableDataCached().catch(() => null);
  const club = data?.clubs.find((c) => c.id === id);
  const t = await getTranslations({ locale, namespace: "clubs" });
  return { title: `${club?.name ?? t("title")} — Fudaristo` };
}

export default async function ClubPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("clubs");
  const tPos = await getTranslations("positions");
  const tPlayers = await getTranslations("players");
  const tTable = await getTranslations("table");

  let data: Awaited<ReturnType<typeof getTableDataCached>>;
  let players: any[] = [];
  let ratings: { player_id: string; avg_rating: number }[] = [];
  let upcoming: any[] = [];
  try {
    [data, players, ratings, upcoming] = await Promise.all([
      getTableDataCached(),
      getActivePlayersCached(),
      getAvgRatingsCached().catch(() => []),
      getUpcomingFixturesCached().catch(() => []),
    ]);
  } catch (e) {
    console.error("[/klubovi/id]", e);
    return (
      <div>
        <h2 className="font-display text-2xl mb-4">{t("title")}</h2>
        <DataLoadError whatKey="whatTable" error={{ message: (e as Error).message }} />
      </div>
    );
  }

  const club = data.clubs.find((c) => c.id === id);
  if (!club) notFound();

  const rows = computeLeagueTable(data.clubs, data.fixtures);
  const row = rows.find((r) => r.clubId === id)!;
  const playedAny = rows.some((r) => r.played > 0);
  const nameById = new Map(data.clubs.map((c) => [c.id, c]));
  const ratingByPlayer = new Map(ratings.map((r) => [r.player_id, Number(r.avg_rating)]));

  const jerseyPhoto: string | null = players.find((p) => p.club_id === id)?.clubs?.jersey_photo_url ?? null;
  const squad = players
    .filter((p) => p.club_id === id)
    .map((p) => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      position: p.position as Position,
      price: Number(p.price),
      status: p.status as string,
      total_points: p.total_points ?? 0,
      avg_rating: ratingByPlayer.get(p.id) ?? null,
    }));

  const nextMatches = upcoming
    .filter((f) => f.home_club_id === id || f.away_club_id === id)
    .map((f) => {
      const home = f.home_club_id === id;
      const opp = nameById.get(home ? f.away_club_id : f.home_club_id);
      return { opp, home, kickoffAt: f.kickoff_at as string };
    });

  // Poslednji odigrani mečevi (najnoviji prvi).
  const results = data.fixtures
    .filter((f) => (f.home_club_id === id || f.away_club_id === id) && f.home_score != null && f.away_score != null)
    .slice(-5)
    .reverse()
    .map((f) => {
      const home = f.home_club_id === id;
      const gf = (home ? f.home_score : f.away_score) as number;
      const ga = (home ? f.away_score : f.home_score) as number;
      return {
        opp: nameById.get(home ? f.away_club_id : f.home_club_id),
        home,
        gf,
        ga,
        r: gf > ga ? ("W" as const) : gf === ga ? ("D" as const) : ("L" as const),
      };
    });

  const formLabels = { W: tTable("formW"), D: tTable("formD"), L: tTable("formL") };
  const statusLabel = (s: string) => (s === "available" ? null : tPlayers(`status_${s}` as "status_injured"));

  return (
    <div>
      <Link href="/klubovi" className="text-xs font-bold text-gold-300 hover:text-gold-400">
        ← {t("allClubs")}
      </Link>

      <div className="flex items-center gap-4 mt-3 mb-6">
        <ClubBadge short={club.short_name} color={club.primary_color} size={72} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl sm:text-3xl leading-tight">{club.name}</h2>
          {playedAny && (
            <p className="text-sm text-slate-400 mt-1">
              {t("rankPoints", { rank: row.rank, points: row.points })} · {t("playedWdl", { played: row.played, won: row.won, drawn: row.drawn, lost: row.lost })}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        {/* Igrači po pozicijama */}
        <section className="flex flex-col gap-4 min-w-0">
          {squad.length === 0 && <p className="text-slate-400 text-sm">{t("noPlayers")}</p>}
          {POSITIONS.map((pos) => {
            const list = squad.filter((p) => p.position === pos).sort((a, b) => b.price - a.price);
            if (list.length === 0) return null;
            return (
              <div key={pos} className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
                <h3 className="font-display text-lg px-4 sm:px-5 pt-4">{tPos(pos)}</h3>
                <PlayerLineHeader
                  hasJersey
                  price={tPlayers("colPrice")}
                  points={tPlayers("colPoints")}
                  rating={tPlayers("colRating")}
                />
                <ul className="divide-y divide-navy-700 mt-1">
                  {list.map((p) => (
                    <li key={p.id} className="px-4 sm:px-5 py-2.5 text-sm">
                      <PlayerLine
                        player={p}
                        statusLabel={statusLabel(p.status)}
                        jersey={{ color: club.primary_color, photoUrl: jerseyPhoto }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        {/* Mečevi */}
        <aside className="flex flex-col gap-4">
          <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
            <h3 className="font-display text-lg mb-2">{t("upcoming")}</h3>
            {nextMatches.length === 0 ? (
              <p className="text-sm text-slate-500">{t("noNext")}</p>
            ) : (
              <ExpandableList
                limit={5}
                className="divide-y divide-navy-700"
                moreLabel={t("showAll", { count: Math.max(0, nextMatches.length - 5) })}
                lessLabel={t("showLess")}
              >
                {nextMatches.map((m, i) => (
                  <li key={i} className="py-2 flex items-center gap-2.5 text-sm">
                    <ClubBadge short={m.opp?.short_name ?? "?"} color={m.opp?.primary_color ?? "#93ADCC"} size={26} />
                    <span className="flex-1 min-w-0 truncate font-semibold">
                      {m.opp?.name ?? "?"} <span className="text-slate-500 font-normal">({m.home ? "H" : "A"})</span>
                    </span>
                    <span className="text-xs text-slate-400 tabular-nums shrink-0">
                      <LocalTime
                        iso={m.kickoffAt}
                        options={{ day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }}
                      />
                    </span>
                  </li>
                ))}
              </ExpandableList>
            )}
          </div>

          <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h3 className="font-display text-lg">{t("results")}</h3>
              <FormDots results={row.form} labels={formLabels} />
            </div>
            {results.length === 0 ? (
              <p className="text-sm text-slate-500">{t("noResults")}</p>
            ) : (
              <ul className="divide-y divide-navy-700">
                {results.map((m, i) => (
                  <li key={i} className="py-2 flex items-center gap-2.5 text-sm">
                    <ClubBadge short={m.opp?.short_name ?? "?"} color={m.opp?.primary_color ?? "#93ADCC"} size={26} />
                    <span className="flex-1 min-w-0 truncate font-semibold">
                      {m.opp?.name ?? "?"} <span className="text-slate-500 font-normal">({m.home ? "H" : "A"})</span>
                    </span>
                    <span
                      className={`shrink-0 font-display tabular-nums px-2 py-0.5 rounded ${
                        m.r === "W" ? "bg-pitch-500/20 text-pitch-400" : m.r === "L" ? "bg-danger-400/15 text-danger-400" : "bg-navy-700 text-slate-300"
                      }`}
                    >
                      {m.gf}:{m.ga}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
