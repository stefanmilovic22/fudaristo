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
} from "./actions";
import { MaintenancePanel } from "./maintenance-panel";

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

  const reviewCounts = new Map<string, { total: number; reviewed: number }>(
    (statFlags ?? []).map((s: any) => [s.gameweek_id, { total: s.total, reviewed: s.reviewed }])
  );

  // Fokus panela: kola koja nisu ni upcoming ni finalized — tu treba pažnja.
  const attentionGws = (gameweeks ?? []).filter(
    (g) => g.status === "in_progress" || g.status === "data_pulled" || g.status === "admin_reviewed"
  );
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
          <p className="text-slate-400 text-sm">
            Nijedno kolo trenutno nije u toku, ne čeka pregled, niti čeka obračun.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {attentionGws.map((gw) => {
              const gwFixtures = (fixtures ?? []).filter((f: any) => f.gameweek_id === gw.id);
              return (
                <div key={gw.id} className="bg-navy-800 rounded-xl ring-1 ring-black/25 p-4">
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
                          {!f.worldfootball_url && (
                            <span className="text-danger-400 text-xs">bez URL-a</span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>

                  {(gw.status === "data_pulled" || gw.status === "admin_reviewed") && (
                    <FinalizeGameweekControl gw={gw} gwFixtures={gwFixtures} reviewCounts={reviewCounts} />
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
          {(gameweeks ?? []).map((gw) => (
            <span
              key={gw.id}
              className={`text-xs px-2.5 py-1.5 rounded-lg ${
                gw.is_current ? "bg-gold-400 text-navy-950 font-semibold" : "bg-navy-800 text-slate-300"
              }`}
              title={GW_STATUS_LABEL[gw.status] ?? gw.status}
            >
              {gw.number}
            </span>
          ))}
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
}: {
  gw: { id: string; number: number; status: string };
  gwFixtures: any[];
  reviewCounts: Map<string, { total: number; reviewed: number }>;
}) {
  const allFixturesDone =
    gwFixtures.length > 0 && gwFixtures.every((f) => f.status === "finished" || f.status === "cancelled");
  const rc = reviewCounts.get(gw.id);
  const allReviewed = !!rc && rc.total > 0 && rc.reviewed === rc.total;
  const ready = allFixturesDone && allReviewed;

  return (
    <div className="mt-3 pt-3 border-t border-navy-700/60 flex items-center justify-between gap-3">
      <p className="text-slate-400 text-xs">
        {!allFixturesDone && "Čeka da svi mečevi budu odigrani ili otkazani."}
        {allFixturesDone && !allReviewed && rc && `${rc.reviewed}/${rc.total} redova statistike potvrđeno.`}
        {ready && "Spremno za obračun."}
      </p>
      <form action={finalizeGameweekAction}>
        <input type="hidden" name="gameweekId" value={gw.id} />
        <button
          type="submit"
          className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2 rounded-lg hover:bg-gold-300 transition-colors whitespace-nowrap"
        >
          Obračunaj poene
        </button>
      </form>
    </div>
  );
}
