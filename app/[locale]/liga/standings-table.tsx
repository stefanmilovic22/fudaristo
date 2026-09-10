"use client";

import { Link } from "@/i18n/navigation";
import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export type StandingsRow = {
  userId: string;
  teamName: string;
  teamColor: string;
  totalPoints: number;
  gameweekPoints: number | null;
  rank: number;
};

/**
 * Rang lista je klijentska komponenta samo zbog pretrage i „skoči na mene” —
 * podaci dolaze već poređani sa servera i ne menjaju se ovde. Pretraga
 * NE menja rangove: filtriranje pokazuje manje redova, ali svaki red i dalje
 * nosi svoj pravi rang iz cele lige.
 */
export function StandingsTable({
  rows,
  currentUserId,
  gameweekNumber,
}: {
  rows: StandingsRow[];
  currentUserId: string | null;
  gameweekNumber: number | null;
}) {
  const t = useTranslations("league");
  const [query, setQuery] = useState("");
  const myRowRef = useRef<HTMLTableRowElement | null>(null);

  const normalized = query.trim().toLowerCase();
  const visible = useMemo(
    () => (normalized ? rows.filter((r) => r.teamName.toLowerCase().includes(normalized)) : rows),
    [rows, normalized]
  );

  const myRank = currentUserId ? rows.find((r) => r.userId === currentUserId)?.rank ?? null : null;

  const jumpToMe = () => {
    setQuery("");
    // Sledeći frejm: red mora prvo da se vrati u DOM ako ga je pretraga sklonila.
    requestAnimationFrame(() =>
      myRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchTeam")}
          className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm w-full sm:w-64 placeholder:text-slate-500 focus:outline-none focus:border-gold-400"
        />
        {myRank !== null && (
          <button
            onClick={jumpToMe}
            className="text-sm font-semibold text-gold-300 hover:text-gold-400 whitespace-nowrap"
          >
            {t("showMe", { rank: myRank })}
          </button>
        )}
        <span className="text-xs text-slate-500 ml-auto">
          {t("teamsShown", { shown: visible.length, total: rows.length })}
        </span>
      </div>

      {gameweekNumber === null && (
        <p className="text-slate-400 text-sm mb-4 bg-navy-800 border border-navy-600 rounded-lg px-4 py-3">
          {t("noFinalized")}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wide">
              <th className="text-left font-semibold py-2 pl-3 pr-2 w-12">{t("colRank")}</th>
              <th className="text-left font-semibold py-2 px-2">{t("colTeam")}</th>
              <th className="text-right font-semibold py-2 px-2 whitespace-nowrap">
                {gameweekNumber !== null
                  ? t("colGameweek", { number: gameweekNumber })
                  : t("colGameweekEmpty")}
              </th>
              <th className="text-right font-semibold py-2 pl-2 pr-3">{t("colTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const isMe = row.userId === currentUserId;
              return (
                <tr
                  key={row.userId}
                  ref={isMe ? myRowRef : undefined}
                  className={`border-t border-navy-700 ${
                    isMe ? "bg-navy-700/60" : "hover:bg-navy-800/60"
                  } transition-colors`}
                >
                  <td className="py-2.5 pl-3 pr-2 font-display font-bold text-slate-300 tabular-nums">
                    {row.rank}
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center font-display font-bold text-navy-950 text-[10px]"
                        style={{ backgroundColor: row.teamColor }}
                      >
                        {row.teamName.slice(0, 2).toUpperCase()}
                      </span>
                      <Link
                        href={`/tim/${row.userId}`}
                        className={`truncate hover:underline ${
                          isMe ? "font-semibold text-gold-300" : ""
                        }`}
                      >
                        {row.teamName}
                      </Link>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-right text-slate-300 tabular-nums">
                    {row.gameweekPoints ?? "—"}
                  </td>
                  <td className="py-2.5 pl-2 pr-3 text-right font-display font-bold tabular-nums">
                    {row.totalPoints}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visible.length === 0 && (
        <p className="text-slate-400 text-sm py-6 text-center">
          {t("noSearchMatch", { query })}
        </p>
      )}
    </div>
  );
}
