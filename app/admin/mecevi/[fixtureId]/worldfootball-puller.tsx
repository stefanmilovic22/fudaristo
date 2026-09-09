"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { pullWorldfootballAction, type PullResult } from "../../actions";

/**
 * Dugme "Povuci sa worldfootball-a". Klijentska komponenta samo zato što
 * treba da prikaže rezultat (upozorenja, koliko je igrača uparen) i da
 * refresh-uje stranicu da se pojavi tabela za unos — sam upis ide kroz
 * Server Action (service role), ne direktno sa klijenta.
 */
export function WorldfootballPuller({
  fixtureId,
  initialUrl,
  hasStats,
}: {
  fixtureId: string;
  initialUrl: string;
  hasStats: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [pulling, setPulling] = useState(false);
  const [result, setResult] = useState<PullResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePull() {
    setPulling(true);
    setError(null);
    setResult(null);
    try {
      const res = await pullWorldfootballAction(fixtureId, url);
      setResult(res);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPulling(false);
    }
  }

  return (
    <section className="bg-navy-800 rounded-xl ring-1 ring-black/25 p-4">
      <h3 className="font-display text-lg mb-2">Statistika igrača — worldfootball.net</h3>
      <p className="text-slate-400 text-sm mb-3">
        Nalepi URL izveštaja sa meča (stranica koja sadrži postavu i klupu oba tima — obično se
        završava na <code className="text-slate-300">.../lineup/</code>). Ovo samo priprema tabelu
        ispod za unos — brojeve i dalje upisuješ gledajući u isti izveštaj.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.worldfootball.net/match-report/..."
          className="flex-1 min-w-[280px] bg-navy-900/60 border border-navy-600 rounded-lg px-3 py-2 text-chalk-50 text-sm"
        />
        <button
          type="button"
          onClick={handlePull}
          disabled={pulling || !url}
          className="bg-navy-700 border border-gold-400 text-gold-300 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-gold-400 hover:text-navy-950 transition-colors disabled:opacity-40"
        >
          {pulling ? "Povlačim…" : hasStats ? "Povuci ponovo" : "Povuci sa worldfootball-a"}
        </button>
      </div>

      {error && <p className="text-danger-400 text-sm">{error}</p>}

      {result && (
        <div className="bg-navy-900/50 rounded-lg p-3 text-sm flex flex-col gap-1.5">
          <p>
            <strong>
              {result.homeTeamName} {result.homeScore ?? "?"}:{result.awayScore ?? "?"} {result.awayTeamName}
            </strong>{" "}
            — {result.matchedCount} igrača iz tvoje baze prepoznato na stranici.
          </p>
          {result.unmatchedPageNames.length > 0 && (
            <p className="text-slate-400">
              Nisu uparena sa nikim iz tvoje baze: {result.unmatchedPageNames.join(", ")}
            </p>
          )}
          <ul className="text-slate-400 text-xs list-disc pl-4">
            {result.warnings.map((w: string, i: number) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
