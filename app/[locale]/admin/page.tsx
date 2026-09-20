import { Link } from "@/i18n/navigation";
import { getAdminAccess } from "@/lib/admin-guard";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import {
  triggerIngestionAction,
  finalizeGameweekAction,
  setJokerWindowAction,
  backfillFixtureIdsAction,
  refreshResultsAction,
  importFixturesAction,
  skipGameweekAction,
} from "./actions";
import { MaintenancePanel } from "./maintenance-panel";
import { PrepareStatsButton } from "./prepare-stats-button";

/**
 * Poslovi održavanja zovu TheSportsDB sa pauzama zbog rate limita, pa im
 * podrazumevanih 10s na Vercel Hobby planu nije dovoljno. 60s je maksimum na
 * tom planu. Vredi za sve server action-e pokrenute sa ove stranice.
 */
export const maxDuration = 60;

export const metadata = { title: "Admin — Fudaristo" };

const STATUS_LABEL: Record<string, string> = {
  scheduled: "zakazan",
  live: "uživo",
  finished: "završen",
  postponed: "odložen",
  cancelled: "otkazan",
};

const GW_STATUS_LABEL: Record<string, string> = {
  skipped: "ne obračunava se",
  upcoming: "predstojeće",
  in_progress: "u toku",
  data_pulled: "podaci povučeni — čeka pregled",
  admin_reviewed: "pregledano",
  finalized: "zaključano",
};

