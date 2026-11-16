"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export type PerformancePoint = {
  gameweek: number;
  points: number;
  /** Prosek poena svih koji su igrali to kolo. */
  average: number;
  /** Plasman posle tog kola među svim korisnicima. */
  rank: number;
  managers: number;
};

const W = 360;
const H = 190;
const PAD = { top: 16, right: 14, bottom: 26, left: 34 };

/**
 * Grafik „Poeni i plasman“ na stranici tima. Dva prikaza istog podatka:
 *  - Poeni: stubić po kolu + isprekidana linija proseka svih igrača;
 *  - Plasman: linija mesta posle svakog kola (prvo mesto je GORE).
 *
 * Čist SVG bez biblioteke: širina je 100% roditelja, tekst i linije se skaliraju
 * zajedno sa crtežom, pa staje i na ekran od 320 px. Ispod grafika je tabela za
 * čitače ekrana — grafik sam nosi samo kratak opis.
 */
export function PerformanceChart({ data, currentGameweek }: { data: PerformancePoint[]; currentGameweek?: number }) {
  const t = useTranslations("publicTeam");
  const [view, setView] = useState<"points" | "rank">("points");
  if (data.length === 0) return null;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const n = data.length;
  const x = (i: number) => PAD.left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const slot = plotW / n;
  const labelEvery = n > 24 ? 5 : n > 12 ? 2 : 1;

  const last = data[n - 1];
  const best = data.reduce((b, d) => (d.points > b.points ? d : b), data[0]);

  let body: React.ReactNode;
  if (view === "points") {
    const max = Math.max(10, ...data.map((d) => d.points), ...data.map((d) => d.average));
    const top = Math.ceil(max / 10) * 10;
    const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
    const barW = Math.min(22, slot * 0.62);
    const bx = (i: number) => PAD.left + slot * i + slot / 2;
    const avgPath = data.map((d, i) => `${i === 0 ? "M" : "L"}${bx(i).toFixed(1)} ${y(d.average).toFixed(1)}`).join(" ");
    body = (
      <>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(top * f)} y2={y(top * f)} className="stroke-navy-600" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(top * f) + 3} textAnchor="end" className="fill-slate-500" fontSize="9">
              {Math.round(top * f)}
            </text>
          </g>
        ))}
        {data.map((d, i) => (
          <rect
            key={d.gameweek}
            x={bx(i) - barW / 2}
            y={y(d.points)}
            width={barW}
            height={Math.max(1.5, PAD.top + plotH - y(d.points))}
            rx="2"
            className={d.gameweek === currentGameweek ? "fill-gold-400" : "fill-gold-400/55"}
          />
        ))}
        {data.length > 1 && (
          <path d={avgPath} fill="none" className="stroke-slate-300" strokeWidth="1.5" strokeDasharray="4 3" />
        )}
        {data.length === 1 && (
          <line x1={PAD.left} x2={W - PAD.right} y1={y(data[0].average)} y2={y(data[0].average)} className="stroke-slate-300" strokeWidth="1.5" strokeDasharray="4 3" />
        )}
        {data.map((d, i) =>
          n <= 12 ? (
            <text key={d.gameweek} x={bx(i)} y={y(d.points) - 4} textAnchor="middle" className="fill-chalk-50" fontSize="9" fontWeight="600">
              {d.points}
            </text>
          ) : null
        )}
        {data.map((d, i) =>
          d.gameweek % labelEvery === 0 || d.gameweek === currentGameweek ? (
            <text key={d.gameweek} x={bx(i)} y={H - 8} textAnchor="middle" className={d.gameweek === currentGameweek ? "fill-gold-300" : "fill-slate-500"} fontSize="9">
              {d.gameweek}
            </text>
          ) : null
        )}
      </>
    );
  } else {
    const worst = Math.max(...data.map((d) => d.rank));
    const bestRank = Math.min(...data.map((d) => d.rank));
    const lo = bestRank === worst ? Math.max(1, bestRank - 1) : bestRank;
    const hi = bestRank === worst ? bestRank + 1 : worst;
    const y = (r: number) => PAD.top + ((r - lo) / (hi - lo)) * plotH;
    const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(d.rank).toFixed(1)}`).join(" ");
    const ticks = Array.from(new Set([lo, Math.round((lo + hi) / 2), hi]));
    body = (
      <>
        {ticks.map((r) => (
          <g key={r}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(r)} y2={y(r)} className="stroke-navy-600" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(r) + 3} textAnchor="end" className="fill-slate-500" fontSize="9">
              {r}
            </text>
          </g>
        ))}
        {data.length > 1 && <path d={path} fill="none" className="stroke-gold-400" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {data.map((d, i) => (
          <circle key={d.gameweek} cx={x(i)} cy={y(d.rank)} r={d.gameweek === currentGameweek || i === n - 1 ? 4 : 2.6} className={d.gameweek === currentGameweek ? "fill-gold-300" : "fill-gold-400"} />
        ))}
        <text x={Math.min(x(n - 1), W - PAD.right - 2)} y={Math.max(PAD.top - 4, y(last.rank) - 8)} textAnchor="end" className="fill-chalk-50" fontSize="10" fontWeight="700">
          #{last.rank}
        </text>
        {data.map((d, i) =>
          d.gameweek % labelEvery === 0 || d.gameweek === currentGameweek ? (
            <text key={d.gameweek} x={x(i)} y={H - 8} textAnchor="middle" className={d.gameweek === currentGameweek ? "fill-gold-300" : "fill-slate-500"} fontSize="9">
              {d.gameweek}
            </text>
          ) : null
        )}
      </>
    );
  }

  const summary =
    view === "points"
      ? t("chartSummaryPoints", { best: best.points, gameweek: best.gameweek })
      : t("chartSummaryRank", { rank: last.rank, managers: last.managers });

  return (
    <section className="bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden">
      <div className="bg-navy-700 border-b border-gold-400/30 px-4 py-2 flex items-center justify-between gap-3">
        <h3 className="font-display text-sm uppercase tracking-wider text-gold-300 min-w-0 truncate">{t("chartTitle")}</h3>
        <div className="flex gap-1 shrink-0" role="tablist" aria-label={t("chartTitle")}>
          {(["points", "rank"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold ${
                view === v ? "bg-gold-400 text-navy-950" : "text-slate-300 hover:text-chalk-50"
              }`}
            >
              {v === "points" ? t("chartPoints") : t("chartRank")}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 pt-3 pb-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={`${t("chartTitle")}: ${summary}`}>
          {body}
        </svg>
        <p className="mt-1 text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{summary}</span>
          {view === "points" && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="18" height="6" aria-hidden>
                <line x1="0" x2="18" y1="3" y2="3" className="stroke-slate-300" strokeWidth="1.5" strokeDasharray="4 3" />
              </svg>
              {t("chartAverage")}
            </span>
          )}
          {view === "rank" && <span>{t("chartRankHint")}</span>}
        </p>
      </div>

      <table className="sr-only">
        <caption>{t("chartTitle")}</caption>
        <thead>
          <tr>
            <th>{t("chartGameweek")}</th>
            <th>{t("chartPoints")}</th>
            <th>{t("chartAverage")}</th>
            <th>{t("chartRank")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.gameweek}>
              <td>{d.gameweek}</td>
              <td>{d.points}</td>
              <td>{d.average}</td>
              <td>{d.rank}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
