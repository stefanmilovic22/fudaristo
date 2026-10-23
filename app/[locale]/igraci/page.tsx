import { getTranslations, setRequestLocale } from "next-intl/server";
import { getActivePlayersCached, getAvgRatingsCached, getTableDataCached, getUpcomingFixturesCached } from "@/lib/cached-data";
import { computeDifficulty } from "@/lib/fdr";
import { POSITIONS } from "@/lib/fantasy-rules";
import { getLastPriceChanges } from "@/lib/price-changes";
import { ActionLink } from "@/components/ActionLink";
import { PriceIcon } from "@/components/icons";
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
  let tableData: { clubs: any[]; fixtures: any[] } = { clubs: [], fixtures: [] };
  let priceChanges: Awaited<ReturnType<typeof getLastPriceChanges>> = { changedAt: null, gameweekNumber: null, rows: [] };
  try {
    [players, ratings, upcoming, priceChanges, tableData] = await Promise.all([
      getActivePlayersCached(),
      getAvgRatingsCached().catch(() => []),
      getUpcomingFixturesCached().catch(() => []),
      // Pre pokretanja migracije 017 / pre prve izmene nema istorije — strelica se ne prikazuje.
      getLastPriceChanges().catch(() => ({ changedAt: null, gameweekNumber: null, rows: [] })),
      getTableDataCached().catch(() => ({ clubs: [] as any[], fixtures: [] as any[] })),
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

  const deltaByPlayer = new Map(priceChanges.rows.map((r) => [r.playerId, Math.round((r.newPrice - r.oldPrice) * 10) / 10]));
  const ratingByPlayer = new Map(ratings.map((r) => [r.player_id, Number(r.avg_rating)]));

  // Naredna 3 meča po klubu, isti oblik kao u prozorčiću igrača na /moj-tim.
  const difficulty = computeDifficulty(tableData.clubs, tableData.fixtures);
  const upcomingByClub: Record<string, { label: string; kickoffAt: string; difficulty?: number }[]> = {};
  const push = (clubId: string, label: string, kickoffAt: string, opponentId: string) => {
    const list = (upcomingByClub[clubId] ??= []);
    if (list.length < 3) list.push({ label, kickoffAt, difficulty: difficulty.get(opponentId) });
  };
  for (const f of upcoming) {
    push(f.home_club_id, `${f.away?.short_name ?? "?"} (H)`, f.kickoff_at, f.away_club_id);
    push(f.away_club_id, `${f.home?.short_name ?? "?"} (A)`, f.kickoff_at, f.home_club_id);
  }

  // Grupisanje po klubu: klubovi po imenu, igrači unutar kluba po poziciji pa ceni.
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
      priceDelta: deltaByPlayer.get(p.id),
    });
  }
  const clubs = [...byClub.values()].sort((a, b) => a.name.localeCompare(b.name));
  // Isti redosled kao na stranici kluba: golmani, odbrana, sredina, napad —
  // unutar pozicije od najskupljeg.
  for (const c of clubs) {
    c.players.sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || b.price - a.price);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="min-w-0 flex-1 basis-[260px]">
          <h2 className="font-display text-2xl mb-1">{t("title")}</h2>
          <p className="text-slate-400 text-sm">{t("lead")}</p>
        </div>
        <ActionLink href="/igraci/cene" icon={PriceIcon} label={t("priceChangesLink")} shortLabel={t("priceChangesLink")} variant="plan" inline />
      </div>
      <PlayersBoard clubs={clubs} upcomingByClub={upcomingByClub} />
    </div>
  );
}
