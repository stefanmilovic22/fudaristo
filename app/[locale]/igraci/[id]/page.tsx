import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createPublicClient } from "@/lib/supabase/public";
import { getTableDataCached, getUpcomingFixturesCached } from "@/lib/cached-data";
import { computeDifficulty } from "@/lib/fdr";
import { reasonKey, humanizeReason } from "@/lib/injury-reasons";
import { playerFullName } from "@/lib/fantasy-rules";
import { ClubBadge } from "@/components/ClubBadge";
import { FdrChip } from "@/components/FdrChip";
import { LocalTime } from "@/components/LocalTime";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEXT_MATCHES = 5;

type PlayerPageData = {
  player: any;
  ownership: { pct: number; gameweek: number } | null;
  avgRating: number | null;
  stats: any[];
  prices: { oldPrice: number; newPrice: number; gameweek: number | null; changedAt: string }[];
};

/** Svi podaci o igraču — javni, keš 60s (tag public-data, kao ostatak javnih podataka). */
const loadPlayer = unstable_cache(
  async (id: string): Promise<PlayerPageData | null> => {
    const supabase = createPublicClient();
    const { data: player } = await supabase
      .from("players")
      .select(
        "id, first_name, last_name, position, price, status, status_note, status_until, total_points, club_id, " +
          "clubs(name, short_name, primary_color)"
      )
      .eq("id", id)
      .maybeSingle();
    if (!player) return null;

    const [own, avg, stats, prices] = await Promise.all([
      supabase
        .from("v_player_ownership")
        .select("pct, gameweek_number")
        .eq("player_id", id)
        .order("gameweek_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("v_player_avg_rating").select("avg_rating").eq("player_id", id).maybeSingle(),
      supabase
        .from("player_gameweek_stats")
        .select(
          "club_id, minutes_played, goals, assists, yellow_cards, red_cards, fantasy_points, sofascore_rating, " +
            "gameweeks(number), fixtures(home_club_id, away_club_id, home:home_club_id(short_name), away:away_club_id(short_name))"
        )
        .eq("player_id", id),
      supabase
        .from("player_price_history")
        .select("old_price, new_price, changed_at, gameweeks(number)")
        .eq("player_id", id)
        .order("changed_at", { ascending: false })
        .limit(10),
    ]);

    return {
      player,
      ownership: own.data ? { pct: Number((own.data as any).pct), gameweek: Number((own.data as any).gameweek_number) } : null,
      avgRating: avg.data ? Number((avg.data as any).avg_rating) : null,
      stats: (stats.data ?? []) as any[],
      prices: ((prices.data ?? []) as any[]).map((r) => ({
        oldPrice: Number(r.old_price),
        newPrice: Number(r.new_price),
        gameweek: r.gameweeks?.number ?? null,
        changedAt: r.changed_at as string,
      })),
    };
  },
  ["player-page-v1"],
  { revalidate: 60, tags: ["public-data"] }
);

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return {};
  const data = await loadPlayer(id).catch(() => null);
  return data ? { title: `${playerFullName(data.player)} — Fudaristo` } : {};
}

