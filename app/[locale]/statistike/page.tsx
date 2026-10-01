import { loadStats } from "@/lib/stats-data";
import { StatsBoard, type StatsData } from "./stats-board";
import { DataLoadError } from "@/components/DataLoadError";
import { getTranslations, setRequestLocale } from "next-intl/server";

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

  let stats: { data: StatsData; lastGameweek: number | null };
  try {
    stats = await loadStats();
  } catch (e) {
    return (
      <Shell>
        <DataLoadError whatKey="whatStats" error={(e as { pg?: any }).pg ?? { message: (e as Error).message }} />
      </Shell>
    );
  }
  const { data, lastGameweek } = stats;

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
    <Shell lastGameweek={lastGameweek}>
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
