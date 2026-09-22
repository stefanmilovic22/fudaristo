"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { isStaleDeploymentError, STALE_DEPLOYMENT_MESSAGE } from "@/lib/stale-deployment";
import {
  previewSofascoreRatingsAction,
  confirmSofascoreRatingsAction,
  type SofascoreRatingPreview,
} from "../../actions";

/**
 * "Paste JSON" tok — server NE zove SofaScore (403 sa Vercel-a, potvrđeno
 * probom). Admin sam otvori meč na sofascore.com, izvuče JSON
 * (.../api/v1/event/{id}/lineups preko DevTools → Network → Response) i
 * nalepi ga ovde. Isti dvokoračni princip kao worldfootball: prvo PREGLED
 * (predloženo uparivanje po imenu, ništa upisano), pa tek POTVRDA piše u bazu.
 */
export function SofascoreRatingPuller({ fixtureId }: { fixtureId: string }) {
  const router = useRouter();
  const [jsonText, setJsonText] = useState("");
  const [preview, setPreview] = useState<SofascoreRatingPreview | null>(null);
  // playerId ili "" (ne upisuj), ključ je sofaName (dovoljno jedinstveno u okviru jednog meča).
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [working, setWorking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  async function handlePreview() {
    setWorking(true);
    setError(null);
    setStale(false);
    setDone(null);
    try {
      const result = await previewSofascoreRatingsAction(fixtureId, jsonText);
      setPreview(result);
      setChoices(
        Object.fromEntries(result.rows.map((r) => [r.sofaName, r.matchedPlayerId ?? ""]))
      );
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
      const entries = preview.rows
        .map((r) => ({ playerId: choices[r.sofaName], rating: r.rating }))
        .filter((e) => e.playerId);
      const result = await confirmSofascoreRatingsAction(fixtureId, entries);
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

  return (
    <section className="bg-navy-800 rounded-xl ring-1 ring-black/25 p-4">
      <h3 className="font-display text-lg mb-1">SofaScore ocene igrača</h3>
      <p className="text-slate-400 text-xs mb-3">
        Otvori meč na sofascore.com → DevTools (F12) → tab Network → filtriraj Fetch/XHR → nađi zahtev
        sa &quot;lineups&quot; → tab Response → kopiraj ceo sadržaj i nalepi ovde. Server sam ne zove
        SofaScore (vraća 403 sa Vercel-a).
      </p>

      {!preview && (
        <>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder='{"confirmed":true,"home":{"players":[...'
            rows={4}
            className="w-full bg-navy-900/60 border border-navy-600 rounded-lg px-3 py-2 text-xs text-chalk-50 font-mono"
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

      {done !== null && (
        <p className="text-gold-300 text-sm mt-2">Upisano {done} ocena.</p>
      )}

      {preview && (
        <div className="mt-1">
          {preview.warnings.length > 0 && (
            <ul className="text-danger-400 text-xs mb-3 flex flex-col gap-1">
              {preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {!preview.confirmed && (
            <p className="text-slate-400 text-xs mb-3">
              Napomena: SofaScore ovaj meč još vodi kao nepotvrđen — ocene mogu da se promene.
            </p>
          )}

          {preview.rows.length === 0 ? (
            <p className="text-slate-400 text-sm">Nema odigranih igrača sa ocenom u ovom JSON-u.</p>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-slate-400 text-xs">
                    <th className="pb-2 pr-2">SofaScore ime</th>
                    <th className="pb-2 px-1">Poz.</th>
                    <th className="pb-2 px-1">Ocena</th>
                    <th className="pb-2 pl-1">Naš igrač</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.sofaName} className="border-t border-navy-700/60">
                      <td className="py-1.5 pr-2 whitespace-nowrap">{r.sofaName}</td>
                      <td className="py-1.5 px-1 text-slate-400">{r.sofaPosition}</td>
                      <td className="py-1.5 px-1 text-gold-300 font-semibold tabular-nums">
                        {r.rating.toFixed(1)}
                      </td>
                      <td className="py-1.5 pl-1">
                        <select
                          value={choices[r.sofaName] ?? ""}
                          onChange={(e) =>
                            setChoices((prev) => ({ ...prev, [r.sofaName]: e.target.value }))
                          }
                          className={`bg-navy-900/60 border rounded-lg px-2 py-1 text-xs ${
                            choices[r.sofaName]
                              ? "border-navy-600 text-chalk-50"
                              : "border-danger-400 text-danger-400"
                          }`}
                        >
                          <option value="">— ne upisuj —</option>
                          {preview.squadPlayers.map((p) => (
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

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming || preview.rows.length === 0}
              className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2 rounded-lg hover:bg-gold-300 transition-colors disabled:opacity-40"
            >
              {confirming ? "Upisujem…" : "Potvrdi i upiši"}
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
