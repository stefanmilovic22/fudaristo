"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { isStaleDeploymentError, STALE_DEPLOYMENT_MESSAGE } from "@/lib/stale-deployment";
import {
  previewSofascoreEventsAction,
  confirmSofascoreEventsAction,
  type SofascoreEventsPreview,
  type SofascoreEventsMatch,
} from "./actions";

/**
 * Ispravka golova / asistencija / autogolova po SofaScore-u. Učitava se isti
 * .json fajl kao za ocene (bulk). Pregled pokazuje SAMO razlike (naš broj →
 * SofaScore-ov), po igraču; ništa se ne upisuje dok se ne potvrdi.
 *
 * Meč čiji se golovi ne slažu sa rezultatom u našoj bazi se preskače —
 * videti lib/sofascore-events.ts.
 */
export function SofascoreEventsPuller() {
  const router = useRouter();
  const [jsonText, setJsonText] = useState("");
  const [preview, setPreview] = useState<SofascoreEventsPreview | null>(null);
  // Ključ "meč:red" -> izabran naš igrač ("" = ne upisuj) i da li je red štikliran.
  const [players, setPlayers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [working, setWorking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [done, setDone] = useState<{ written: number; gameweeks: number[] } | null>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setJsonText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  function fail(e: unknown) {
    const isStale = isStaleDeploymentError(e);
    setStale(isStale);
    setError(isStale ? STALE_DEPLOYMENT_MESSAGE : e instanceof Error ? e.message : String(e));
  }

  async function handlePreview() {
    setWorking(true);
    setError(null);
    setStale(false);
    setDone(null);
    try {
      const result = await previewSofascoreEventsAction(jsonText);
      setPreview(result);
      const p: Record<string, string> = {};
      const c: Record<string, boolean> = {};
      result.matches.forEach((m, i) =>
        m.rows.forEach((r, ri) => {
          p[`${i}:${ri}`] = r.playerId ?? "";
          // Tačno ime = štiklirano; samo-prezime ili bez uparivanja = admin mora da potvrdi.
          c[`${i}:${ri}`] = r.exact && Boolean(r.playerId);
        })
      );
      setPlayers(p);
      setChecked(c);
    } catch (e) {
      fail(e);
    } finally {
      setWorking(false);
    }
  }

  const selectedEntries = () => {
    const entries: {
      fixtureId: string;
      playerId: string;
      goals?: number;
      assists?: number;
      ownGoals?: number;
    }[] = [];
    preview?.matches.forEach((m, i) => {
      if (!m.fixtureId) return;
      m.rows.forEach((r, ri) => {
        const key = `${i}:${ri}`;
        const playerId = players[key];
        if (!checked[key] || !playerId) return;
        entries.push({
          fixtureId: m.fixtureId!,
          playerId,
          ...(r.change.goals ? { goals: r.sofa.goals } : {}),
          ...(r.change.assists ? { assists: r.sofa.assists } : {}),
          ...(r.change.ownGoals ? { ownGoals: r.sofa.ownGoals } : {}),
        });
      });
    });
    return entries;
  };

  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    setStale(false);
    try {
      const result = await confirmSofascoreEventsAction(selectedEntries());
      setDone(result);
      setPreview(null);
      setJsonText("");
      router.refresh();
    } catch (e) {
      fail(e);
    } finally {
      setConfirming(false);
    }
  }

  const total = preview ? selectedEntries().length : 0;

  return (
    <section className="bg-navy-800 border border-navy-600 rounded-lg p-5">
      <h3 className="font-display text-lg mb-1">SofaScore golovi i asistencije — ispravka</h3>
      <p className="text-slate-400 text-xs mb-3">
        Učitaj fajl skinut skriptom scripts/sofascore-bulk-konzola.js (isti kao za ocene, ali sa golovima). Prikazuju se samo razlike između našeg i SofaScore-ovog broja
        golova, asistencija i autogolova. Posle upisa pokreni „Obračunaj poene” za izmenjena kola.
      </p>

      {!preview && (
        <>
          <input
            type="file"
            accept="application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="text-xs text-slate-300"
          />
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder='Ili nalepi ovde: {"matches":[{"sofaEventId":...,"homeTeam":...,"lineups":{...}}]}'
            rows={3}
            className="w-full mt-2 bg-navy-900/60 border border-navy-600 rounded-lg px-3 py-2 text-xs text-chalk-50 font-mono"
          />
          <button
            type="button"
            onClick={handlePreview}
            disabled={working || !jsonText.trim()}
            className="mt-2 bg-navy-700 text-chalk-50 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-navy-600 transition-colors disabled:opacity-40"
          >
            {working ? "Poredim…" : "Pronađi razlike"}
          </button>
        </>
      )}

      {error && (
        <div className="text-danger-400 text-xs mt-2">
          <p>{error}</p>
          {stale && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 bg-gold-400 text-navy-950 font-bold text-xs px-3 py-1.5 rounded-lg"
            >
              Osveži stranicu
            </button>
          )}
        </div>
      )}

      {done && (
        <p className="text-gold-300 text-sm mt-2">
          Upisano {done.written} izmena.{" "}
          {done.gameweeks.length > 0 && (
            <>Pokreni „Obračunaj poene” za kolo: <strong>{done.gameweeks.join(", ")}</strong>.</>
          )}
        </p>
      )}

      {preview && (
        <div className="mt-1 flex flex-col gap-3">
          <p className="text-slate-400 text-xs">
            {preview.matches.length} mečeva u fajlu · {preview.matches.filter((m) => m.fixtureId).length} prepoznato ·{" "}
            {preview.matches.filter((m) => m.fixtureId && m.scoreOk && m.rows.length > 0).length} sa razlikama.
          </p>

          {preview.matches.map((m, i) => (
            <EventsMatchCard
              key={i}
              index={i}
              match={m}
              players={players}
              checked={checked}
              onPlayer={(key, id) => {
                setPlayers((p) => ({ ...p, [key]: id }));
                setChecked((c) => ({ ...c, [key]: Boolean(id) }));
              }}
              onCheck={(key, v) => setChecked((c) => ({ ...c, [key]: v }))}
              onCheckAll={() =>
                setChecked((c) => {
                  const next = { ...c };
                  m.rows.forEach((_, ri) => {
                    if (players[`${i}:${ri}`]) next[`${i}:${ri}`] = true;
                  });
                  return next;
                })
              }
            />
          ))}

          <div className="flex gap-2 items-center mt-1">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming || total === 0}
              className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2 rounded-lg hover:bg-gold-300 transition-colors disabled:opacity-40"
            >
              {confirming ? "Upisujem…" : `Upiši izabrano (${total})`}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-slate-300 text-sm px-3 py-2 hover:text-chalk-50"
            >
              Odustani
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Delta({ cur, next, changed }: { cur: number; next: number; changed: boolean }) {
  if (!changed) return <span className="text-slate-600">{cur}</span>;
  return (
    <span className="tabular-nums">
      <span className="text-slate-500 line-through">{cur}</span> <span className="text-gold-300 font-bold">→ {next}</span>
    </span>
  );
}

function EventsMatchCard({
  index,
  match,
  players,
  checked,
  onPlayer,
  onCheck,
  onCheckAll,
}: {
  index: number;
  match: SofascoreEventsMatch;
  players: Record<string, string>;
  checked: Record<string, boolean>;
  onPlayer: (key: string, playerId: string) => void;
  onCheck: (key: string, v: boolean) => void;
  onCheckAll: () => void;
}) {
  const status = !match.fixtureId ? "✗" : !match.scoreOk ? "!" : match.rows.length === 0 ? "✓" : "Δ";
  return (
    <div className="bg-navy-900/60 border border-navy-700 rounded-lg p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">
          {status} {match.label}
        </span>
        <span className="text-xs text-slate-400 shrink-0">
          {match.fixtureId ? match.scoreText : "nije nađen"}
        </span>
      </div>

      {match.warnings.length > 0 && (
        <ul className="text-danger-400 text-xs mt-1.5 flex flex-col gap-0.5">
          {match.warnings.map((w, wi) => (
            <li key={wi}>{w}</li>
          ))}
        </ul>
      )}

      {match.fixtureId && match.scoreOk && match.rows.length === 0 && (
        <p className="text-slate-400 text-xs mt-1.5">Nema razlika — statistika odgovara SofaScore-u.</p>
      )}

      {match.rows.length > 0 && (
        <div className="overflow-x-auto mt-2 -mx-3 px-3">
          <table className="w-full text-xs min-w-[560px]">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-1.5 pr-2 w-6" />
                <th className="pb-1.5 pr-2">SofaScore ime</th>
                <th className="pb-1.5 px-1">Golovi</th>
                <th className="pb-1.5 px-1">Asist.</th>
                <th className="pb-1.5 px-1">Autogol</th>
                <th className="pb-1.5 pl-1">Naš igrač</th>
              </tr>
            </thead>
            <tbody>
              {match.rows.map((r, ri) => {
                const key = `${index}:${ri}`;
                const playerId = players[key] ?? "";
                return (
                  <tr key={key} className="border-t border-navy-700/60">
                    <td className="py-1 pr-2">
                      <input
                        type="checkbox"
                        checked={Boolean(checked[key])}
                        disabled={!playerId}
                        onChange={(e) => onCheck(key, e.target.checked)}
                        aria-label="Upiši"
                      />
                    </td>
                    <td className="py-1 pr-2 whitespace-nowrap">
                      {r.sofaName ?? <span className="text-slate-500">(SofaScore ga ne navodi)</span>}
                    </td>
                    <td className="py-1 px-1"><Delta cur={r.current.goals} next={r.sofa.goals} changed={r.change.goals} /></td>
                    <td className="py-1 px-1"><Delta cur={r.current.assists} next={r.sofa.assists} changed={r.change.assists} /></td>
                    <td className="py-1 px-1"><Delta cur={r.current.ownGoals} next={r.sofa.ownGoals} changed={r.change.ownGoals} /></td>
                    <td className="py-1 pl-1">
                      <select
                        value={playerId}
                        onChange={(e) => onPlayer(key, e.target.value)}
                        className={`bg-navy-900 border rounded px-1.5 py-1 text-xs ${
                          !playerId
                            ? "border-danger-400 text-danger-400"
                            : r.exact
                              ? "border-navy-600 text-chalk-50"
                              : "border-gold-400 text-gold-300"
                        }`}
                      >
                        <option value="">— ne upisuj —</option>
                        {match.squadPlayers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      {playerId && !r.exact && r.sofaName && (
                        <span className="ml-1.5 text-gold-300">proveri ime</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button type="button" onClick={onCheckAll} className="mt-2 text-xs text-gold-300 hover:text-gold-400">
            Štikliraj sve uparene
          </button>
        </div>
      )}
    </div>
  );
}
