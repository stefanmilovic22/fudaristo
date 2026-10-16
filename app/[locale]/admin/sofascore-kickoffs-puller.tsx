"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { LocalTime } from "@/components/LocalTime";
import { isStaleDeploymentError, STALE_DEPLOYMENT_MESSAGE } from "@/lib/stale-deployment";
import {
  previewSofascoreKickoffsAction,
  confirmSofascoreKickoffsAction,
  type KickoffPreview,
} from "./actions";

const FMT = { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" } as const;

/**
 * Usklađivanje termina mečeva sa SofaScore-om. Fajl pravi
 * scripts/sofascore-termini-konzola.js. Pregled pokazuje samo mečeve kojima se
 * termin menja; odigrani se ne diraju. Rok kola se pomera samo na zahtev.
 */
export function SofascoreKickoffsPuller() {
  const router = useRouter();
  const [jsonText, setJsonText] = useState("");
  const [preview, setPreview] = useState<KickoffPreview | null>(null);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [gwChecked, setGwChecked] = useState<Record<number, boolean>>({});
  const [working, setWorking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [done, setDone] = useState<{ fixturesUpdated: number; gameweeksUpdated: number[] } | null>(null);

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
      const result = await previewSofascoreKickoffsAction(jsonText);
      setPreview(result);
      const c: Record<number, boolean> = {};
      result.rows.forEach((r, i) => (c[i] = r.selectable));
      setChecked(c);
      const g: Record<number, boolean> = {};
      result.gameweeks.forEach((w) => (g[w.number] = true));
      setGwChecked(g);
    } catch (e) {
      fail(e);
    } finally {
      setWorking(false);
    }
  }

  const selected = preview ? preview.rows.filter((r, i) => checked[i] && r.selectable && r.fixtureId && r.sofaKickoff) : [];

  async function handleConfirm() {
    if (!preview) return;
    setConfirming(true);
    setError(null);
    setStale(false);
    try {
      const result = await confirmSofascoreKickoffsAction({
        fixtures: selected.map((r) => ({
          fixtureId: r.fixtureId!,
          kickoffAt: r.sofaKickoff!,
          reschedules: r.reschedules,
        })),
        gameweekNumbers: preview.gameweeks.filter((w) => gwChecked[w.number]).map((w) => w.number),
      });
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

  const changedRows = preview ? preview.rows.map((r, i) => ({ r, i })).filter(({ r }) => r.changed || r.note) : [];
  const unchangedCount = preview ? preview.rows.filter((r) => r.fixtureId && !r.changed && !r.note).length : 0;

  return (
    <section className="bg-navy-800 border border-navy-600 rounded-lg p-5">
      <h3 className="font-display text-lg mb-1">SofaScore termini mečeva</h3>
      <p className="text-slate-400 text-xs mb-3">
        Učitaj fajl skinut skriptom <code>scripts/sofascore-termini-konzola.js</code>. Prikazuju se samo mečevi
        kojima se vreme početka razlikuje; odigrani se ne diraju. Vremena su u tvojoj vremenskoj zoni.
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
            placeholder='Ili nalepi ovde: {"fixtures":[{"round":7,"homeTeam":...,"startTimestamp":...}]}'
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
          Izmenjeno termina: {done.fixturesUpdated}.
          {done.gameweeksUpdated.length > 0 && <> Rok pomeren za kola: {done.gameweeksUpdated.join(", ")}.</>}
        </p>
      )}

      {preview && (
        <div className="mt-1 flex flex-col gap-3">
          <p className="text-slate-400 text-xs">
            {preview.rows.length} mečeva u fajlu · {preview.rows.filter((r) => r.selectable).length} sa izmenjenim
            terminom · {unchangedCount} već usklađeno.
          </p>

          {changedRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-1.5 pr-2 w-6" />
                    <th className="pb-1.5 pr-2">Meč</th>
                    <th className="pb-1.5 px-2">Sada</th>
                    <th className="pb-1.5 px-2">SofaScore</th>
                    <th className="pb-1.5 pl-2" />
                  </tr>
                </thead>
                <tbody>
                  {changedRows.map(({ r, i }) => (
                    <tr key={i} className="border-t border-navy-700/60">
                      <td className="py-1 pr-2">
                        <input
                          type="checkbox"
                          disabled={!r.selectable}
                          checked={Boolean(checked[i]) && r.selectable}
                          onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))}
                          aria-label="Primeni"
                        />
                      </td>
                      <td className="py-1 pr-2 whitespace-nowrap">{r.label}</td>
                      <td className="py-1 px-2 text-slate-400 whitespace-nowrap">
                        {r.ourKickoff ? <LocalTime iso={r.ourKickoff} options={FMT} /> : "—"}
                      </td>
                      <td className="py-1 px-2 text-gold-300 font-semibold whitespace-nowrap">
                        {r.sofaKickoff ? <LocalTime iso={r.sofaKickoff} options={FMT} /> : "—"}
                      </td>
                      <td className="py-1 pl-2 text-slate-400">
                        {r.note ?? (r.reschedules ? "vraća odloženi meč u zakazane" : "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.gameweeks.length > 0 && (
            <div className="border border-navy-700 rounded-lg p-3 bg-navy-900/60">
              <p className="text-xs font-semibold mb-1.5">Rok za predaju sastava (opciono)</p>
              {preview.warnings.map((w, i) => (
                <p key={i} className="text-danger-400 text-xs mb-1.5">
                  {w}
                </p>
              ))}
              {preview.gameweeks.map((w) => (
                <label key={w.number} className="flex items-center gap-2 text-xs py-0.5">
                  <input
                    type="checkbox"
                    checked={Boolean(gwChecked[w.number])}
                    onChange={(e) => setGwChecked((g) => ({ ...g, [w.number]: e.target.checked }))}
                  />
                  <span>
                    Kolo {w.number}: rok{" "}
                    <span className="text-slate-400">
                      <LocalTime iso={w.current.deadline} options={FMT} />
                    </span>{" "}
                    →{" "}
                    <span className="text-gold-300 font-semibold">
                      <LocalTime iso={w.proposed.deadline} options={FMT} />
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="flex gap-2 items-center mt-1">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming || selected.length === 0}
              className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2 rounded-lg hover:bg-gold-300 transition-colors disabled:opacity-40"
            >
              {confirming ? "Upisujem…" : `Primeni izabrano (${selected.length})`}
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
