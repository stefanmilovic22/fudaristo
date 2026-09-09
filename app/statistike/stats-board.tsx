"use client";

import { useState } from "react";

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
};

const POSITION_LABEL: Record<string, string> = {
  GK: "Golmani",
  DEF: "Odbrana",
  MID: "Vezni red",
  FWD: "Napad",
};
const POSITION_ORDER = ["GK", "DEF", "MID", "FWD"];

type TabKey = "fantasy" | "scorers" | "assists" | "clubs";

const TABS: { key: TabKey; label: string }[] = [
  { key: "fantasy", label: "Fantasy poeni" },
  { key: "scorers", label: "Strelci" },
  { key: "assists", label: "Asistenti" },
  { key: "clubs", label: "Klubovi" },
];

export function StatsBoard({ data }: { data: StatsData }) {
  const [tab, setTab] = useState<TabKey>("fantasy");

  return (
    <div>
      <div className="flex gap-1 bg-navy-800 p-1 rounded-lg mb-5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 text-sm font-semibold px-3 sm:px-4 py-2 rounded-md transition-colors ${
              tab === t.key
                ? "bg-gold-400 text-navy-950"
                : "text-slate-300 hover:text-chalk-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "fantasy" && <FantasyByPosition entries={data.byPosition} />}
      {tab === "scorers" && (
        <SingleList
          title="Najbolji strelci"
          unit="gol."
          entries={data.scorers}
          empty="Još nijedan gol nije unet u statistiku."
        />
      )}
      {tab === "assists" && (
        <SingleList
          title="Najviše asistencija"
          unit="asist."
          entries={data.assists}
          empty="Još nijedna asistencija nije uneta u statistiku."
        />
      )}
      {tab === "clubs" && (
        <SingleList
          title="Klubovi po fantasy poenima"
          unit="pts"
          entries={data.clubs}
          empty="Klupske sume se pojavljuju čim igrači počnu da skupljaju poene."
        />
      )}
    </div>
  );
}

function FantasyByPosition({ entries }: { entries: StatEntry[] }) {
  const groups = POSITION_ORDER.map((pos) => ({
    pos,
    rows: entries.filter((e) => e.position === pos),
  })).filter((g) => g.rows.length > 0);

  if (groups.length === 0) {
    return <Empty text="Poeni se pojavljuju čim admin obračuna prvo kolo." />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {groups.map((g) => (
        <div key={g.pos} className="bg-navy-800 border border-navy-600 rounded-lg p-4">
          <h3 className="font-display text-sm uppercase tracking-wide text-slate-400 mb-3">
            {POSITION_LABEL[g.pos] ?? g.pos}
          </h3>
          <Rows entries={g.rows} unit="pts" />
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
