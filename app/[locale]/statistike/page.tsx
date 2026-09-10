import { createClient } from "@/lib/supabase/server";
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
      .select("number")
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

  const data: StatsData = {
    byPosition: (byPosition.data ?? []).map((r: any) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`,
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
        name: `${r.first_name} ${r.last_name}`,
        clubName: r.club_name,
        value: Number(r.total_goals),
      })),
    assists: (assists.data ?? [])
      .filter((r: any) => Number(r.total_assists) > 0)
      .map((r: any) => ({
        id: r.id,
        name: `${r.first_name} ${r.last_name}`,
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
  };

  const hasAnything =
    data.byPosition.length + data.scorers.length + data.assists.length + data.clubs.length > 0;

  if (!hasAnything) {
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
