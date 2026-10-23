import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { localePath } from "@/lib/locale-path";
import { getTargetGameweek, isBuildingFirstSquad } from "@/lib/gameweek";
import {
  getActivePlayersCached,
  getAvgRatingsCached,
  getFixturesForGameweeksCached,
  getGameweeksCached,
  getTableDataCached,
} from "@/lib/cached-data";
import { computeDifficulty } from "@/lib/fdr";
import type { SelectablePlayer } from "@/lib/fantasy-rules";
import { EmptyState } from "@/components/EmptyState";
import { Planner, type PlannerFixtures } from "./planner";

const PLAN_GAMEWEEKS = 3;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "planner" });
  return { title: `${t("title")} — Fudaristo` };
}

/**
 * Planer transfera: simulacija 3 kola unapred. Ništa se ne upisuje u bazu —
 * plan živi u pregledaču (planner.tsx), a stvarni transferi se i dalje prave
 * na „Moj klub". Ova stranica samo učitava ono što simulaciji treba: tvoj
 * sastav za naredno kolo, kasu, slobodne transfere, sve igrače i raspored.
 */
export default async function PlanerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, supabase, user] = await Promise.all([getTranslations("planner"), createClient(), getCurrentUser()]);
  if (!user) redirect(await localePath("/login?redirect=/planer"));

  const unavailable = (title: string, body: string) => (
    <div className="max-w-xl mx-auto py-6">
      <EmptyState
        icon="calendar"
        title={title}
        body={body}
        action={
          <Link href="/moj-tim" className="text-sm font-bold px-4 py-2 rounded-lg bg-gold-400 text-navy-950 hover:bg-gold-300">
            {t("openTeam")}
          </Link>
        }
      />
    </div>
  );

  const targetGw = await getTargetGameweek(supabase);
  if (!targetGw) return unavailable(t("noGwTitle"), t("noGwBody"));

  const readProfile = () =>
    supabase.from("users").select("budget_remaining, free_transfers").eq("id", user.id).single();
  const readSquad = () =>
    supabase
      .from("squads")
      .select(
        "player_id, purchase_price, players(id, first_name, last_name, position, price, status, club_id, total_points, clubs(name, short_name, primary_color, jersey_photo_url))"
      )
      .eq("user_id", user.id)
      .eq("gameweek_id", targetGw.id);

  // Isti prenos sastava kao na „Moj klub" (ne radi ništa ako sastav već postoji),
  // istovremeno sa čitanjem — i ponovno čitanje samo ako ga je prenos tek napravio.
  const [, profileRes, squadRes, players, ratings, tableData, isFirst] = await Promise.all([
    supabase.rpc("carry_over_squad", { p_gameweek_id: targetGw.id }),
    readProfile(),
    readSquad(),
    getActivePlayersCached().catch(() => [] as any[]),
    getAvgRatingsCached().catch(() => [] as { player_id: string; avg_rating: number }[]),
    getTableDataCached().catch(() => ({ clubs: [] as any[], fixtures: [] as any[] })),
    isBuildingFirstSquad(supabase, user.id, targetGw.number),
  ]);
  let profile = profileRes.data;
  let squadRows = squadRes.data as any[] | null;
  if (!squadRows || squadRows.length === 0) {
    const [p2, s2] = await Promise.all([readProfile(), readSquad()]);
    profile = p2.data;
    squadRows = s2.data as any[] | null;
  }

  // Bez sastava nema šta da se planira. Pre prvog roka planer radi, ali je prvo
  // kolo bez penala (transferi su tada neograničeni i besplatni).
  if (!squadRows || squadRows.length === 0 || !profile) {
    return unavailable(t("unavailableTitle"), t("unavailableBody"));
  }

  const ratingByPlayer = new Map(ratings.map((r) => [r.player_id, Number(r.avg_rating)]));
  const selectable: SelectablePlayer[] = players.map((p: any) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    position: p.position,
    price: Number(p.price),
    status: p.status,
    club_id: p.club_id,
    club_name: p.clubs?.name ?? "?",
    club_short: p.clubs?.short_name ?? "?",
    club_color: p.clubs?.primary_color ?? "#8494AC",
    club_jersey_photo_url: p.clubs?.jersey_photo_url ?? null,
    total_points: p.total_points ?? 0,
    avg_rating: ratingByPlayer.get(p.id) ?? null,
  }));
  const byId = new Map(selectable.map((p) => [p.id, p]));

  // Sastav: igrač može da bude neaktivan (otišao iz lige) — onda ga ima samo u sastavu.
  const squad = squadRows.map((r) => {
    const pl = byId.get(r.player_id);
    const raw = r.players;
    const player: SelectablePlayer =
      pl ??
      {
        id: raw.id,
        first_name: raw.first_name,
        last_name: raw.last_name,
        position: raw.position,
        price: Number(raw.price),
        status: raw.status,
        club_id: raw.club_id,
        club_name: raw.clubs?.name ?? "?",
        club_short: raw.clubs?.short_name ?? "?",
        club_color: raw.clubs?.primary_color ?? "#8494AC",
        club_jersey_photo_url: raw.clubs?.jersey_photo_url ?? null,
        total_points: raw.total_points ?? 0,
        avg_rating: null,
      };
    return { player, sellPrice: Number(r.purchase_price) };
  });

  // Kola za planiranje: naredno + sledeća dva (koliko ih postoji u bazi).
  const gameweeks = (await getGameweeksCached())
    .filter((g) => g.number >= targetGw.number && g.status !== "finalized" && g.deadline_at)
    .sort((a, b) => a.number - b.number)
    .slice(0, PLAN_GAMEWEEKS);

  const fixtureRows = await getFixturesForGameweeksCached(gameweeks.map((g) => g.id)).catch(() => [] as any[]);
  const difficulty = computeDifficulty(tableData.clubs, tableData.fixtures);
  const fixtures: PlannerFixtures = gameweeks.map((g) => {
    const byClub: Record<string, { label: string; difficulty?: number }[]> = {};
    const add = (clubId: string, label: string, opponentId: string) => {
      (byClub[clubId] ??= []).push({ label, difficulty: difficulty.get(opponentId) });
    };
    for (const f of fixtureRows.filter((x) => x.gameweek_id === g.id)) {
      add(f.home_club_id, `${f.away?.short_name ?? "?"} (H)`, f.away_club_id);
      add(f.away_club_id, `${f.home?.short_name ?? "?"} (A)`, f.home_club_id);
    }
    return byClub;
  });

  return (
    <Planner
      userId={user.id}
      planKey={targetGw.id}
      gameweeks={gameweeks.map((g) => ({ number: g.number, deadlineAt: g.deadline_at as string }))}
      squad={squad}
      budget={Number(profile.budget_remaining ?? 0)}
      freeNow={Number(profile.free_transfers ?? 0)}
      players={selectable}
      fixtures={fixtures}
      preSeason={isFirst}
    />
  );
}