export default async function AdminPage() {
  const access = await getAdminAccess();
  if (!access.ok) return <AdminAccessDenied access={access} />;
  const { supabase } = access;

  const { data: gameweeks } = await supabase
    .from("gameweeks")
    .select("id, number, status, deadline_at, is_current, joker_window")
    .order("number", { ascending: true });

  const { data: fixtures } = (await supabase
    .from("fixtures")
    .select(
      "id, gameweek_id, kickoff_at, status, home_score, away_score, worldfootball_url, " +
        "home:home_club_id(name), away:away_club_id(name)"
    )
    .order("kickoff_at", { ascending: true })) as any;

  const { data: runs } = await supabase
    .from("ingestion_runs")
    .select("id, kind, started_at, finished_at, fixtures_touched, rounds_checked, errors, triggered_by")
    .order("started_at", { ascending: false })
    .limit(10);

  // Faza 6: koliko je player_gameweek_stats redova potvrđeno po kolu, da bi
  // dugme "Obračunaj poene" moglo da pokaže da li je kolo stvarno spremno
  // pre nego što admin klikne (runScoringForGameweek proverava isto opet
  // na serveru — ovo je samo hint u UI-ju, ne zamena za tu proveru).
  //
  // Broji BAZA (v_gameweek_stat_review, migracija 007), ne Node. Ranije su se
  // povlačili svi player_gameweek_stats redovi i brojali ovde — ali Supabase
  // vraća najviše 1000 redova po zahtevu, ćutke, a kroz sezonu ih bude ~6.000,
  // pa bi brojevi tiho postali pogrešni već posle par kola.
  const { data: statFlags } = await supabase
    .from("v_gameweek_stat_review")
    .select("gameweek_id, total, reviewed");

  // Isto, ali po MEČU — da se u spisku vidi gde je stalo, umesto samo zbira
  // na nivou kola. "0/437" ne govori ni gde da se počne.
  const { data: perFixture } = await supabase
    .from("player_gameweek_stats")
    .select("fixture_id, is_admin_reviewed")
    .order("fixture_id");

  const fixtureReview = new Map<string, { total: number; reviewed: number }>();
  for (const row of (perFixture ?? []) as any[]) {
    const c = fixtureReview.get(row.fixture_id) ?? { total: 0, reviewed: 0 };
    c.total++;
    if (row.is_admin_reviewed) c.reviewed++;
    fixtureReview.set(row.fixture_id, c);
  }

  const reviewCounts = new Map<string, { total: number; reviewed: number }>(
    (statFlags ?? []).map((s: any) => [s.gameweek_id, { total: s.total, reviewed: s.reviewed }])
  );

  // Fokus panela: sve što nije zaključano, a ima ikakvog traga odigravanja.
  //
  // Ranije se gledao SAMO status kola. Problem: status menja jedino ingestion,
  // pa kolo kom su rezultati uneti ručno ostaje "upcoming" — i tada se u
  // panelu nije pojavljivalo UOPŠTE. Nijedan meč nije bio klikabilan, a "Sva
  // kola" ispod su obični <span>, pa se do statistike nije moglo doći ni
  // zaobilazno.
  const attentionGws = (gameweeks ?? []).filter((g) => {
    if (g.status === "finalized" || g.status === "skipped") return false;
    if (g.status === "in_progress" || g.status === "data_pulled" || g.status === "admin_reviewed") {
      return true;
    }
    // "upcoming", ali mečevi su se već odigrali (ručni unos, odloženi meč).
    return (fixtures ?? []).some(
      (f: any) =>
        f.gameweek_id === g.id &&
        (f.status === "finished" || f.status === "cancelled" || f.status === "live")
    );
  });
  const finalizedGws = (gameweeks ?? []).filter((g) => g.status === "finalized");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl">Admin panel</h2>
        <form action={triggerIngestionAction}>
          <button
            type="submit"
            className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2 rounded-lg hover:bg-gold-300 transition-colors"
          >
            Pokreni ingestion sada
          </button>
        </form>
      </div>

      <section>
        <h3 className="font-display text-lg mb-2">Kola koja traže pažnju</h3>
        {attentionGws.length === 0 ? (
          <p className="text-gold-300 text-sm bg-gold-400/10 border border-gold-400/30 rounded-lg px-4 py-3">
            Sve je obračunato. Nijedno kolo ne čeka unos statistike ni obračun poena.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {attentionGws.map((gw) => {
              const gwFixtures = (fixtures ?? []).filter((f: any) => f.gameweek_id === gw.id);
              return (
                <div
                  key={gw.id}
                  id={`kolo-${gw.number}`}
                  className="bg-navy-800 rounded-xl ring-1 ring-black/25 p-4 scroll-mt-4"
                >
                  <div className="flex items-baseline gap-3 mb-3">
                    <h4 className="font-display text-lg">Kolo {gw.number}</h4>
                    <span className="text-slate-300 text-sm">{GW_STATUS_LABEL[gw.status] ?? gw.status}</span>
                    {gw.is_current && (
                      <span className="text-gold-300 text-xs bg-gold-400/15 px-2 py-0.5 rounded-full">
                        trenutno
                      </span>
                    )}
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {gwFixtures.map((f: any) => (
                      <li key={f.id}>
                        <Link
                          href={`/admin/mecevi/${f.id}`}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg bg-navy-700/50 hover:bg-navy-700 transition-colors text-sm"
                        >
                          <span className="flex-1 truncate">
                            {f.home?.name} vs {f.away?.name}
                          </span>
                          <span className="text-slate-400 tabular-nums">
                            {f.status === "finished" ? `${f.home_score}:${f.away_score}` : "—"}
                          </span>
                          <span className="text-slate-400 w-20 text-right">
                            {STATUS_LABEL[f.status] ?? f.status}
                          </span>
                          {(() => {
                            const fr = fixtureReview.get(f.id);
                            if (!fr) {
                              return <span className="text-slate-500 text-xs w-24 text-right">bez statistike</span>;
                            }
                            const done = fr.reviewed === fr.total;
                            return (
                              <span
                                className={`text-xs w-24 text-right ${
                                  done ? "text-gold-300" : "text-danger-400"
                                }`}
                              >
                                {done ? "potvrđeno" : `${fr.reviewed}/${fr.total} potvrđeno`}
                              </span>
                            );
                          })()}
                        </Link>
                      </li>
                    ))}
                  </ul>

                  {/* Dugme se nudi za svako nezaključano kolo. Da li je stvarno
                      spremno odlučuje runScoringForGameweek, po stanju mečeva —
                      i to je jedino mesto gde ta odluka sme da živi. */}
                  {gw.status !== "finalized" && (
                    <FinalizeGameweekControl
                      gw={gw}
                      gwFixtures={gwFixtures}
                      reviewCounts={reviewCounts}
                      fixtureReview={fixtureReview}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {finalizedGws.length > 0 && (
        <section>
          <h3 className="font-display text-lg mb-2">Ispravka već obračunatog kola</h3>
          <p className="text-slate-400 text-sm mb-2">
            Ako popraviš statistiku posle finalizacije, ponovi obračun — bezbedno je pokrenuti
            više puta, sve se računa iznova iz trenutnih vrednosti.
          </p>
          <form action={finalizeGameweekAction} className="flex items-center gap-2">
            <select
              name="gameweekId"
              className="bg-navy-900/60 border border-navy-600 rounded-lg px-2.5 py-2 text-chalk-50 text-sm"
            >
              {finalizedGws.map((gw) => (
                <option key={gw.id} value={gw.id}>
                  Kolo {gw.number}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="bg-navy-700 text-chalk-50 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-navy-600 transition-colors"
            >
              Ponovo obračunaj
            </button>
          </form>
        </section>
      )}

      <MaintenancePanel
        actions={{
          backfill: backfillFixtureIdsAction,
          refresh: refreshResultsAction,
          importFixtures: importFixturesAction,
        }}
      />

      <section className="bg-navy-800 border border-navy-600 rounded-lg p-5">
        <h3 className="font-display text-lg mb-2">Prozor za Joker #1 (zimska pauza)</h3>
        <p className="text-slate-400 text-sm mb-3">
          Joker #2 se sam vezuje za prvo kolo plej-ofa (izvedeno iz faze kola). Zimska pauza
          nigde ne postoji kao podatak, pa izaberi kolo u kom se Joker #1 otvara. Dok nije
          izabrano, taj čip se ne nudi nikome.
        </p>
        <form action={setJokerWindowAction} className="flex flex-wrap items-center gap-2">
          <select
            name="gameweekId"
            defaultValue={(gameweeks ?? []).find((g: any) => g.joker_window === "joker_1")?.id ?? ""}
            className="bg-navy-900/60 border border-navy-600 rounded-lg px-2.5 py-2 text-chalk-50 text-sm"
          >
            <option value="">— nije otvoren —</option>
            {(gameweeks ?? []).map((gw) => (
              <option key={gw.id} value={gw.id}>
                Kolo {gw.number}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="bg-navy-700 text-chalk-50 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-navy-600 transition-colors"
          >
            Sačuvaj
          </button>
          <span className="text-xs text-slate-500">
            Joker #2:{" "}
            {(gameweeks ?? []).find((g: any) => g.joker_window === "joker_2")
              ? `kolo ${(gameweeks ?? []).find((g: any) => g.joker_window === "joker_2")!.number}`
              : "nije postavljen"}
          </span>
        </form>
      </section>

      <section>
        <h3 className="font-display text-lg mb-2">Sva kola</h3>
        <div className="flex gap-1.5 flex-wrap">
          {(gameweeks ?? []).map((gw) => {
            // Kola iz gornje liste vode na svoju karticu; ostala nemaju gde.
            const linkable = attentionGws.some((a) => a.id === gw.id);
            const className = `text-xs px-2.5 py-1.5 rounded-lg ${
              gw.is_current
                ? "bg-gold-400 text-navy-950 font-semibold"
                : linkable
                  ? "bg-navy-700 text-chalk-50 hover:bg-navy-600 transition-colors"
                  : "bg-navy-800 text-slate-400"
            }`;
            const title = GW_STATUS_LABEL[gw.status] ?? gw.status;

            return linkable ? (
              <a key={gw.id} href={`#kolo-${gw.number}`} className={className} title={title}>
                {gw.number}
              </a>
            ) : (
              <span key={gw.id} className={className} title={title}>
                {gw.number}
              </span>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="font-display text-lg mb-2">Poslednja pokretanja (ingestion / obračun poena)</h3>
        {(runs ?? []).length === 0 ? (
          <p className="text-slate-400 text-sm">Još nema zapisa.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {runs!.map((r: any) => (
              <li
                key={r.id}
                className="bg-navy-800 rounded-lg px-3 py-2 text-sm flex items-center gap-3"
              >
                <span className="text-slate-400 w-40 shrink-0">
                  {new Date(r.started_at).toLocaleString("sr-RS")}
                </span>
                <span className="w-40 shrink-0">
                  {r.kind === "cron_results"
                    ? "automatski ingestion"
                    : r.kind === "admin_scoring_finalize"
                      ? "obračun poena"
                      : "ručni ingestion"}
                </span>
                <span className="text-slate-300">
                  {r.finished_at
                    ? r.kind === "admin_scoring_finalize"
                      ? `kolo ${r.rounds_checked?.[0] ?? "?"} — ${r.fixtures_touched} red(ova) statistike`
                      : `${r.fixtures_touched} meč(eva) dotaknuto`
                    : "u toku ili prekinuto"}
                </span>
                {Array.isArray(r.errors) && r.errors.length > 0 && (
                  <span className="text-danger-400 text-xs">{r.errors.length} upozorenj(a)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Dugme + hint za Fazu 6. Hint je samo orijentacija (računa se iz podataka
 * koje stranica već ima) — runScoringForGameweek() u lib/scoring.ts radi
 * pravu proveru na serveru i baca jasnu grešku ako se klikne prerano.
 */
function FinalizeGameweekControl({
  gw,
  gwFixtures,
  reviewCounts,
  fixtureReview,
}: {
  gw: { id: string; number: number; status: string };
  gwFixtures: any[];
  reviewCounts: Map<string, { total: number; reviewed: number }>;
  fixtureReview: Map<string, { total: number; reviewed: number }>;
}) {
  const allFixturesDone =
    gwFixtures.length > 0 && gwFixtures.every((f) => f.status === "finished" || f.status === "cancelled");
  const rc = reviewCounts.get(gw.id);
  const allReviewed = !!rc && rc.total > 0 && rc.reviewed === rc.total;
  const ready = allFixturesDone && allReviewed;

  // Odigrani mečevi bez ijednog reda statistike — njih „Pripremi statistiku"
  // rešava jednim klikom, umesto da se URL traži i lepi za svaki posebno.
  const finishedCount = gwFixtures.filter((f) => f.status === "finished").length;
  const missingStats = rc ? (finishedCount > 0 && rc.total === 0 ? finishedCount : 0) : finishedCount;

  const pendingFixtures = gwFixtures.filter((f) => {
    if (f.status !== "finished") return false;
    const fr = fixtureReview.get(f.id);
    return !fr || fr.reviewed < fr.total;
  });

  return (
    <div className="mt-3 pt-3 border-t border-navy-700/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-slate-400 text-xs">
          {!allFixturesDone && "Čeka da svi mečevi budu odigrani ili otkazani."}
          {allFixturesDone && missingStats > 0 && `${missingStats} meč(eva) bez statistike.`}
          {allFixturesDone && missingStats === 0 && !allReviewed && (
            <>
              {pendingFixtures.length} od {gwFixtures.filter((f) => f.status === "finished").length}{" "}
              meč(eva) čeka potvrdu statistike. Otvori ih iz spiska iznad, upiši minute i golove
              onima koji su igrali, pa „Sačuvaj i potvrdi”.
            </>
          )}
          {ready && "Spremno za obračun."}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {/* Kola odigrana pre nego što je iko imao sastav — zatvaraju se bez
              obračuna. Nudi se samo dok poeni nisu obračunati. */}
          <form action={skipGameweekAction}>
            <input type="hidden" name="gameweekId" value={gw.id} />
            <button
              type="submit"
              className="text-slate-400 text-xs font-semibold px-3 py-2 rounded-lg border border-navy-600 hover:text-chalk-50 hover:border-slate-500 transition-colors whitespace-nowrap"
            >
              Ne obračunavaj ovo kolo
            </button>
          </form>

          <form action={finalizeGameweekAction}>
            <input type="hidden" name="gameweekId" value={gw.id} />
            <button
              type="submit"
              disabled={!ready}
              // Onemogućeno dok kolo stvarno nije spremno. Ranije je dugme
              // uvek bilo aktivno, pa je jedini način da se sazna šta fali bio
              // da se klikne i pročita greška.
              title={ready ? undefined : "Kolo još nije spremno — vidi poruku levo."}
              className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2 rounded-lg hover:bg-gold-300 transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gold-400"
            >
              Obračunaj poene
            </button>
          </form>
        </div>
      </div>

      {allFixturesDone && missingStats > 0 && (
        <PrepareStatsButton gameweekId={gw.id} missingCount={missingStats} />
      )}
    </div>
  );
}
