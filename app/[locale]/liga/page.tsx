import { createClient } from "@/lib/supabase/server";
import { selectAllPages } from "@/lib/db-paging";
import { StandingsTable, type StandingsRow } from "./standings-table";
import { DataLoadError } from "@/components/DataLoadError";
import { getTranslations, setRequestLocale } from "next-intl/server";

export const metadata = { title: "Globalna liga — Fudaristo" };

/**
 * Faza 9 — globalna rang lista.
 *
 * Izvor je `v_global_league_standings` (schema.sql): rang se računa iz
 * user_gameweek_points, NE iz users.total_points keša. Scoring engine održava
 * oba i treba da se poklapaju — ali ako se ikad raziđu, tačan je view, jer keš
 * je samo ubrzanje.
 *
 * Kolona "kolo" dolazi iz poslednjeg ZAKLJUČANOG kola. Namerno ne prikazuje
 * kolo u toku: dok obračun nije gotov ti brojevi su nule ili polovični, a rang
 * lista koja se menja u toku vikenda bez objašnjenja je gora od nikakve.
 */
export default async function LigaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: standings, error } = await supabase
    .from("v_global_league_standings")
    .select("user_id, team_name, team_color, total_points, rank")
    .order("total_points", { ascending: false })
    .order("user_id", { ascending: true })
    .range(0, 999);

  if (error) {
    console.error("[/liga] v_global_league_standings:", error);
    return (
      <Shell>
        <DataLoadError whatKey="whatLeague" error={error} />
      </Shell>
    );
  }

  // Poslednje zaključano kolo — jedino čiji su poeni konačni.
  const { data: lastFinalized } = await supabase
    .from("gameweeks")
    .select("id, number")
    .eq("status", "finalized")
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();

  let gwPointsByUser = new Map<string, number>();
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
    gwPointsByUser = new Map(gwRows.map((r) => [r.user_id, r.total_points]));
  }

  const rows: StandingsRow[] = (standings ?? []).map((s: any) => ({
    userId: s.user_id,
    teamName: s.team_name,
    teamColor: s.team_color ?? "#8494AC",
    totalPoints: s.total_points ?? 0,
    gameweekPoints: gwPointsByUser.get(s.user_id) ?? null,
    rank: Number(s.rank),
  }));

  if (rows.length === 0) {
    return (
      <Shell>
        <EmptyLeague />
      </Shell>
    );
  }

  return (
    <Shell>
      <StandingsTable
        rows={rows}
        currentUserId={user?.id ?? null}
        gameweekNumber={lastFinalized?.number ?? null}
      />
    </Shell>
  );
}

async function EmptyLeague() {
  const t = await getTranslations("league");
  return <p className="text-slate-400">{t("noTeams")}</p>;
}

async function Shell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("league");
  return (
    <div>
      <h2 className="font-display text-2xl mb-1">{t("title")}</h2>
      <p className="text-slate-400 text-sm mb-6">{t("subtitle")}</p>
      {children}
    </div>
  );
}
