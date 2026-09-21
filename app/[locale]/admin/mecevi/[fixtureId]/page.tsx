import { getAdminAccess } from "@/lib/admin-guard";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { updateFixtureScoreAction, saveWorldfootballStatsAction } from "../../actions";
import { WorldfootballPuller } from "./worldfootball-puller";

export const metadata = { title: "Meč — Admin — Fudaristo" };

const STATUS_OPTIONS = ["scheduled", "live", "finished", "postponed", "cancelled"];

export default async function AdminFixturePage({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  const access = await getAdminAccess();
  if (!access.ok) return <AdminAccessDenied access={access} />;
  const { supabase } = access;

  const { data: fixture } = (await supabase
    .from("fixtures")
    .select(
      "id, gameweek_id, kickoff_at, status, home_score, away_score, worldfootball_url, home_club_id, away_club_id, " +
        // fixtures ima DVA FK-a ka gameweeks (gameweek_id i original_gameweek_id) —
        // "gameweeks!gameweek_id" pinuje embed na pravu kolonu, inače PostgREST
        // baca "more than one relationship was found".
        "home:home_club_id(name), away:away_club_id(name), gameweeks!gameweek_id(number)"
    )
    .eq("id", fixtureId)
    .single()) as any;

  if (!fixture) {
    return <p className="text-danger-400">Meč nije nađen.</p>;
  }

  const { data: statRows } = await supabase
    .from("player_gameweek_stats")
    .select(
      "id, player_id, minutes_played, goals, assists, clean_sheet, goals_conceded, saves, " +
        "penalties_saved, penalties_missed, yellow_cards, red_cards, own_goals, bonus_points, " +
        "is_admin_reviewed, raw_api_data, players(first_name, last_name, position, club_id)"
    )
    .eq("fixture_id", fixtureId)
    .order("player_id");

  const rows = (statRows ?? []).sort((a: any, b: any) => {
    const clubOrder = (r: any) => (r.players.club_id === fixture.home_club_id ? 0 : 1);
    return clubOrder(a) - clubOrder(b) || a.players.last_name.localeCompare(b.players.last_name, "sr");
  });

  const allReviewed = rows.length > 0 && rows.every((r: any) => r.is_admin_reviewed);
  const gwNumber = (fixture.gameweeks as unknown as { number: number } | null)?.number;

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <h2 className="font-display text-2xl">
          {(fixture.home as any)?.name} vs {(fixture.away as any)?.name}
        </h2>
        <p className="text-slate-400 text-sm">
          Kolo {gwNumber} · {new Date(fixture.kickoff_at).toLocaleString("sr-RS")}
        </p>
      </div>

      <section className="bg-navy-800 rounded-xl ring-1 ring-black/25 p-4">
        <h3 className="font-display text-lg mb-3">Rezultat i status</h3>
        <form action={updateFixtureScoreAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="fixtureId" value={fixture.id} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">Domaći</span>
            <input
              type="number"
              name="home_score"
              defaultValue={fixture.home_score ?? ""}
              className="bg-navy-900/60 border border-navy-600 rounded-lg px-2.5 py-2 w-20 text-chalk-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">Gosti</span>
            <input
              type="number"
              name="away_score"
              defaultValue={fixture.away_score ?? ""}
              className="bg-navy-900/60 border border-navy-600 rounded-lg px-2.5 py-2 w-20 text-chalk-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">Status</span>
            <select
              name="status"
              defaultValue={fixture.status}
              className="bg-navy-900/60 border border-navy-600 rounded-lg px-2.5 py-2 text-chalk-50"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-gold-300 transition-colors"
          >
            Sačuvaj
          </button>
        </form>
        <p className="text-slate-400 text-xs mt-2">
          Ovo prepisuje ono što je automatika upisala — koristi kad TheSportsDB kasni, greši, ili kad
          ručno ispravljaš nešto pre finalizacije kola.
        </p>
      </section>

      <WorldfootballPuller
        fixtureId={fixture.id}
        initialUrl={fixture.worldfootball_url ?? ""}
        hasStats={rows.length > 0}
      />

      {rows.length > 0 && (
        <section className="bg-navy-800 rounded-xl ring-1 ring-black/25 p-4">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-display text-lg">Statistika igrača</h3>
            <span className={`text-xs ${allReviewed ? "text-gold-300" : "text-slate-400"}`}>
              {allReviewed ? "potvrđeno" : "čeka potvrdu"}
            </span>
          </div>
          <form action={saveWorldfootballStatsAction}>
            <input type="hidden" name="fixtureId" value={fixture.id} />
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="text-left text-slate-400 text-xs">
                    <th className="pb-2 pr-2">Igrač</th>
                    <th className="pb-2 px-1">Min</th>
                    <th className="pb-2 px-1">Gol</th>
                    <th className="pb-2 px-1">Asist</th>
                    <th className="pb-2 px-1">Prim. gol</th>
                    <th className="pb-2 px-1">Odbrane</th>
                    <th className="pb-2 px-1">Pen. odbr.</th>
                    <th className="pb-2 px-1">Pen. prom.</th>
                    <th className="pb-2 px-1">Žuti</th>
                    <th className="pb-2 px-1">Crveni</th>
                    <th className="pb-2 px-1">Autogol</th>
                    <th className="pb-2 px-1">Bonus</th>
                    <th className="pb-2 pl-1">Na strani?</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <StatRow key={r.player_id} row={r} />
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="submit"
              className="mt-4 bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-gold-300 transition-colors"
            >
              Sačuvaj i potvrdi
            </button>
            <p className="text-slate-400 text-xs mt-2">
              Čisti mrežnjak (clean_sheet) se računa sam: 0 primljenih golova i 60+ minuta. Bonus
              (1-3) dodeli ručno najboljima u meču po sopstvenoj proceni (npr. whoscored.com) —
              ostalo je 0.
            </p>
          </form>
        </section>
      )}
    </div>
  );
}

function StatRow({ row }: { row: any }) {
  const appearsOnPage = row.raw_api_data?.appears_on_page;
  const numberInput = (field: string, defaultValue: number) => (
    <input
      type="number"
      min={0}
      name={`stats[${row.player_id}][${field}]`}
      defaultValue={defaultValue}
      className="w-14 bg-navy-900/60 border border-navy-600 rounded px-1.5 py-1 text-chalk-50 text-center"
    />
  );

  return (
    <tr className="border-t border-navy-700/60">
      <td className="py-1.5 pr-2 whitespace-nowrap">
        {row.players.first_name} {row.players.last_name}
        <span className="text-slate-500 text-xs ml-1">({row.players.position})</span>
      </td>
      <td className="py-1.5 px-1">{numberInput("minutes_played", row.minutes_played)}</td>
      <td className="py-1.5 px-1">{numberInput("goals", row.goals)}</td>
      <td className="py-1.5 px-1">{numberInput("assists", row.assists)}</td>
      <td className="py-1.5 px-1">{numberInput("goals_conceded", row.goals_conceded)}</td>
      <td className="py-1.5 px-1">{numberInput("saves", row.saves)}</td>
      <td className="py-1.5 px-1">{numberInput("penalties_saved", row.penalties_saved)}</td>
      <td className="py-1.5 px-1">{numberInput("penalties_missed", row.penalties_missed)}</td>
      <td className="py-1.5 px-1">{numberInput("yellow_cards", row.yellow_cards)}</td>
      <td className="py-1.5 px-1">{numberInput("red_cards", row.red_cards)}</td>
      <td className="py-1.5 px-1">{numberInput("own_goals", row.own_goals)}</td>
      <td className="py-1.5 px-1">{numberInput("bonus_points", row.bonus_points ?? 0)}</td>
      <td className="py-1.5 pl-1 text-center">
        {appearsOnPage === true ? (
          <span className="text-gold-300" title="Ime se pominje na worldfootball strani">
            ✓
          </span>
        ) : appearsOnPage === false ? (
          <span className="text-slate-500" title="Nije nađen na strani">
            –
          </span>
        ) : (
          <span className="text-slate-600">?</span>
        )}
      </td>
    </tr>
  );
}
