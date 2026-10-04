import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { getTargetGameweek } from "@/lib/gameweek";
import { DeadlineCountdown } from "@/components/DeadlineCountdown";
import { getMostSelectedCached, getRoundMatchesCached, getTableDataCached } from "@/lib/cached-data";
import { loadLeague } from "@/lib/league-data";
import { loadStats } from "@/lib/stats-data";
import { HeroPanel, NextMatchesCard, StatusStrip, SuperLeagueCard } from "./home-sections";
import { TeamOfWeekBoard } from "@/components/TeamOfWeekBoard";
import { computeLeagueTable } from "@/lib/league-table";
import { pickFeaturedMatch } from "@/lib/featured-match";

/**
 * Poziv na akciju zavisi od toga dokle je korisnik stigao. Ranije je svima
 * pisalo "Napravi svoj klub" i vodilo na registraciju — i onome ko je
 * prijavljen i odavno sastavio tim.
 *
 * Tri stanja: neprijavljen → registracija; prijavljen bez sastava → sastavi;
 * prijavljen sa sastavom → otvori klub.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, supabase, user] = await Promise.all([
    getTranslations("home"),
    createClient(),
    getCurrentUser(),
  ]);

  // Rok sledećeg otvorenog kola — javan podatak, treba i neprijavljenom
  // posetiocu za odbrojavanje na hero sekciji. Profil ide istovremeno.
  const [targetGw, profileRes] = await Promise.all([
    getTargetGameweek(supabase),
    user
      ? supabase.from("users").select("team_name, budget_remaining").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let hasSquad = false;
  const teamName: string | null = profileRes.data?.team_name ?? null;

  // Sastav se traži za kolo koje se trenutno uređuje — isto kolo koje
  // otvara /moj-tim, da poruka ovde i stranica tamo ne govore različito.
  if (user && targetGw) {
    const { count } = await supabase
      .from("squads")
      .select("player_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("gameweek_id", targetGw.id);
    hasSquad = (count ?? 0) > 0;
  }

  // Javni podaci za kartice (keširani) — istovremeno. Liga se učitava samo za
  // prijavljene: gost ne dobija prave podatke u HTML-u.
  const [roundMatches, league, stats, tableData, mostSelected] = await Promise.all([
    targetGw
      ? getRoundMatchesCached(targetGw.id).catch((e) => {
          console.error("[/] round matches:", e);
          return [] as any[];
        })
      : Promise.resolve([] as any[]),
    user ? loadLeague() : Promise.resolve(null),
    loadStats().catch((e) => {
      console.error("[/] stats:", e);
      return null;
    }),
    getTableDataCached().catch((e) => {
      console.error("[/] table:", e);
      return { clubs: [], fixtures: [] };
    }),
    getMostSelectedCached().catch((e) => {
      console.error("[/] most selected:", e);
      return { gameweekNumber: null as number | null, players: [] as any[] };
    }),
  ]);
  const tableRows = computeLeagueTable(tableData.clubs, tableData.fixtures);
  const featuredMatch = pickFeaturedMatch(
    roundMatches,
    new Map(tableRows.map((r) => [r.name, r.rank]))
  );

  const leagueRows = league && !league.error ? league.standings : null;
  const myStanding = user && leagueRows ? leagueRows.find((r: any) => r.user_id === user.id) : null;
  const gwPointValues = league && !league.error ? [...league.gwPointsByUser.values()] : [];
  const myGwPoints = user && league && !league.error ? league.gwPointsByUser.get(user.id) ?? null : null;
  const avgGwPoints =
    gwPointValues.length > 0 ? gwPointValues.reduce((a, b) => a + b, 0) / gwPointValues.length : null;

  const cta = !user
    ? { href: "/register", label: t("ctaNew") }
    : hasSquad
      ? { href: "/moj-tim", label: t("ctaOpen") }
      : { href: "/moj-tim", label: t("ctaBuild") };

  return (
    <div className="flex flex-col gap-6 sm:gap-8 py-1 sm:py-2">
      <section className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-12">
        <div className="flex flex-col items-start gap-3 sm:gap-4 lg:gap-5 flex-1 min-w-0">
          {targetGw && (
            <span className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-bold uppercase tracking-[0.12em] text-gold-300">
              <i className="w-2 h-2 rounded-full bg-pitch-400 shadow-[0_0_0_4px_rgba(87,201,131,0.18)]" />
              {t("eyebrow", { number: targetGw.number })}
            </span>
          )}
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold max-w-xl leading-[1.05]">
            {user && teamName
              ? t.rich("welcomeBack", {
                  teamName,
                  b: (chunks) => <span className="text-gold-300">{chunks}</span>,
                })
              : t("headline")}
          </h1>
          <p className="text-slate-300 max-w-md leading-relaxed text-sm sm:text-base">
            {user && hasSquad ? t("pitchReturning") : t("pitch")}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={cta.href}
              className="bg-gold-400 text-navy-950 font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-gold-300 transition-colors"
            >
              {cta.label}
            </Link>
            {user && hasSquad && (
              <Link
                href="/liga"
                className="border border-navy-600 text-slate-300 font-semibold text-sm px-5 py-2.5 rounded-lg hover:text-chalk-50 hover:border-slate-500 transition-colors"
              >
                {t("ctaLeague")}
              </Link>
            )}
          </div>

          {targetGw && (
            <DeadlineCountdown deadlineAt={targetGw.deadline_at} gameweekNumber={targetGw.number} />
          )}

        </div>

        <HeroPanel match={featuredMatch} gwNumber={targetGw?.number ?? null} mostSelected={mostSelected} />
      </section>

      {user && (
        <StatusStrip
          rank={myStanding ? Number((myStanding as any).rank) : null}
          gwPoints={myGwPoints}
          total={myStanding ? (myStanding as any).total_points ?? 0 : null}
          budget={profileRes.data?.budget_remaining != null ? Number(profileRes.data.budget_remaining) : null}
          labels={{
            rank: t("statRank"),
            gw: t("statGw", { number: league && !league.error ? league.lastFinalized?.number ?? "—" : "—" }),
            avg: avgGwPoints !== null ? t("statAvg", { avg: avgGwPoints.toFixed(0) }) : null,
            total: t("statTotal"),
            budget: t("statBudget"),
          }}
        />
      )}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {targetGw && <NextMatchesCard matches={roundMatches} gwNumber={targetGw.number} />}
        <SuperLeagueCard rows={tableRows} />
      </section>

      {/* Ceo Tim kola — teren sa imenima i poenima + spisak, isto kao u Statistikama. */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="font-display text-xl sm:text-2xl">
            {stats?.data.teamOfWeek
              ? t("totwTitle", { number: stats.data.teamOfWeek.gameweekNumber })
              : t("totwTitle", { number: "—" })}
          </h2>
          <Link href="/statistike" className="text-xs font-bold text-gold-300 hover:text-gold-400 whitespace-nowrap">
            {t("statsLink")} →
          </Link>
        </div>
        {stats?.data.teamOfWeek ? (
          <TeamOfWeekBoard data={stats.data.teamOfWeek} layout="split" />
        ) : (
          <p className="text-sm text-slate-400 bg-navy-800 border border-navy-700 rounded-xl p-4">{t("noTotw")}</p>
        )}
      </section>

      {!user && (
        <>
          <section>
            <h2 className="font-display text-xl sm:text-2xl mb-3">{t("howItWorksTitle")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <HowItWorksStep number={1} title={t("step1Title")} body={t("step1Body")} />
              <HowItWorksStep number={2} title={t("step2Title")} body={t("step2Body")} />
              <HowItWorksStep number={3} title={t("step3Title")} body={t("step3Body")} />
            </div>
          </section>

          <section className="rounded-2xl border border-navy-600 bg-navy-900 bg-[radial-gradient(700px_180px_at_100%_0,rgba(90,180,255,0.20),transparent)] px-5 sm:px-8 py-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl sm:text-2xl">
                {targetGw ? t("ctaBandTitle", { number: targetGw.number }) : t("ctaBandTitleNoGw")}
              </h2>
              <p className="text-sm text-slate-300 mt-1">{t("ctaBandBody")}</p>
            </div>
            <Link
              href="/register"
              className="bg-gold-400 text-navy-950 font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-gold-300 transition-colors"
            >
              {t("ctaNew")}
            </Link>
          </section>
        </>
      )}
    </div>
  );
}

function HowItWorksStep({ number, title, body }: { number: number; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="shrink-0 w-8 h-8 rounded-full bg-gold-400 text-navy-950 font-display font-bold grid place-items-center">
        {number}
      </span>
      <div>
        <h3 className="font-display text-base sm:text-lg leading-tight mb-0.5">{title}</h3>
        <p className="text-[13.5px] text-slate-400">{body}</p>
      </div>
    </div>
  );
}
