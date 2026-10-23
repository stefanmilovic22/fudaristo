"use client";

import { useMemo, useState } from "react";

export type TvCountry = { code: string; name: string; flag: string; home: boolean; channels: string[] };
export type TvRegion = { id: string; title: string; countries: TvCountry[] };

/**
 * Spisak emitera po regionima sa pretragom (zemlja ili kanal). Podaci i nazivi
 * na jeziku posetioca dolaze sa servera; ovde je samo filtriranje.
 */
export function TvBoard({
  regions,
  labels,
}: {
  regions: TvRegion[];
  labels: { search: string; noMatch: string; home: string };
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const visible = useMemo(
    () =>
      regions
        .map((r) => ({
          ...r,
          countries: q
            ? r.countries.filter(
                (c) => c.name.toLowerCase().includes(q) || c.channels.some((ch) => ch.toLowerCase().includes(q))
              )
            : r.countries,
        }))
        .filter((r) => r.countries.length > 0),
    [regions, q]
  );

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={labels.search}
        className="w-full sm:w-80 bg-navy-800 border border-navy-700 rounded-xl px-4 py-2.5 text-base outline-none focus:border-gold-400 mb-5"
      />

      {visible.length === 0 && <p className="text-sm text-slate-400">{labels.noMatch}</p>}

      <div className="flex flex-col gap-7">
        {visible.map((r) => (
          <section key={r.id}>
            <h3 className="font-display text-lg mb-3 text-chalk-50">{r.title}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {r.countries.map((c) => (
                <div
                  key={c.code}
                  className={`bg-navy-800 rounded-xl overflow-hidden border ${
                    c.home ? "border-gold-400" : "border-gold-400/40"
                  }`}
                >
                  <div className="bg-navy-700 border-b border-gold-400/25 px-3.5 py-2 flex items-center gap-2.5">
                    <span className="text-lg leading-none" aria-hidden>
                      {c.flag}
                    </span>
                    <h4 className="font-display text-[13px] uppercase tracking-wider text-gold-300 min-w-0 truncate">
                      {c.name}
                    </h4>
                    {c.home && <span className="ml-auto shrink-0 text-[10px] font-bold text-slate-300">{labels.home}</span>}
                  </div>
                  <ul className="flex flex-wrap gap-1.5 p-3">
                    {c.channels.map((ch) => (
                      <li key={ch} className="text-xs font-semibold bg-navy-700 text-chalk-50 rounded-full px-2.5 py-1">
                        {ch}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