/** Stranica igrača: stanje, naredni mečevi sa težinom (FDR), poeni po kolima, cena, utakmice. */
export default async function IgracPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!UUID.test(id)) notFound();

  const [t, tPos, tReason] = await Promise.all([
    getTranslations("playerPage"),
    getTranslations("positions"),
    getTranslations("injuryReasons"),
  ]);
  const [data, tableData, upcoming] = await Promise.all([
    loadPlayer(id),
    getTableDataCached().catch(() => ({ clubs: [] as any[], fixtures: [] as any[] })),
    getUpcomingFixturesCached().catch(() => [] as any[]),
  ]);
  if (!data) notFound();

  const { player, ownership, avgRating, stats, prices } = data;
  const club = player.clubs ?? { name: "?", short_name: "?", primary_color: "#93ADCC" };
  const difficulty = computeDifficulty(tableData.clubs, tableData.fixtures);

  // Naredni mečevi kluba (do 5) sa težinom po protivniku.
  const next: { label: string; kickoffAt: string; difficulty?: number }[] = [];
  for (const f of upcoming) {
    if (next.length >= NEXT_MATCHES) break;
    if (f.home_club_id === player.club_id) {
      next.push({ label: `${f.away?.short_name ?? "?"} (H)`, kickoffAt: f.kickoff_at, difficulty: difficulty.get(f.away_club_id) });
    } else if (f.away_club_id === player.club_id) {
      next.push({ label: `${f.home?.short_name ?? "?"} (A)`, kickoffAt: f.kickoff_at, difficulty: difficulty.get(f.home_club_id) });
    }
  }

  // Utakmice, najnovije prvo; kolo sa dva meča daje dva reda (isto kolo, različit protivnik).
  const matches = stats
    .map((s) => {
      const home = s.fixtures?.home_club_id === s.club_id;
      const opp = home ? s.fixtures?.away?.short_name : s.fixtures?.home?.short_name;
      return {
        gw: s.gameweeks?.number ?? 0,
        opp: `${opp ?? "?"} (${home ? "H" : "A"})`,
        minutes: s.minutes_played ?? 0,
        goals: s.goals ?? 0,
        assists: s.assists ?? 0,
        cards: (s.yellow_cards ?? 0) + (s.red_cards ?? 0) * 1,
        red: (s.red_cards ?? 0) > 0,
        rating: s.sofascore_rating != null ? Number(s.sofascore_rating) : null,
        points: s.fantasy_points ?? 0,
      };
    })
    .sort((a, b) => b.gw - a.gw);

  // Poeni po kolima (sabira duplo kolo) za stubiće, od najstarijeg.
  const byGw = new Map<number, number>();
  for (const m of matches) byGw.set(m.gw, (byGw.get(m.gw) ?? 0) + m.points);
  const bars = [...byGw.entries()].sort((a, b) => a[0] - b[0]).slice(-20);
  const maxPts = Math.max(1, ...bars.map(([, p]) => p));

  const reasonText = (() => {
    if (!player.status_note) return null;
    const key = reasonKey(player.status_note);
    return key && tReason.has(key as never) ? tReason(key as never) : humanizeReason(player.status_note);
  })();
  const unavailable = player.status !== "available";
  const lastPrice = prices[0];
  const delta = lastPrice ? Math.round((lastPrice.newPrice - lastPrice.oldPrice) * 10) / 10 : 0;

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/igraci" className="text-slate-400 text-sm hover:text-chalk-50">
        ← {t("back")}
      </Link>

      <section className="mt-2 mb-4 bg-navy-800 border border-gold-400/50 rounded-xl p-4 sm:p-5 flex flex-wrap items-center gap-4 sm:gap-6">
        <ClubBadge short={club.short_name} color={club.primary_color} size={64} />
        <div className="min-w-[200px] flex-1">
          <h2 className="font-display text-2xl sm:text-3xl leading-tight">{playerFullName(player)}</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            {club.name} · {tPos(`label${player.position}` as never)} · {Number(player.price).toFixed(1)}M
            {delta !== 0 && (
              <span className={`ml-1.5 font-bold ${delta > 0 ? "text-pitch-400" : "text-danger-400"}`}>
                {delta > 0 ? "▲ +" : "▼ "}
                {delta.toFixed(1)}
              </span>
            )}
          </p>
          {unavailable && (
            <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-bold rounded-full px-2 py-0.5 bg-danger-400/15 text-danger-400">
                {t(`status_${player.status}` as never)}
              </span>
              {reasonText && <span className="text-slate-300">{reasonText}</span>}
              {player.status_until && (
                <span className="text-slate-400">
                  · {t("until")}{" "}
                  <LocalTime iso={player.status_until} options={{ day: "numeric", month: "numeric" }} />
                </span>
              )}
            </p>
          )}
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full sm:w-auto sm:flex-1 sm:min-w-[300px]">
          <Stat label={t("points")} value={String(player.total_points ?? 0)} />
          <Stat label={t("avgRating")} value={avgRating !== null ? avgRating.toFixed(1) : "–"} />
          <Stat label={t("ownership")} value={ownership ? `${ownership.pct.toFixed(0)}%` : "–"} />
          <Stat label={t("price")} value={Number(player.price).toFixed(1)} />
        </dl>
      </section>

      <Card title={t("nextMatches")}>
        {next.length === 0 ? (
          <p className="text-slate-400 text-sm">{t("noFixtures")}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {next.map((f, i) => (
                <FdrChip
                  key={i}
                  label={f.label}
                  difficulty={f.difficulty}
                  title={f.difficulty ? t(`fdr${f.difficulty}` as never) : undefined}
                  className="flex-col gap-1 px-3 py-2 min-w-[88px] text-[15px]"
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {next.map((f, i) => (
                <span key={i} className="min-w-[88px] text-center text-[11px] text-slate-400">
                  <LocalTime iso={f.kickoffAt} options={{ day: "numeric", month: "numeric" }} />
                </span>
              ))}
            </div>
            <p className="text-slate-500 text-xs mt-3">{t("fdrNote")}</p>
          </>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-[1fr_260px] mt-4">
        <Card title={t("pointsByGameweek")}>
          {bars.length === 0 ? (
            <p className="text-slate-400 text-sm">{t("noStats")}</p>
          ) : (
            <>
              <div className="flex items-end gap-1.5 h-28">
                {bars.map(([gw, pts]) => (
                  <div key={gw} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1" title={`${t("gameweekShort", { number: gw })}: ${pts}`}>
                    <span className="text-[10px] text-slate-300 font-bold tabular-nums">{pts}</span>
                    <span
                      className="block w-full rounded-t bg-gold-400/80"
                      style={{ height: `${Math.max(4, Math.round((Math.max(0, pts) / maxPts) * 78))}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 mt-1">
                {bars.map(([gw]) => (
                  <span key={gw} className="flex-1 min-w-0 text-center text-[10px] text-slate-500">
                    {gw}
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card title={t("priceHistory")}>
          {prices.length === 0 ? (
            <p className="text-slate-400 text-sm">{t("noPriceChanges")}</p>
          ) : (
            <ul className="text-sm">
              {prices.map((p, i) => (
                <li key={i} className="flex items-center justify-between py-1.5 border-t border-navy-700 first:border-t-0">
                  <span className="text-slate-400">
                    {p.gameweek !== null ? t("gameweekShort", { number: p.gameweek }) : "—"}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {p.oldPrice.toFixed(1)} →{" "}
                    <span className={p.newPrice > p.oldPrice ? "text-pitch-400" : "text-danger-400"}>{p.newPrice.toFixed(1)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={t("matches")} className="mt-4">
        {matches.length === 0 ? (
          <p className="text-slate-400 text-sm">{t("noStats")}</p>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
            <table className="w-full text-sm border-collapse min-w-[460px]">
              <thead>
                <tr className="text-slate-400 text-[11px] uppercase tracking-wide">
                  <th className="text-left font-semibold py-2 pr-2">{t("colGw")}</th>
                  <th className="text-left font-semibold py-2 px-2">{t("colOpponent")}</th>
                  <th className="text-right font-semibold py-2 px-2">{t("colMin")}</th>
                  <th className="text-right font-semibold py-2 px-2">{t("colGoals")}</th>
                  <th className="text-right font-semibold py-2 px-2">{t("colAssists")}</th>
                  <th className="text-right font-semibold py-2 px-2">{t("colCards")}</th>
                  <th className="text-right font-semibold py-2 px-2">{t("colRating")}</th>
                  <th className="text-right font-semibold py-2 pl-2">{t("colPoints")}</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => (
                  <tr key={i} className="border-t border-navy-700">
                    <td className="py-2 pr-2 text-slate-400 tabular-nums">{m.gw}</td>
                    <td className="py-2 px-2">{m.opp}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{m.minutes}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{m.goals || "·"}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{m.assists || "·"}</td>
                    <td className={`py-2 px-2 text-right tabular-nums ${m.red ? "text-danger-400 font-bold" : ""}`}>{m.cards || "·"}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-slate-300">{m.rating !== null ? m.rating.toFixed(1) : "–"}</td>
                    <td className="py-2 pl-2 text-right tabular-nums font-bold text-gold-300">{m.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden ${className}`}>
      <div className="bg-navy-700 border-b border-gold-400/30 px-4 py-2.5">
        <h3 className="font-display text-sm uppercase tracking-wider text-gold-300">{title}</h3>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-navy-900 rounded-lg px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="font-display text-2xl font-bold text-gold-300 tabular-nums leading-tight">{value}</dd>
    </div>
  );
}
