"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TeamOfWeekBoard, type TeamOfWeekData } from "@/components/TeamOfWeekBoard";

export type StatEntry = {
  id: string;
  name: string;
  clubName: string | null;
  value: number;
  position?: string;
  /** Pravi rang iz view-a. RANK() daje izjednačenima isti broj, pa "top 5"
   *  ume da vrati 6+ redova (tri prva mesta → sledeći je 4.). Redni broj u
   *  listi bi tu lagao, zato se prikazuje ovo kad postoji. */
  rank?: number;
};

export type StatsData = {
  byPosition: StatEntry[];
  scorers: StatEntry[];
  assists: StatEntry[];
  clubs: StatEntry[];
  ratings: StatEntry[];
  /** null dok nijedno kolo nije zaključano — videti Empty ispod. */
  teamOfWeek: TeamOfWeekData | null;
};

const POSITION_ORDER = ["GK", "DEF", "MID", "FWD"] as const;

type TabKey = "fantasy" | "scorers" | "assists" | "clubs" | "ratings" | "team";

/** Ikonice tabova — ugrađeni SVG, isti pristup kao u glavnoj navigaciji. */
const TAB_ICON: Record<TabKey, (p: { className?: string }) => React.ReactElement> = {
  fantasy: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path
        d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8L12 3Z"
        strokeLinejoin="round"
      />
    </svg>
  ),
  scorers: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="m12 7 3.5 2.5-1.3 4.1H9.8L8.5 9.5 12 7Z" strokeLinejoin="round" />
    </svg>
  ),
  assists: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M4 17c4-8 12-8 16 0" strokeLinecap="round" />
      <path d="M16 5h4v4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 5 13 12" strokeLinecap="round" />
    </svg>
  ),
  clubs: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M12 3l7 3v6c0 4.4-2.9 8-7 9-4.1-1-7-4.6-7-9V6l7-3Z" strokeLinejoin="round" />
    </svg>
  ),
  ratings: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path
        d="m12 4 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7L12 4Z"
        strokeLinejoin="round"
      />
    </svg>
  ),
  team: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" strokeLinejoin="round" />
      <path d="M3 12h18M12 4v16" strokeLinecap="round" />
    </svg>
  ),
};

const TAB_KEYS: {
  key: TabKey;
  label: "tabFantasy" | "tabScorers" | "tabAssists" | "tabClubs" | "tabRatings" | "tabTeam";
}[] = [
  { key: "fantasy", label: "tabFantasy" },
  { key: "scorers", label: "tabScorers" },
  { key: "assists", label: "tabAssists" },
  { key: "clubs", label: "tabClubs" },
  { key: "ratings", label: "tabRatings" },
  { key: "team", label: "tabTeam" },
];

export function StatsBoard({ data }: { data: StatsData }) {
  const t = useTranslations("stats");
  const [tab, setTab] = useState<TabKey>("fantasy");

  return (
    <div>
      <div className="flex gap-1 bg-navy-800 p-1 rounded-lg mb-5 overflow-x-auto">
        {TAB_KEYS.map((tab_) => {
          const active = tab === tab_.key;
          const Icon = TAB_ICON[tab_.key];
          return (
            <button
              key={tab_.key}
              onClick={() => setTab(tab_.key)}
              aria-pressed={active}
              className={`shrink-0 flex items-center gap-1.5 text-sm font-semibold px-3 sm:px-4 py-2 rounded-md transition-colors ${
                active
                  ? "bg-gold-400 text-navy-950"
                  : "text-slate-300 hover:text-chalk-50 hover:bg-navy-700"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {t(tab_.label)}
            </button>
          );
        })}
      </div>

      {tab === "fantasy" && <FantasyByPosition entries={data.byPosition} />}
      {tab === "scorers" && (
        <SingleList
          title={t("topScorers")}
          unit={t("unitGoals")}
          entries={data.scorers}
          empty={t("noGoals")}
        />
      )}
      {tab === "assists" && (
        <SingleList
          title={t("topAssists")}
          unit={t("unitAssists")}
          entries={data.assists}
          empty={t("noAssists")}
        />
      )}
      {tab === "clubs" && (
        <SingleList
          title={t("clubsByPoints")}
          unit={t("unitPoints")}
          entries={data.clubs}
          empty={t("noClubPoints")}
        />
      )}
      {tab === "ratings" && (
        <SingleList title={t("topRatings")} unit="" entries={data.ratings} empty={t("noRatings")} />
      )}
      {tab === "team" &&
        (data.teamOfWeek ? <TeamOfWeekBoard data={data.teamOfWeek} /> : <Empty text={t("noTeamOfWeek")} />)}
    </div>
  );
}

function FantasyByPosition({ entries }: { entries: StatEntry[] }) {
  const t = useTranslations("stats");
  const tPos = useTranslations("positions");
  const groups = POSITION_ORDER.map((pos) => ({
    pos,
    rows: entries.filter((e) => e.position === pos),
  })).filter((g) => g.rows.length > 0);

  if (groups.length === 0) {
    return <Empty text={t("noPositionPoints")} />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {groups.map((g) => (
        <div key={g.pos} className="bg-navy-800 border border-navy-600 rounded-lg p-4">
          <h3 className="font-display text-sm uppercase tracking-wide text-slate-400 mb-3">
            {tPos(g.pos as "GK" | "DEF" | "MID" | "FWD")}
          </h3>
          <Rows entries={g.rows} unit={t("unitPoints")} />
        </div>
      ))}
    </div>
  );
}

function SingleList({
  title,
  unit,
  entries,
  empty,
}: {
  title: string;
  unit: string;
  entries: StatEntry[];
  empty: string;
}) {
  if (entries.length === 0) return <Empty text={empty} />;
  return (
    <div className="bg-navy-800 border border-navy-600 rounded-lg p-4 max-w-xl">
      <h3 className="font-display text-sm uppercase tracking-wide text-slate-400 mb-3">{title}</h3>
      <Rows entries={entries} unit={unit} />
    </div>
  );
}

function Rows({ entries, unit }: { entries: StatEntry[]; unit: string }) {
  return (
    <ol className="flex flex-col">
      {entries.map((e, i) => (
        <li
          key={e.id}
          className="flex items-center gap-3 py-2 border-t border-navy-700 first:border-t-0"
        >
          <span className="w-5 text-center font-display font-bold text-slate-500 text-sm tabular-nums">
            {e.rank ?? i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm truncate">{e.name}</div>
            {e.clubName && <div className="text-xs text-slate-500 truncate">{e.clubName}</div>}
          </div>
          <span className="font-display font-bold tabular-nums whitespace-nowrap">
            {e.value}
            <span className="text-slate-500 text-xs font-body font-normal ml-1">{unit}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-slate-400 text-sm">{text}</p>;
}
