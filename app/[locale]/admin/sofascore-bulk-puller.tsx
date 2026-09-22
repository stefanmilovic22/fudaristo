"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { isStaleDeploymentError, STALE_DEPLOYMENT_MESSAGE } from "@/lib/stale-deployment";
import {
  previewSofascoreBulkAction,
  confirmSofascoreBulkAction,
  type SofascoreBulkPreview,
  type SofascoreBulkMatch,
} from "./actions";

/**
 * Bulk backfill SofaScore ocena — učitaš JEDAN fajl (skinut browser-konzola
 * skriptom, videti uputstvo ispod) sa više mečeva odjednom, umesto meč-po-meč
 * kao na stranici pojedinačnog meča (sofascore-rating-puller.tsx, isti
 * dvokoračni princip: pregled pa potvrda).
 */
export function SofascoreBulkPuller() {
  const router = useRouter();
  const [jsonText, setJsonText] = useState("");
  const [preview, setPreview] = useState<SofascoreBulkPreview | null>(null);
  // ključ "matchIndex:sofaName" -> playerId ili "" (ne upisuj)
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [working, setWorking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setJsonText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function handlePreview() {
    setWorking(true);
    setError(null);
    setStale(false);
    setDone(null);
    try {
      const result = await previewSofascoreBulkAction(jsonText);
      setPreview(result);
      const nextChoices: Record<string, string> = {};
      const nextExpanded: Record<number, boolean> = {};
      result.matches.forEach((m, i) => {
        const anyUnmatched = m.rows.some((r) => !r.matchedPlayerId);
        nextExpanded[i] = m.matchedFixtureId === null || anyUnmatched;
        for (const r of m.rows) nextChoices[`${i}:${r.sofaName}`] = r.matchedPlayerId ?? "";
      });
      setChoices(nextChoices);
      setExpanded(nextExpanded);
    } catch (e) {
      setStale(isStaleDeploymentError(e));
      setError(
        isStaleDeploymentError(e)
          ? STALE_DEPLOYMENT_MESSAGE
          : e instanceof Error
            ? e.message
            : String(e)
      );
    } finally {
      setWorking(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setConfirming(true);
    setError(null);
    setStale(false);
    try {
      const entries: { fixtureId: string; playerId: string; rating: number }[] = [];
      preview.matches.forEach((m, i) => {
        if (!m.matchedFixtureId) return;
        for (const r of m.rows) {
          const playerId = choices[`${i}:${r.sofaName}`];
          if (playerId) entries.push({ fixtureId: m.matchedFixtureId, playerId, rating: r.rating });
        }
      });
      const result = await confirmSofascoreBulkAction(entries);
      setDone(result.written);
      setPreview(null);
      setJsonText("");
      router.refresh();
    } catch (e) {
      setStale(isStaleDeploymentError(e));
      setError(
        isStaleDeploymentError(e)
          ? STALE_DEPLOYMENT_MESSAGE
          : e instanceof Error
            ? e.message
            : String(e)
      );
    } finally {
      setConfirming(false);
    }
  }

  const totalSelected = preview
    ? preview.matches.reduce(
        (sum, m, i) => sum + m.rows.filter((r) => choices[`${i}:${r.sofaName}`]).length,
        0
      )
    : 0;

  return (
    <section className="bg-navy-800 border border-navy-600 rounded-lg p-5">
      <h3 className="font-display text-lg mb-1">SofaScore ocene — bulk unos (backfill)</h3>
      <p className="text-slate-400 text-xs mb-3">
        Za više kola odjednom, umesto meč-po-meč. Pokreni skriptu za browser konzolu na sofascore.com
        (traži je od Claude-a ako je nemaš) — ona skida jedan .json fajl sa svim mečevima. Učitaj ga
        ovde.
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
            {working ? "Parsiram…" : "Pregledaj"}
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

      {done !== null && <p className="text-gold-300 text-sm mt-2">Upisano {done} ocena.</p>}

      {preview && (
        <div className="mt-1 flex flex-col gap-3">
          <p className="text-slate-400 text-xs">
            {preview.matches.length} mečeva u fajlu · {preview.matches.filter((m) => m.matchedFixtureId).length}{" "}
            prepoznato u našoj bazi.
          </p>

          {preview.matches.map((m, i) => (
            <MatchCard
              key={i}
              index={i}
              match={m}
              expanded={expanded[i] ?? false}
              onToggle={() => setExpanded((prev) => ({ ...prev, [i]: !prev[i] }))}
              choices={choices}
              onChoice={(sofaName, playerId) =>
                setChoices((prev) => ({ ...prev, [`${i}:${sofaName}`]: playerId }))
              }
            />
          ))}

          <div className="flex gap-2 items-center mt-1">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming || totalSelected === 0}
              className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2 rounded-lg hover:bg-gold-300 transition-colors disabled:opacity-40"
            >
              {confirming ? "Upisujem…" : `Potvrdi sve (${totalSelected} ocena)`}
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

function MatchCard({
  index,
  match,
  expanded,
  onToggle,
  choices,
  onChoice,
}: {
  index: number;
  match: SofascoreBulkMatch;
  expanded: boolean;
  onToggle: () => void;
  choices: Record<string, string>;
  onChoice: (sofaName: string, playerId: string) => void;
}) {
  const matchedCount = match.rows.filter((r) => choices[`${index}:${r.sofaName}`]).length;

  return (
    <div className="bg-navy-900/60 border border-navy-700 rounded-lg p-3">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-semibold">
          {match.matchedFixtureId ? "✓" : "✗"} {match.label}
        </span>
        <span className="text-xs text-slate-400 shrink-0">
          {match.matchedFixtureId ? `${matchedCount}/${match.rows.length} uparen` : "nije nađen"}
        </span>
      </button>

      {match.warnings.length > 0 && (
        <ul className="text-danger-400 text-xs mt-1.5 flex flex-col gap-0.5">
          {match.warnings.map((w, wi) => (
            <li key={wi}>{w}</li>
          ))}
        </ul>
      )}

      {expanded && match.rows.length > 0 && (
        <div className="overflow-x-auto mt-2 -mx-3 px-3">
          <table className="w-full text-xs min-w-[480px]">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-1.5 pr-2">SofaScore ime</th>
                <th className="pb-1.5 px-1">Poz.</th>
                <th className="pb-1.5 px-1">Ocena</th>
                <th className="pb-1.5 pl-1">Naš igrač</th>
              </tr>
            </thead>
            <tbody>
              {match.rows.map((r) => (
                <tr key={r.sofaName} className="border-t border-navy-700/60">
                  <td className="py-1 pr-2 whitespace-nowrap">{r.sofaName}</td>
                  <td className="py-1 px-1 text-slate-400">{r.sofaPosition}</td>
                  <td className="py-1 px-1 text-gold-300 font-semibold tabular-nums">
                    {r.rating.toFixed(1)}
                  </td>
                  <td className="py-1 pl-1">
                    <select
                      value={choices[`${index}:${r.sofaName}`] ?? ""}
                      onChange={(e) => onChoice(r.sofaName, e.target.value)}
                      className={`bg-navy-900 border rounded px-1.5 py-1 text-xs ${
                        choices[`${index}:${r.sofaName}`]
                          ? "border-navy-600 text-chalk-50"
                          : "border-danger-400 text-danger-400"
                      }`}
                    >
                      <option value="">— ne upisuj —</option>
                      {match.squadPlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.position})
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
