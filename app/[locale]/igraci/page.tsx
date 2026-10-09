import { getTranslations, setRequestLocale } from "next-intl/server";
import { getActivePlayersCached, getAvgRatingsCached, getUpcomingFixturesCached } from "@/lib/cached-data";
import { DataLoadError } from "@/components/DataLoadError";
import { PlayersBoard, type BoardClub } from "./players-board";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "players" });
  return { title: `${t("title")} — Fudaristo` };
}

/** Svi igrači grupisani po klubu — javna stranica, podaci iz keša. */
export default async function IgraciPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("players");

  let players: any[];
  let ratings: { player_id: string; avg_rating: number }[] = [];
  let upcoming: any[] = [];
  try {
    [players, ratings, upcoming] = await Promise.all([
      getActivePlayersCached(),
      getAvgRatingsCached().catch(() => []),
      getUpcomingFixturesCached().catch(() => []),
    ]);
  } catch (e) {
    console.error("[/igraci]", e);
    return (
      <div>
        <h2 className="font-display text-2xl mb-4">{t("title")}</h2>
        <DataLoadError whatKey="whatTable" error={{ message: (e as Error).message }} />
      </div>
    );
  }

  const ratingByPlayer = new Map(ratings.map((r) => [r.player_id, Number(r.avg_rating)]));

  // Naredna 3 meča po klubu, isti oblik kao u prozorčiću igrača na /moj-tim.
  const upcomingByClub: Record<string, { label: string; kickoffAt: string }[]> = {};
  const push = (clubId: string, label: string, kickoffAt: string) => {
    const list = (upcomingByClub[clubId] ??= []);
    if (list.length < 3) list.push({ label, kickoffAt });
  };
  for (const f of upcoming) {
    push(f.home_club_id, `${f.away?.short_name ?? "?"} (H)`, f.kickoff_at);
    push(f.away_club_id, `${f.home?.short_name ?? "?"} (A)`, f.kickoff_at);
  }

  // Grupisanje po klubu: klubovi po imenu, igrači unutar kluba po ceni.
  const byClub = new Map<string, BoardClub>();
  for (const p of players) {
    const key = p.club_id as string;
    if (!byClub.has(key)) {
      byClub.set(key, {
        id: key,
        name: p.clubs?.name ?? "?",
        short: p.clubs?.short_name ?? "?",
        color: p.clubs?.primary_color ?? "#93ADCC",
        jerseyPhoto: p.clubs?.jersey_photo_url ?? null,
        players: [],
      });
    }
    byClub.get(key)!.players.push({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      position: p.position,
      price: Number(p.price),
      status: p.status,
      total_points: p.total_points ?? 0,
      avg_rating: ratingByPlayer.get(p.id) ?? null,
    });
  }
  const clubs = [...byClub.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const c of clubs) c.players.sort((a, b) => b.price - a.price);

  return (
    <div>
      <h2 className="font-display text-2xl mb-1">{t("title")}</h2>
      <p className="text-slate-400 text-sm mb-5">{t("lead")}</p>
      <PlayersBoard clubs={clubs} upcomingByClub={upcomingByClub} />
    </div>
  );
}
