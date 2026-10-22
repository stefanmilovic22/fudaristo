import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/current-user";
import type { StandingRow } from "@/lib/leagues";
import { StandingsTable, type StandingsRow } from "../standings-table";
import { InviteCard } from "@/components/InviteCard";
import { LeaveLeagueButton } from "@/components/LeagueMemberButtons";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "league" });
  return { title: `${t("pageTitle")} — Fudaristo` };
}

/**
 * Jedna privatna liga: šifra pozivnice, poredak članova i „Napusti ligu“.
 * RLS (migracija 016) vraća ligu samo članovima, pa ne-član dobija 404 — ne
 * otkriva se ni da liga postoji.
 */
export default async function LeaguePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!UUID.test(id)) notFound();

  const [t, user, supabase] = await Promise.all([getTranslations("league"), getCurrentUser(), createClient()]);

  const [{ data: league }, { data: standingsData }, { data: lastFinalized }] = await Promise.all([
    supabase.from("leagues").select("id, name, invite_code, created_by, is_global").eq("id", id).maybeSingle(),
    supabase.rpc("league_standings", { p_league_id: id }),
    supabase
      .from("gameweeks")
      .select("id, number")
      .eq("status", "finalized")
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!league || league.is_global) notFound();
  const standings = ((standingsData ?? []) as StandingRow[]).slice().sort((a, b) => Number(a.rank) - Number(b.rank));
  // Nije član (RLS bi već vratio prazno), ali dodatna provera ne košta.
  if (!user || !standings.some((s) => s.user_id === user.id)) notFound();

  const memberIds = standings.map((s) => s.user_id);
  const [{ data: gwRows }, { data: creator }] = await Promise.all([
    lastFinalized
      ? supabase
          .from("user_gameweek_points")
          .select("user_id, total_points")
          .eq("gameweek_id", lastFinalized.id)
          .in("user_id", memberIds)
      : Promise.resolve({ data: [] as { user_id: string; total_points: number }[] }),
    league.created_by
      ? supabase.from("users").select("team_name").eq("id", league.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const gwByUser = new Map<string, number>((gwRows ?? []).map((r) => [r.user_id, r.total_points]));

  const rows: StandingsRow[] = standings.map((s) => ({
    userId: s.user_id,
    teamName: s.team_name,
    teamColor: s.team_color ?? "#8494AC",
    totalPoints: Number(s.total_points ?? 0),
    gameweekPoints: gwByUser.get(s.user_id) ?? null,
    rank: Number(s.rank),
  }));

  return (
    <div>
      <Link href="/liga?tab=moje" className="text-slate-400 text-sm hover:text-chalk-50">
        ← {t("pageTitle")}
      </Link>
      <h2 className="font-display text-2xl mt-2">{league.name}</h2>
      <p className="text-slate-400 text-sm mb-5">
        {t("membersCount", { count: standings.length })}
        {creator?.team_name && <> · {t("createdBy", { name: creator.team_name })}</>}
      </p>

      <div className="mb-5">
        <InviteCard code={league.invite_code ?? ""} leagueName={league.name} />
      </div>

      <StandingsTable rows={rows} currentUserId={user.id} gameweekNumber={lastFinalized?.number ?? null} />

      <div className="mt-5">
        <LeaveLeagueButton leagueId={league.id} />
      </div>
    </div>
  );
}
