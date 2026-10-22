import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { createClient } from "@/lib/supabase/server";
import { loadLeague } from "@/lib/league-data";
import { countMyLeagues, loadMyLeagues, type LeagueSummary } from "@/lib/leagues";
import { StandingsTable, type StandingsRow } from "./standings-table";
import { DataLoadError } from "@/components/DataLoadError";
import { LeagueActions } from "@/components/LeagueActions";
import { ClubBadge } from "@/components/ClubBadge";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/EmptyState";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "league" });
  return { title: `${t("pageTitle")} — Fudaristo` };
}

/**
 * Stranica „Lige“: tab „Globalna liga“ (rang lista svih timova) i tab „Moje
 * lige“ (privatne lige sa šifrom pozivnice, migracija 016).
 *
 * Globalna rang lista: izvor je `v_global_league_standings` (schema.sql) —
 * rang se računa iz user_gameweek_points, NE iz users.total_points keša. Kolona
 * „kolo“ dolazi iz poslednjeg ZAKLJUČANOG kola; kolo u toku se namerno ne
 * prikazuje jer su njegovi brojevi nule ili polovični.
 */
export default async function LigaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  const { tab } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("league");
  const mine = tab === "moje";

  const user = await getCurrentUser();

  // Pun spisak (svaka liga traži svoj upit za članove) samo na tabu „Moje lige";
  // na globalnom tabu treba samo broj za značku — jedan lak upit.
  let myLeagues: LeagueSummary[] = [];
  let myLeagueCount = 0;
  if (user) {
    const supabase = await createClient();
    if (mine) {
      myLeagues = await loadMyLeagues(supabase, user.id);
      myLeagueCount = myLeagues.length;
    } else {
      myLeagueCount = await countMyLeagues(supabase, user.id).catch(() => 0);
    }
  }

  return (
    <div>
      <h2 className="font-display text-2xl mb-1">{t("pageTitle")}</h2>
      <p className="text-slate-400 text-sm mb-5">{t("pageSubtitle")}</p>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <nav className="flex bg-navy-800 border border-navy-700 rounded-xl p-1 gap-1" aria-label={t("pageTitle")}>
          <TabLink href="/liga" active={!mine}>
            {t("tabGlobal")}
          </TabLink>
          <TabLink href="/liga?tab=moje" active={mine}>
            {t("tabMine")}
            {myLeagueCount > 0 && (
              <span className="ml-1.5 text-[11px] bg-black/25 rounded-full px-1.5 py-px">{myLeagueCount}</span>
            )}
          </TabLink>
        </nav>
        {user && <LeagueActions />}
      </div>

      {mine ? <MyLeagues leagues={myLeagues} /> : <GlobalLeague userId={user?.id ?? null} />}
    </div>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${
        active ? "bg-gold-400 text-navy-950" : "text-slate-400 hover:text-chalk-50"
      }`}
    >
      {children}
    </Link>
  );
}

async function MyLeagues({ leagues }: { leagues: LeagueSummary[] }) {
  const t = await getTranslations("league");

  if (leagues.length === 0) {
    return (
      <section className="bg-navy-800 border border-gold-400/50 rounded-xl px-4 py-9 text-center">
        <div className="text-3xl mb-2" aria-hidden>
          🏆
        </div>
        <h3 className="font-display text-lg">{t("noLeaguesTitle")}</h3>
        <p className="text-slate-400 text-sm mt-1">{t("noLeaguesText")}</p>
      </section>
    );
  }

  return (
    <section className="bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden">
      <div className="bg-navy-700 border-b border-gold-400/30 px-4 py-2.5">
        <h3 className="font-display text-sm uppercase tracking-wider text-gold-300">{t("tabMine")}</h3>
      </div>
      <ul>
        {leagues.map((l) => (
          <li key={l.id} className="border-t border-navy-700 first:border-t-0">
            <Link href={`/liga/${l.id}`} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-navy-700/50 transition-colors">
              <ClubBadge short={l.name.slice(0, 2).toUpperCase()} color="#5AB4FF" size={44} className="!rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{l.name}</div>
                <div className="text-slate-400 text-xs mt-0.5">
                  {t("membersCount", { count: l.members })} · {t("codeShort", { code: l.inviteCode })}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-display text-2xl font-bold leading-none">{l.myRank ?? "–"}</div>
                <div className="text-slate-400 text-[11px] mt-1">{t("myRank")}</div>
              </div>
              <span className="text-gold-300 text-xl" aria-hidden>
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function GlobalLeague({ userId }: { userId: string | null }) {
  const t = await getTranslations("league");
  const league = await loadLeague();

  if (league.error) return <DataLoadError whatKey="whatLeague" error={league.error} />;
  const { standings, lastFinalized, gwPointsByUser } = league;

  const rows: StandingsRow[] = (standings ?? []).map((s: any) => ({
    userId: s.user_id,
    teamName: s.team_name,
    teamColor: s.team_color ?? "#8494AC",
    totalPoints: s.total_points ?? 0,
    gameweekPoints: gwPointsByUser.get(s.user_id) ?? null,
    rank: Number(s.rank),
  }));

  if (rows.length === 0) return <EmptyState icon="users" title={t("noTeams")} />;

  return (
    <StandingsTable rows={rows} currentUserId={userId} gameweekNumber={lastFinalized?.number ?? null} />
  );
}
