"use client";

import { useState } from "react";
import { Flag } from "@/components/Flag";
import { isStaleDeploymentError, STALE_DEPLOYMENT_MESSAGE } from "@/lib/stale-deployment";
import {
  confirmNationalitiesAction,
  previewNationalitiesAction,
  type NationalitiesPreview,
} from "./actions";

/**
 * Nacionalnosti igrača iz SofaScore-a. Učitaš fajl iz
 * scripts/sofascore-drzave-konzola.js, pregledaš šta se menja i potvrdiš.
 * Tačno ime = unapred štiklirano; uparivanje samo po prezimenu ili bez uparivanja
 * admin potvrđuje ručno (izborom našeg igrača u listi).
 */
export function NationalitiesPanel() {
  const [jsonText, setJsonText] = useState("");
  const [preview, setPreview] = useState<NationalitiesPreview | null>(null);
  const [players, setPlayers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [working, setWorking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  function fail(e: unknown) {
    const isStale = isStaleDeploymentError(e);
    setStale(isStale);
    setError(isStale ? STALE_DEPLOYMENT_MESSAGE : e instanceof Error ? e.message : String(e));
  }

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
      const res = await previewNationalitiesAction(jsonText);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const result = res.preview;
      setPreview(result);
      const p: Record<number, string> = {};
      const c: Record<number, boolean> = {};
      result.rows.forEach((r, i) => {
        p[i] = r.playerId ?? "";
        c[i] = r.exact && Boolean(r.playerId);
      });
      setPlayers(p);
      setChecked(c);
    } catch (e) {
      fail(e);
    } finally {
      setWorking(false);
    }
  }

  const selectedCount = preview ? preview.rows.filter((_, i) => checked[i] && players[i]).length : 0;

  async function handleConfirm() {
    if (!preview) return;
    setConfirming(true);
    setError(null);
    setStale(false);
    try {
      const entries = preview.rows
        .map((r, i) => ({ r, i }))
        .filter(({ i }) => checked[i] && players[i])
        .map(({ r, i }) => ({ playerId: players[i], country: r.country }));
      const result = await confirmNationalitiesAction(entries);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(result.updated);
      setPreview(null);
      setJsonText("");
    } catch (e) {
      fail(e);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <section className="bg-navy-800 border border-navy-600 rounded-lg p-5">
      <h3 className="font-display text-lg mb-1">Nacionalnosti igrača (SofaScore)</h3>
      <p className="text-slate-400 text-xs mb-3">
        Retko — kad stignu novi igrači. Učitaj fajl skinut skriptom <code>scripts/sofascore-drzave-konzola.js</code>.
        Predlažu se samo igrači kojima se država dodaje ili menja. Prikazuje se kao zastavica uz ime u listi igrača i
        na profilu.
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
            placeholder='Ili nalepi ovde: {"teams":[{"team":"AEK Athens","players":[{"player":{"name":"…","country":{"alpha2":"GR"}}}]}]}'
            rows={3}
            className="w-full mt-2 bg-navy-900/60 border border-navy-600 rounded-lg px-3 py-2 text-xs text-chalk-50 font-mono"
          />
          <button
            type="button"
            onClick={handlePreview}
            disabled={working || !jsonText.trim()}
            className="mt-2 bg-navy-700 text-chalk-50 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-navy-600 transition-colors disabled:opacity-40"
          >
            {working ? "Poredim…" : "Pronađi izmene"}
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

      {done !== null && <p className="text-gold-300 text-sm mt-2">Gotovo — upisana država za {done} igrača.</p>}

      {preview && (
        <div className="mt-1 flex flex-col gap-3">
          <p className="text-slate-400 text-xs">
            {preview.rows.length} za upis · {preview.unchanged} već ima istu državu
            {preview.withoutCountry > 0 && <> · {preview.withoutCountry} bez države u fajlu</>}
            {preview.unmatchedOurs.length > 0 && <> · {preview.unmatchedOurs.length} naših igrača nije u fajlu</>}.
          </p>
          {preview.warnings.map((w, i) => (
            <p key={i} className="text-danger-400 text-xs">
              {w}
            </p>
          ))}

          {preview.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-1.5 pr-2 w-6" />
                    <th className="pb-1.5 pr-2">Klub</th>
                    <th className="pb-1.5 px-1">SofaScore ime</th>
                    <th className="pb-1.5 px-1">Naš igrač</th>
                    <th className="pb-1.5 pl-1">Država</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => {
                    const clubPlayers = preview.squadPlayers.filter((p) => p.club === r.team);
                    return (
                      <tr key={i} className="border-t border-navy-700/60">
                        <td className="py-1 pr-2">
                          <input
                            type="checkbox"
                            checked={Boolean(checked[i])}
                            disabled={!players[i]}
                            onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))}
                            aria-label="Primeni"
                          />
                        </td>
                        <td className="py-1 pr-2 whitespace-nowrap text-slate-300">{r.team}</td>
                        <td className="py-1 px-1 whitespace-nowrap">{r.sofaName}</td>
                        <td className="py-1 px-1">
                          <select
                            value={players[i] ?? ""}
                            onChange={(e) => {
                              setPlayers((p) => ({ ...p, [i]: e.target.value }));
                              setChecked((c) => ({ ...c, [i]: Boolean(e.target.value) }));
                            }}
                            className={`bg-navy-900 border rounded px-1.5 py-1 text-xs ${
                              !players[i]
                                ? "border-danger-400 text-danger-400"
                                : r.exact
                                  ? "border-navy-600 text-chalk-50"
                                  : "border-gold-400 text-gold-300"
                            }`}
                          >
                            <option value="">— ne upisuj —</option>
                            {clubPlayers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          {players[i] && !r.exact && <span className="ml-1.5 text-gold-300">proveri ime</span>}
                        </td>
                        <td className="py-1 pl-1 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <Flag code={r.country} name={r.countryName ?? r.country} height={12} />
                            {r.country}
                            {r.countryName ? <span className="text-slate-500">{r.countryName}</span> : null}
                          </span>
                          {r.current && <span className="ml-1.5 text-slate-500">(bilo {r.current})</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {preview.unmatchedOurs.length > 0 && (
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer hover:text-slate-300">
                Naši igrači koje fajl nije pokrio ({preview.unmatchedOurs.length}) — ostaju bez promene
              </summary>
              <p className="mt-1 leading-relaxed">
                {preview.unmatchedOurs.map((u) => `${u.name} (${u.club})`).join(", ")}
              </p>
            </details>
          )}

          <div className="flex gap-2 items-center mt-1">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming || selectedCount === 0}
              className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2 rounded-lg hover:bg-gold-300 transition-colors disabled:opacity-40"
            >
              {confirming ? "Upisujem…" : `Primeni izabrano (${selectedCount})`}
            </button>
            <button type="button" onClick={() => setPreview(null)} className="text-slate-300 text-sm px-3 py-2 hover:text-chalk-50">
              Odustani
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
