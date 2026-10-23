"use client";

import { useState, useTransition } from "react";
import {
  applyPriceChangesAction,
  previewPriceChangesAction,
  previewRatingPriceChangesAction,
  priceTargetGameweekAction,
  searchPlayersForPriceAction,
  type PriceRow,
} from "./actions";
import {
  DEFAULT_MIN_MATCHES,
  DEFAULT_MIN_MINUTES,
  DEFAULT_RATING_T1,
  DEFAULT_RATING_T2,
  DEFAULT_STEP,
  DEFAULT_THRESHOLD,
} from "@/lib/price-rules";
import { ClubBadge } from "@/components/ClubBadge";

type EditRow = PriceRow & { checked: boolean; input: string };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("sr-RS", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

type Mode = "rating" | "transfers";

/**
 * Admin: rekalkulacija cena na klik. Dva načina: po oceni (SofaScore, mečevi
 * ≥ min. minuta, ±0.1/0.2) ili po neto transferima. „Izračunaj predlog“ daje
 * pregled sa izmenljivim cenama i tek „Primeni“ upisuje — ništa se ne menja bez
 * potvrde. Isti obrazac kao ostali uvozi.
 */
export function PriceChangesPanel() {
  const [mode, setMode] = useState<Mode>("rating");
  const [minMinutes, setMinMinutes] = useState(String(DEFAULT_MIN_MINUTES));
  const [t1, setT1] = useState(String(DEFAULT_RATING_T1));
  const [t2, setT2] = useState(String(DEFAULT_RATING_T2));
  const [minMatches, setMinMatches] = useState(String(DEFAULT_MIN_MATCHES));
  const [baselineMode, setBaselineMode] = useState<"prev" | "avg">("prev");
  const [threshold, setThreshold] = useState(String(DEFAULT_THRESHOLD));
  const [step, setStep] = useState(String(DEFAULT_STEP));
  const [rows, setRows] = useState<EditRow[] | null>(null);
  const [meta, setMeta] = useState<{ since: string | null; gameweekId: string; gameweekNumber: number; counted: number } | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<PriceRow[]>([]);
  const [pending, startTransition] = useTransition();

  const toEdit = (r: PriceRow): EditRow => ({ ...r, checked: true, input: r.newPrice.toFixed(1) });

  function calculate() {
    setMessage(null);
    startTransition(async () => {
      const res =
        mode === "rating"
          ? await previewRatingPriceChangesAction(
              Number(minMinutes),
              Number(t1.replace(",", ".")),
              Number(t2.replace(",", ".")),
              Number(minMatches),
              baselineMode
            )
          : await previewPriceChangesAction(Number(threshold), Number(step));
      if (!res.ok) {
        setMessage({ kind: "err", text: res.error });
        return;
      }
      setRows(res.rows.map(toEdit));
      setMeta({ since: res.since, gameweekId: res.gameweekId, gameweekNumber: res.gameweekNumber, counted: res.transfersCounted });
      if (res.rows.length === 0) {
        setMessage({
          kind: "ok",
          text:
            mode === "rating"
              ? `Nijedan igrač ne prelazi prag ocene (igrača u obračunu: ${res.transfersCounted}). Možeš da dodaš igrača ručno.`
              : `Nijedan igrač ne prelazi prag (obrađeno transfera: ${res.transfersCounted}). Možeš da dodaš igrača ručno.`,
        });
      }
    });
  }

  function runSearch(v: string) {
    setSearch(v);
    if (v.trim().length < 2) {
      setFound([]);
      return;
    }
    startTransition(async () => setFound(await searchPlayersForPriceAction(v)));
  }

  function addManual(p: PriceRow) {
    setRows((cur) => {
      const list = cur ?? [];
      return list.some((r) => r.playerId === p.playerId) ? list : [...list, toEdit(p)];
    });
    if (!meta) setMeta({ since: null, gameweekId: "", gameweekNumber: 0, counted: 0 });
    setSearch("");
    setFound([]);
  }

  const parsed = (r: EditRow) => Math.round(Number(r.input.replace(",", ".")) * 10) / 10;
  const valid = (r: EditRow) => Number.isFinite(parsed(r)) && parsed(r) >= 1 && parsed(r) <= 20;
  const selected = (rows ?? []).filter((r) => r.checked && valid(r) && parsed(r) !== r.price);
  const invalid = (rows ?? []).some((r) => r.checked && !valid(r));
  const rated = mode === "rating";

  function apply() {
    if (!rows || selected.length === 0) return;
    if (!window.confirm(`Primeniti ${selected.length} promena cena? Ovo odmah menja cene za sve igrače.`)) return;
    setMessage(null);
    startTransition(async () => {
      let gameweekId = meta?.gameweekId ?? "";
      if (!gameweekId) {
        // Ručni unos bez predloga: kolo se određuje na serveru.
        const gw = await priceTargetGameweekAction();
        if (!gw.ok) {
          setMessage({ kind: "err", text: gw.error });
          return;
        }
        gameweekId = gw.gameweekId;
      }
      const res = await applyPriceChangesAction(
        gameweekId,
        selected.map((r) => ({ playerId: r.playerId, newPrice: parsed(r), net: r.net }))
      );
      if (res.ok) {
        setMessage({ kind: "ok", text: `Primenjeno promena: ${res.applied}. Javna stranica „Promene cena“ je osvežena.` });
        setRows(null);
        setMeta(null);
      } else {
        setMessage({ kind: "err", text: res.error });
      }
    });
  }

  const input =
    "bg-navy-900 border border-navy-600 rounded-lg px-2.5 py-1.5 text-chalk-50 text-sm focus:outline-none focus:border-gold-400";

  return (
    <section className="bg-navy-800 border border-navy-600 rounded-lg p-5">
      <h3 className="font-display text-lg mb-1">Cene igrača</h3>
      <div className="inline-flex rounded-lg border border-navy-600 overflow-hidden mb-3 text-sm">
        {(["rating", "transfers"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setRows(null);
              setMeta(null);
              setMessage(null);
            }}
            className={`px-3.5 py-1.5 font-semibold transition-colors ${mode === m ? "bg-gold-400 text-navy-950" : "bg-navy-900 text-slate-300 hover:bg-navy-700"}`}
          >
            {m === "rating" ? "Po oceni" : "Po transferima"}
          </button>
        ))}
      </div>

      <p className="text-slate-400 text-sm mb-4">
        {mode === "rating"
          ? "Računa se automatski iz SofaScore ocena mečeva odigranih od poslednje izmene cena"
          : "Predlog se računa iz neto transfera (ulasci − izlasci) od poslednje izmene cena"}
        {meta?.since ? ` (${fmtDate(meta.since)})` : ""}. Igrač koji je već u timu ostaje po kupovnoj ceni, pa promena
        utiče samo na nove kupovine.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        {mode === "rating" ? (
          <>
            <label className="text-xs text-slate-400">
              Min. minuta
              <input value={minMinutes} onChange={(e) => setMinMinutes(e.target.value)} inputMode="numeric" className={`${input} block w-24 mt-1`} />
            </label>
            <label className="text-xs text-slate-400">
              Pomak za ±0.1
              <input value={t1} onChange={(e) => setT1(e.target.value)} inputMode="decimal" className={`${input} block w-24 mt-1`} />
            </label>
            <label className="text-xs text-slate-400">
              Pomak za ±0.2
              <input value={t2} onChange={(e) => setT2(e.target.value)} inputMode="decimal" className={`${input} block w-24 mt-1`} />
            </label>
            <label className="text-xs text-slate-400">
              Poredi sa
              <select
                value={baselineMode}
                onChange={(e) => setBaselineMode(e.target.value as "prev" | "avg")}
                className={`${input} block mt-1`}
              >
                <option value="prev">Prethodnim kolom</option>
                <option value="avg">Prosekom ranijih mečeva</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Min. mečeva
              <input value={minMatches} onChange={(e) => setMinMatches(e.target.value)} inputMode="numeric" className={`${input} block w-24 mt-1`} />
            </label>
          </>
        ) : (
          <>
            <label className="text-xs text-slate-400">
              Prag neto transfera
              <input value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="numeric" className={`${input} block w-24 mt-1`} />
            </label>
            <label className="text-xs text-slate-400">
              Korak (M)
              <input value={step} onChange={(e) => setStep(e.target.value)} inputMode="decimal" className={`${input} block w-24 mt-1`} />
            </label>
          </>
        )}
        <button
          type="button"
          onClick={calculate}
          disabled={pending}
          className="bg-navy-700 border border-gold-400 text-gold-300 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-gold-400 hover:text-navy-950 transition-colors disabled:opacity-40"
        >
          {pending ? "Radim…" : "Izračunaj predlog"}
        </button>
        <p className="text-xs text-slate-500 basis-full sm:basis-auto sm:ml-2 max-w-md">
          {mode === "rating"
            ? "Ocena iz mečeva odigranih od poslednje izmene cena (≥ min. minuta) poredi se sa ocenom iz prethodnog kola u kom je igrač igrao (npr. 8. naspram 7.) ili sa prosekom do 8 ranijih mečeva; ako nema ranijih mečeva, poredi se sa prosekom lige. Pomak ≥ prvog praga = ±0.1, ≥ drugog = ±0.2 (najviše). Opseg 4.0–15.0."
            : "Igrač sa neto ≥ +prag dobija +korak, sa neto ≤ −prag dobija −korak. Predlog ne izlazi iz opsega 4.0–15.0."}
        </p>
      </div>

      {message && (
        <p className={`text-sm rounded-lg px-3 py-2 mb-3 border ${message.kind === "ok" ? "text-pitch-400 border-pitch-400/40 bg-pitch-500/10" : "text-danger-400 border-danger-400/40 bg-danger-400/10"}`}>
          {message.text}
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto -mx-1 px-1 mb-3">
          <table className="w-full text-sm border-collapse min-w-[620px]">
            <thead>
              <tr className="text-slate-400 text-xs uppercase tracking-wide">
                <th className="w-8" />
                <th className="text-left font-semibold py-2 pr-2">Igrač</th>
                <th className="text-right font-semibold py-2 px-2">Cena</th>
                {rated ? (
                  <>
                    <th className="text-right font-semibold py-2 px-2">Mečeva</th>
                    <th className="text-right font-semibold py-2 px-2">Ocena</th>
                    <th className="text-right font-semibold py-2 px-2">Osnova</th>
                    <th className="text-right font-semibold py-2 px-2">Pomak</th>
                  </>
                ) : (
                  <>
                    <th className="text-right font-semibold py-2 px-2">U</th>
                    <th className="text-right font-semibold py-2 px-2">Iz</th>
                    <th className="text-right font-semibold py-2 px-2">Neto</th>
                  </>
                )}
                <th className="text-right font-semibold py-2 pl-2">Nova cena</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.playerId} className={`border-t border-navy-700 ${r.checked ? "" : "opacity-45"}`}>
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={r.checked}
                      onChange={(e) => setRows((cur) => cur!.map((x) => (x.playerId === r.playerId ? { ...x, checked: e.target.checked } : x)))}
                      className="accent-[#5AB4FF] w-4 h-4"
                      aria-label={r.name}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <span className="inline-flex items-center gap-2">
                      <ClubBadge short={r.clubShort} color={r.clubColor} size={22} />
                      {r.name}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">{r.price.toFixed(1)}</td>
                  {rated ? (
                    <>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-400">{r.rating?.matches ?? "—"}</td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {r.rating ? r.rating.recentAvg.toFixed(2) : "—"}
                        {r.rating && <span className="block text-[10px] text-slate-500">{r.rating.recentGw}. kolo</span>}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-400">
                        {r.rating ? r.rating.baseline.toFixed(2) : "—"}
                        {r.rating && (
                          <span className="block text-[10px] text-slate-500">
                            {r.rating.baselineGw === "liga" ? "prosek lige" : `${r.rating.baselineGw}. kolo`}
                          </span>
                        )}
                      </td>
                      <td className={`py-2 px-2 text-right tabular-nums font-semibold ${!r.rating ? "text-slate-400" : r.rating.ratingDelta > 0 ? "text-pitch-400" : "text-danger-400"}`}>
                        {r.rating ? `${r.rating.ratingDelta > 0 ? "+" : ""}${r.rating.ratingDelta.toFixed(2)}` : "—"}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-400">{r.ins}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-400">{r.outs}</td>
                      <td className={`py-2 px-2 text-right tabular-nums font-semibold ${r.net > 0 ? "text-pitch-400" : r.net < 0 ? "text-danger-400" : "text-slate-400"}`}>
                        {r.net > 0 ? "+" : ""}
                        {r.net}
                      </td>
                    </>
                  )}
                  <td className="py-2 pl-2 text-right">
                    <input
                      value={r.input}
                      onChange={(e) => setRows((cur) => cur!.map((x) => (x.playerId === r.playerId ? { ...x, input: e.target.value } : x)))}
                      inputMode="decimal"
                      className={`${input} w-20 text-right font-bold ${r.checked && !valid(r) ? "border-danger-400" : ""}`}
                      aria-label={`Nova cena — ${r.name}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <input
            value={search}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="+ Dodaj igrača ručno (pretraga)…"
            className={`${input} w-full`}
          />
          {found.length > 0 && (
            <ul className="absolute z-10 left-0 right-0 mt-1 bg-navy-900 border border-navy-600 rounded-lg overflow-hidden shadow-xl">
              {found.map((p) => (
                <li key={p.playerId}>
                  <button
                    type="button"
                    onClick={() => addManual(p)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-navy-700"
                  >
                    <ClubBadge short={p.clubShort} color={p.clubColor} size={20} />
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-slate-400 tabular-nums">{p.price.toFixed(1)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={apply}
          disabled={pending || selected.length === 0 || invalid}
          className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2 rounded-lg hover:bg-gold-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Primeni {selected.length > 0 ? `${selected.length} promena` : ""}
        </button>
      </div>
      {invalid && <p className="text-xs text-danger-400 mt-2">Cena mora biti broj između 1.0 i 20.0.</p>}
    </section>
  );
}
