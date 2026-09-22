"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { isStaleDeploymentError, STALE_DEPLOYMENT_MESSAGE } from "@/lib/stale-deployment";
import {
  pullWorldfootballAction,
  previewWorldfootballAction,
  previewPastedAction,
  previewEspnAction,
  applyWorldfootballStatsAction,
  type PullResult,
  type PreviewResult,
} from "../../actions";

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
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [stale, setStale] = useState(false);
  const [pasted, setPasted] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [espnInput, setEspnInput] = useState("");
  const [showEspn, setShowEspn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview() {
    setPulling(true);
    setError(null);
    setPreview(null);
    setResult(null);
    try {
      setPreview(await previewWorldfootballAction(fixtureId, url));
    } catch (err) {
      setError(isStaleDeploymentError(err) ? STALE_DEPLOYMENT_MESSAGE : (err as Error).message);
      setStale(isStaleDeploymentError(err));
    } finally {
      setPulling(false);
    }
  }

  async function handlePastePreview() {
    setPulling(true);
    setError(null);
    setPreview(null);
    try {
      setPreview(await previewPastedAction(fixtureId, pasted));
    } catch (err) {
      setError(isStaleDeploymentError(err) ? STALE_DEPLOYMENT_MESSAGE : (err as Error).message);
      setStale(isStaleDeploymentError(err));
    } finally {
      setPulling(false);
    }
  }

  async function handleEspnPreview() {
    setPulling(true);
    setError(null);
    setPreview(null);
    try {
      setPreview(await previewEspnAction(fixtureId, espnInput));
    } catch (err) {
      setError(isStaleDeploymentError(err) ? STALE_DEPLOYMENT_MESSAGE : (err as Error).message);
      setStale(isStaleDeploymentError(err));
    } finally {
      setPulling(false);
    }
  }

  async function handleApply() {
    if (!preview) return;
    setApplying(true);
    setError(null);
    try {
      await applyWorldfootballStatsAction(fixtureId, preview.rows);
      setPreview(null);
      router.refresh();
    } catch (err) {
      setError(isStaleDeploymentError(err) ? STALE_DEPLOYMENT_MESSAGE : (err as Error).message);
      setStale(isStaleDeploymentError(err));
    } finally {
      setApplying(false);
    }
  }

  async function handlePull() {
    setPulling(true);
    setError(null);
    setResult(null);
    try {
      const res = await pullWorldfootballAction(fixtureId, url);
      setResult(res);
      router.refresh();
    } catch (err) {
      setError(isStaleDeploymentError(err) ? STALE_DEPLOYMENT_MESSAGE : (err as Error).message);
      setStale(isStaleDeploymentError(err));
    } finally {
      setPulling(false);
    }
  }

  return (
    <section
      className={`rounded-xl p-4 ${
        // Dok statistike nema, ovo je JEDINA stvar koju admin treba da uradi na
        // ovoj stranici — pa se i vidi kao takva. Ranije je izgledala isto kao
        // sekcija sa rezultatom iznad, pa se polje za URL prosto previđalo.
        hasStats
          ? "bg-navy-800 ring-1 ring-black/25"
          : "bg-navy-800 ring-2 ring-gold-400/60"
      }`}
    >
      {!hasStats && (
        <p className="text-gold-300 font-semibold text-sm mb-2">
          Ovaj meč još nema statistiku igrača. Počni odavde.
        </p>
      )}
      <h3 className="font-display text-lg mb-2">Statistika igrača — worldfootball.net</h3>
      <p className="text-slate-400 text-sm mb-3">
        Nalepi URL izveštaja sa meča (stranica koja sadrži postavu i klupu oba tima — obično se
        završava na <code className="text-slate-300">.../lineup/</code>). Ovo samo priprema tabelu
        ispod za unos — brojeve i dalje upisuješ gledajući u isti izveštaj.
      </p>
      <label className="block text-sm text-slate-300 mb-1.5" htmlFor="wf-url">
        URL izveštaja
      </label>
      <div className="flex flex-wrap gap-2 mb-3">
        <input
          id="wf-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.worldfootball.net/match-report/..."
          className="flex-1 min-w-[240px] bg-navy-900 border border-navy-600 rounded-lg px-3 py-2.5 text-chalk-50 text-sm focus:border-gold-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={handlePull}
          disabled={pulling || !url}
          className="bg-navy-700 border border-gold-400 text-gold-300 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-gold-400 hover:text-navy-950 transition-colors disabled:opacity-40"
        >
          {pulling ? "Povlačim…" : hasStats ? "Povuci ponovo" : "Povuci sa worldfootball-a"}
        </button>
        <button
          type="button"
          onClick={handlePreview}
          disabled={pulling || applying || !url}
          className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2 rounded-lg hover:bg-gold-300 transition-colors disabled:opacity-40"
        >
          {pulling ? "Čitam izveštaj…" : "Popuni automatski"}
        </button>
      </div>

      {error && (
        <div className="text-danger-400 text-sm">
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

      {/* Nalepljivanje zaobilazi blokadu u potpunosti: stranicu dohvata tvoj
          pregledač, ne naš server. Worldfootball odbija zahteve iz data centra
          (403), a Vercel jeste data centar. */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowPaste((v) => !v)}
          className="text-slate-300 text-sm font-semibold hover:text-chalk-50"
        >
          {showPaste ? "− " : "+ "}
          Nalepi stranicu ručno (kad server dobije 403)
        </button>

        {showPaste && (
          <div className="mt-2">
            <p className="text-slate-400 text-xs mb-2 leading-relaxed">
              Otvori izveštaj u pregledaču, <strong>Ctrl+A</strong> pa <strong>Ctrl+C</strong>, i
              nalepi ovde. <strong>Ne treba nikakvo sređivanje teksta</strong> — parser očekuje
              tačno onaj oblik koji stiže iz pregledača. Bitno je samo da si kopirao i postave sa
              rezervama, ne samo rezultat.
            </p>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={6}
              placeholder="Nalepi ovde sadržaj stranice sa worldfootball-a…"
              className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-chalk-50 text-xs font-mono focus:border-gold-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={handlePastePreview}
              disabled={pulling || applying || pasted.trim().length < 50}
              className="mt-2 bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2 rounded-lg hover:bg-gold-300 transition-colors disabled:opacity-40"
            >
              {pulling ? "Čitam…" : "Pročitaj nalepljeno"}
            </button>
          </div>
        )}
      </div>

      {/* Alternativa worldfootball-u: ESPN-ov nezvaničan JSON API. Za razliku
          od worldfootball-a, ovde ne parsiramo tekst — ESPN vraća strukturirane
          podatke po igraču (golovi, asistencije, kartoni...) i tačan minut za
          svaku izmenu/gol, pa nema rizika od pogrešnog razdvajanja postava.
          NEDOKUMENTOVAN endpoint — može prestati da radi bez najave, zato je
          ovo dodatna opcija, ne zamena za worldfootball tok iznad. */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowEspn((v) => !v)}
          className="text-slate-300 text-sm font-semibold hover:text-chalk-50"
        >
          {showEspn ? "− " : "+ "}
          Popuni sa ESPN-a (alternativa, ako worldfootball ne radi)
        </button>

        {showEspn && (
          <div className="mt-2">
            <p className="text-slate-400 text-xs mb-2 leading-relaxed">
              Nađi meč na{" "}
              <code className="text-slate-300">espn.com/soccer/match/_/gameId/...</code> (liga:
              Grčka Super League) i nalepi ovde ceo link ili samo broj (gameId / event ID).
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={espnInput}
                onChange={(e) => setEspnInput(e.target.value)}
                placeholder="https://www.espn.com/soccer/match/_/gameId/... ili sam broj"
                className="flex-1 min-w-[240px] bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-chalk-50 text-xs font-mono focus:border-gold-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleEspnPreview}
                disabled={pulling || applying || espnInput.trim().length === 0}
                className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2 rounded-lg hover:bg-gold-300 transition-colors disabled:opacity-40"
              >
                {pulling ? "Čitam…" : "Pročitaj sa ESPN-a"}
              </button>
            </div>
          </div>
        )}
      </div>

      {preview && (
        <div className="mt-4 border-t border-navy-700 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <h4 className="font-display">
              Pregled — {preview.homeScore}:{preview.awayScore} · uparen{" "}
              {preview.matchedCount} igrač(a) sa stranice
            </h4>
            <span className="text-xs text-slate-500">Ništa još nije upisano.</span>
          </div>

          {preview.warnings.length > 0 && (
            <ul className="text-slate-400 text-xs mb-3 flex flex-col gap-0.5 list-disc list-inside">
              {preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-navy-800">
                <tr className="text-slate-400 text-left">
                  <th className="py-1 pr-2">Igrač</th>
                  <th className="py-1 px-1">Min</th>
                  <th className="py-1 px-1">G</th>
                  <th className="py-1 px-1">A</th>
                  <th className="py-1 px-1">Prim.</th>
                  <th className="py-1 px-1">ŽK</th>
                  <th className="py-1 px-1">CK</th>
                  <th className="py-1 px-1">AG</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr
                    key={r.playerId}
                    className={`border-t border-navy-700 ${r.filled ? "" : "text-slate-500"}`}
                  >
                    <td className="py-1 pr-2 truncate max-w-[160px]">
                      {r.playerName}
                      <span className="text-slate-500"> · {r.clubName}</span>
                    </td>
                    <td className="py-1 px-1 tabular-nums">{r.minutes_played}</td>
                    <td className="py-1 px-1 tabular-nums">{r.goals || ""}</td>
                    <td className="py-1 px-1 tabular-nums">{r.assists || ""}</td>
                    <td className="py-1 px-1 tabular-nums">{r.goals_conceded || ""}</td>
                    <td className="py-1 px-1 tabular-nums">{r.yellow_cards || ""}</td>
                    <td className="py-1 px-1 tabular-nums">{r.red_cards || ""}</td>
                    <td className="py-1 px-1 tabular-nums">{r.own_goals || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.unmatchedPageNames.length > 0 && (
            <p className="text-danger-400 text-xs mt-2">
              Sa stranice nije upareno: {preview.unmatchedPageNames.join(", ")} — ti igrači nisu u
              našoj bazi ili im se prezime razlikuje.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button
              type="button"
              onClick={handleApply}
              disabled={applying}
              className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2 rounded-lg hover:bg-gold-300 transition-colors disabled:opacity-40"
            >
              {applying ? "Upisujem…" : "Primeni u tabelu ispod"}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-slate-400 text-sm font-semibold px-3 py-2 hover:text-chalk-50"
            >
              Odustani
            </button>
            <span className="text-slate-500 text-xs">
              Posle primene i dalje moraš da klikneš „Sačuvaj i potvrdi" u tabeli ispod.
            </span>
          </div>
        </div>
      )}

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
