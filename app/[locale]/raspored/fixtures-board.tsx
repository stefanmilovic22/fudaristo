"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";

export type Match = {
  id: string;
  kickoffAt: string;
  status: "scheduled" | "live" | "finished" | "postponed" | "cancelled";
  homeScore: number | null;
  awayScore: number | null;
  home: { name: string; short: string; color: string };
  away: { name: string; short: string; color: string };
};

export type GameweekFixtures = {
  id: string;
  number: number;
  status: string;
  deadlineAt: string;
  matches: Match[];
};

/** Ključevi u fixtures.status* — prazan string za "scheduled" ostaje prazan. */
const STATUS_KEY: Record<Match["status"], string | null> = {
  scheduled: null,
  live: "statusLive",
  finished: "statusFinished",
  postponed: "statusPostponed",
  cancelled: "statusCancelled",
};

export function FixturesBoard({ gameweeks }: { gameweeks: GameweekFixtures[] }) {
  const t = useTranslations("fixtures");
  const tCommon = useTranslations("common");

  // Podrazumevano otvori kolo koje je na redu — prvo čiji rok još nije prošao,
  // a ako je sezona gotova, poslednje odigrano.
  const defaultNumber = useMemo(() => {
    const now = Date.now();
    const next = gameweeks.find((g) => new Date(g.deadlineAt).getTime() > now);
    return (next ?? gameweeks[gameweeks.length - 1])?.number ?? 1;
  }, [gameweeks]);

  const [activeNumber, setActiveNumber] = useState(defaultNumber);
  const [showAll, setShowAll] = useState(false);

  const shown = showAll ? gameweeks : gameweeks.filter((g) => g.number === activeNumber);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 overflow-x-auto py-1 -my-1">
          {gameweeks.map((gw) => {
            const played = gw.matches.some((m) => m.status === "finished");
            return (
              <button
                key={gw.id}
                type="button"
                onClick={() => {
                  setActiveNumber(gw.number);
                  setShowAll(false);
                }}
                className={`shrink-0 w-10 h-10 rounded-lg text-sm font-semibold transition-colors ${
                  !showAll && gw.number === activeNumber
                    ? "bg-gold-400 text-navy-950"
                    : played
                      ? "bg-navy-700 text-slate-300 hover:text-chalk-50"
                      : "bg-navy-800 text-slate-400 hover:text-chalk-50"
                }`}
                title={`Kolo ${gw.number}`}
              >
                {gw.number}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className={`shrink-0 text-sm font-semibold px-3 py-2 rounded-lg border transition-colors ${
            showAll
              ? "bg-gold-400 text-navy-950 border-gold-400"
              : "border-navy-600 text-slate-300 hover:text-chalk-50"
          }`}
        >
          {showAll ? "Jedno kolo" : "Cela sezona"}
        </button>
      </div>

      <div className="flex flex-col gap-6">
        {shown.map((gw) => (
          <section key={gw.id}>
            <div className="flex items-baseline gap-3 mb-2">
              <h3 className="font-display text-lg">{tCommon("gameweekN", { number: gw.number })}</h3>
              <span className="text-slate-400 text-xs">
                rok {new Date(gw.deadlineAt).toLocaleString("sr-RS", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            {gw.matches.length === 0 ? (
              <p className="text-slate-400 text-sm bg-navy-800 rounded-xl px-4 py-3">
                {t("noFixturesInGameweek")}
              </p>
            ) : (
              <ul className="flex flex-col gap-px bg-navy-700 rounded-xl overflow-hidden ring-1 ring-black/20">
                {gw.matches.map((m) => (
                  <MatchRow key={m.id} match={m} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function MatchRow({ match: m }: { match: Match }) {
  const t = useTranslations("fixtures");
  // Datum i vreme prate izabrani jezik, ne fiksno "sr-RS".
  const locale = useLocale();
  const played = m.status === "finished" && m.homeScore !== null && m.awayScore !== null;
  const kickoff = new Date(m.kickoffAt);

  return (
    <li className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 bg-navy-800 px-3 py-2.5 sm:px-4">
      <span className="flex items-center justify-end gap-2 min-w-0">
        <span className={`truncate text-sm ${played && (m.homeScore ?? 0) > (m.awayScore ?? 0) ? "font-semibold" : ""}`}>
          {m.home.name}
        </span>
        <span
          className="w-1.5 h-6 rounded-full shrink-0"
          style={{ backgroundColor: m.home.color }}
          aria-hidden
        />
      </span>

      <span className="text-center min-w-[76px]">
        {played ? (
          <span className="font-display text-lg tabular-nums bg-navy-950 rounded px-2.5 py-0.5">
            {m.homeScore}<span className="text-slate-500 mx-0.5">:</span>{m.awayScore}
          </span>
        ) : m.status === "postponed" || m.status === "cancelled" ? (
          <span className="text-danger-400 text-xs">{t(STATUS_KEY[m.status] as never)}</span>
        ) : (
          <span className="text-slate-300 text-sm tabular-nums">
            {kickoff.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <span className="block text-[10px] text-slate-500 mt-0.5">
          {m.status === "live"
            ? t("statusLive")
            : kickoff.toLocaleDateString(locale, { day: "numeric", month: "short" })}
        </span>
      </span>

      <span className="flex items-center gap-2 min-w-0">
        <span
          className="w-1.5 h-6 rounded-full shrink-0"
          style={{ backgroundColor: m.away.color }}
          aria-hidden
        />
        <span className={`truncate text-sm ${played && (m.awayScore ?? 0) > (m.homeScore ?? 0) ? "font-semibold" : ""}`}>
          {m.away.name}
        </span>
      </span>
    </li>
  );
}
