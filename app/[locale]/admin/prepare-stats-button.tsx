"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { isStaleDeploymentError, STALE_DEPLOYMENT_MESSAGE } from "@/lib/stale-deployment";
import { prepareGameweekStatsAction, type PrepareResult } from "./actions";

/**
 * „Pripremi statistiku za celo kolo” — nađe worldfootball izveštaj za svaki
 * odigran meč bez statistike, upiše mu URL i pripremi redove za unos.
 *
 * Klijentska komponenta zato što treba da prikaže ishod po meču: koji su
 * pripremljeni, a koji nisu i zašto. Sam upis ide kroz Server Action.
 */
export function PrepareStatsButton({
  gameweekId,
  missingCount,
}: {
  gameweekId: string;
  missingCount: number;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<PrepareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  async function handleClick() {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      const res = await prepareGameweekStatsAction(gameweekId);
      setResult(res);
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
      setWorking(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={working}
        className="bg-navy-700 border border-gold-400 text-gold-300 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-gold-400 hover:text-navy-950 transition-colors disabled:opacity-40"
      >
        {working ? "Pripremam…" : `Pripremi statistiku za ${missingCount} meč(eva)`}
      </button>

      <p className="text-slate-500 text-xs mt-1.5">
        Pravi redove za sve igrače oba kluba, iz naše baze — ne zavisi od worldfootball-a. Brojeve
        (minuti, golovi, asistencije) i dalje upisuješ ručno na svakom meču.
      </p>

      {error && (
        <div className="text-danger-400 text-sm mt-2">
          <p>{error}</p>
          {stale && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2 rounded-lg"
            >
              Osveži stranicu
            </button>
          )}
        </div>
      )}

      {result && (
        <div className="mt-2 text-sm">
          <p className="text-gold-300">
            Pripremljeno mečeva: {result.prepared} · redova: {result.seededRows}
            {result.alreadyHadStats > 0 && ` · već imalo statistiku: ${result.alreadyHadStats}`}
          </p>
          {result.urlNote && (
            <p className="text-slate-400 text-xs mt-1">
              Statistika je pripremljena. Linkovi ka worldfootball izveštajima nisu povučeni
              ({result.urlNote}) — otvori ih ručno dok upisuješ brojeve.
            </p>
          )}
          {result.failed.length > 0 && (
            <ul className="text-danger-400 text-xs mt-1 flex flex-col gap-0.5">
              {result.failed.map((f: { fixture: string; reason: string }, i: number) => (
                <li key={i}>
                  {f.fixture}: {f.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
