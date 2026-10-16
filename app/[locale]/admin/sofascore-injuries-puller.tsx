"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { LocalTime } from "@/components/LocalTime";
import { useInjuryReason } from "@/lib/use-injury-reason";
import { isStaleDeploymentError, STALE_DEPLOYMENT_MESSAGE } from "@/lib/stale-deployment";
import {
  previewSofascoreInjuriesAction,
  confirmSofascoreInjuriesAction,
  type InjuriesPreview,
} from "./actions";

type Status = "available" | "injured" | "suspended" | "doubtful" | "unavailable";

const STATUS_LABEL: Record<Status, string> = {
  available: "dostupan",
  injured: "povređen",
  suspended: "suspendovan",
  doubtful: "neizvestan",
  unavailable: "nedostupan",
};

const WHEN = { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" } as const;
const DAY = { day: "numeric", month: "numeric" } as const;

/**
 * Jednom nedeljno, pred kolo: učitaš fajl iz scripts/sofascore-povrede-konzola.js,
 * pregledaš šta se menja (ko postaje povređen/suspendovan/neizvestan, ko se
 * vraća) i potvrdiš. Vreme potvrde se prikazuje u Statistikama.
 */
export function SofascoreInjuriesPuller() {
  const router = useRouter();
  const reason = useInjuryReason();
  const [jsonText, setJsonText] = useState("");
  const [preview, setPreview] = useState<InjuriesPreview | null>(null);
  const [players, setPlayers] = useState<Record<number, string>>({});
  const [statuses, setStatuses] = useState<Record<number, Status>>({});
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
      const result = await previewSofascoreInjuriesAction(jsonText);
      setPreview(result);
      const p: Record<number, string> = {};
      const s: Record<number, Status> = {};
      const c: Record<number, boolean> = {};
      result.rows.forEach((r, i) => {
        p[i] = r.playerId ?? "";
        s[i] = r.proposedStatus;
        // Tačno ime = štiklirano; samo-prezime ili bez uparivanja = admin potvrđuje.
        c[i] = r.exact && Boolean(r.playerId);
      });
      setPlayers(p);
      setStatuses(s);
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
        .map(({ r, i }) => ({
          playerId: players[i],
          status: statuses[i],
          note: r.note,
          until: r.until,
        }));
      const result = await confirmSofascoreInjuriesAction({ round: preview.round, entries });
      setDone(result.updated);
      setPreview(null);
      setJsonText("");
      router.refresh();
    } catch (e) {
      fail(e);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <section className="bg-navy-800 border border-navy-600 rounded-lg p-5">
      <h3 className="font-display text-lg mb-1">SofaScore povrede i suspenzije</h3>
      <p className="text-slate-400 text-xs mb-3">
        Jednom nedeljno, pred kolo. Učitaj fajl skinut skriptom <code>scripts/sofascore-povrede-konzola.js</code>.
        Igrači koji su bili označeni, a više nisu na spisku njihovog kluba, vraćaju se na „dostupan”. Potvrda
        beleži vreme ažuriranja koje se vidi u Statistikama.
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
            placeholder='Ili nalepi ovde: {"round":7,"teams":[{"team":"AEK Athens","missing":[...]}]}'
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

      {done !== null && <p className="text-gold-300 text-sm mt-2">Gotovo — izmenjeno igrača: {done}. Vreme ažuriranja je upisano.</p>}

      {preview && (
        <div className="mt-1 flex flex-col gap-3">
          <p className="text-slate-400 text-xs">
            {preview.round !== null && <>Pred kolo {preview.round}. </>}
            {preview.fetchedAt && (
              <>
                Skinuto: <LocalTime iso={preview.fetchedAt} options={WHEN} />.{" "}
              </>
            )}
            {preview.rows.length === 0 ? "Nema izmena — spisak se poklapa sa našim." : `${preview.rows.length} izmena.`}
          </p>
          {preview.warnings.map((w, i) => (
            <p key={i} className="text-danger-400 text-xs">
              {w}
            </p>
          ))}

          {preview.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-1.5 pr-2 w-6" />
                    <th className="pb-1.5 pr-2">Klub</th>
                    <th className="pb-1.5 px-1">SofaScore ime</th>
                    <th className="pb-1.5 px-1">Naš igrač</th>
                    <th className="pb-1.5 px-1">Sada → novo</th>
                    <th className="pb-1.5 pl-1">Razlog / do</th>
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
                        <td className="py-1 px-1 whitespace-nowrap">
                          {r.sofaName ?? <span className="text-slate-500">(nema ga na spisku)</span>}
                        </td>
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
                          {players[i] && !r.exact && r.sofaName && <span className="ml-1.5 text-gold-300">proveri ime</span>}
                        </td>
                        <td className="py-1 px-1 whitespace-nowrap">
                          <span className="text-slate-500">{STATUS_LABEL[r.currentStatus as Status] ?? r.currentStatus}</span>{" "}
                          →{" "}
                          <select
                            value={statuses[i] ?? r.proposedStatus}
                            onChange={(e) => setStatuses((s) => ({ ...s, [i]: e.target.value as Status }))}
                            className="bg-navy-900 border border-navy-600 rounded px-1.5 py-1 text-xs text-gold-300 font-semibold"
                          >
                            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1 pl-1 text-slate-400">
                          {reason(r.note)}
                          {r.until && (
                            <>
                              {r.note ? " · " : ""}do <LocalTime iso={r.until} options={DAY} />
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-2 items-center mt-1">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming}
              className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2 rounded-lg hover:bg-gold-300 transition-colors disabled:opacity-40"
            >
              {confirming ? "Upisujem…" : selectedCount > 0 ? `Primeni izabrano (${selectedCount})` : "Potvrdi spisak (bez izmena)"}
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
