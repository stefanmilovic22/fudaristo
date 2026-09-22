"use client";

import { useState } from "react";
import { isStaleDeploymentError, STALE_DEPLOYMENT_MESSAGE } from "@/lib/stale-deployment";
import { testSofascoreFetchAction, type SofascoreFetchTestResult } from "./actions";

/**
 * PRIVREMENO dugme — test izvodljivosti pre nego što se gradi ceo SofaScore
 * tok za ocene igrača. Videti komentar uz testSofascoreFetchAction u
 * actions.ts. Ukloniti (ili zameniti pravim tokom) kad se pitanje reši.
 *
 * Podrazumevani event ID (16559934) je stvaran, potvrđen meč
 * (Levadiakos — Olympiacos) koji je ručno proveren u browseru.
 */
export function TestSofascoreButton() {
  const [eventId, setEventId] = useState("16559934");
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<SofascoreFetchTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  async function handleClick() {
    setWorking(true);
    setError(null);
    setResult(null);
    setStale(false);
    try {
      setResult(await testSofascoreFetchAction(eventId.trim()));
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

  return (
    <section className="bg-navy-800 border border-navy-600 rounded-lg p-5">
      <h3 className="font-display text-lg mb-1">Test: SofaScore fetch sa servera (privremeno)</h3>
      <p className="text-slate-400 text-sm mb-3">
        Proverava da li Vercel dobija 403 od SofaScore-a, pre nego što gradimo ceo tok za ocene igrača.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          placeholder="SofaScore event ID"
          className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-sm text-chalk-50 w-48"
        />
        <button
          type="button"
          onClick={handleClick}
          disabled={working || !eventId.trim()}
          className="bg-navy-700 text-chalk-50 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-navy-600 transition-colors disabled:opacity-40"
        >
          {working ? "Zovem…" : "Testiraj"}
        </button>
      </div>

      {error && (
        <div className="text-danger-400 text-xs mb-2">
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

      {result && (
        <div className="text-xs flex flex-col gap-2">
          <p>
            <span className="text-slate-400">Status: </span>
            <span
              className={`font-bold ${result.ok ? "text-pitch-400" : "text-danger-400"}`}
            >
              {result.status ?? "—"}
            </span>
            {result.errorMessage && (
              <span className="text-danger-400 ml-2">({result.errorMessage})</span>
            )}
          </p>
          {result.snippet && (
            <pre className="bg-navy-900 border border-navy-700 rounded-lg p-3 overflow-x-auto text-slate-300 whitespace-pre-wrap break-all">
              {result.snippet}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
