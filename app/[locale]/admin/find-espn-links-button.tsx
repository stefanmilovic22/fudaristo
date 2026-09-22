"use client";

import { useState } from "react";
import { isStaleDeploymentError, STALE_DEPLOYMENT_MESSAGE } from "@/lib/stale-deployment";
import { findEspnLinksAction, type EspnLinksResult } from "./actions";

/**
 * "Nađi ESPN linkove za kolo" — priprema listu za ručno lepljenje u
 * "Popuni sa ESPN-a" na svakom meču (worldfootball-puller.tsx), umesto da se
 * svaki meč traži pojedinačno na espn.com.
 *
 * Ne piše ništa u bazu — samo prikazuje listu, uvek dostupna za bilo koje
 * kolo koje se pojavi u "Kola koja traže pažnju" (znači i za sledeće kolo,
 * čim mu prvi meč postane uživo/odigran).
 */
export function FindEspnLinksButton({
  gameweekId,
  gameweekNumber,
}: {
  gameweekId: string;
  gameweekNumber: number;
}) {
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<EspnLinksResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  async function handleClick() {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      setResult(await findEspnLinksAction(gameweekId));
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
    <div className="mt-3 pt-3 border-t border-navy-700/60">
      <button
        type="button"
        onClick={handleClick}
        disabled={working}
        className="text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-lg border border-navy-600 hover:text-chalk-50 hover:border-slate-500 transition-colors disabled:opacity-40"
      >
        {working ? "Tražim…" : `Nađi ESPN linkove za kolo ${gameweekNumber}`}
      </button>

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

      {result && (
        <>
          <p className="text-slate-500 text-xs mt-2">
            Nađeno {result.foundCount}/{result.rows.length}. ESPN endpoint je nedokumentovan — proveri
            ručno one koji nisu nađeni.
          </p>
          <ul className="mt-1.5 text-xs flex flex-col gap-1">
            {result.rows.map((r) => (
              <li key={r.fixtureId} className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400 w-56 truncate">{r.label}</span>
                {r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gold-300 hover:underline truncate"
                  >
                    {r.url}
                  </a>
                ) : (
                  <span className="text-danger-400">nije nađen</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
