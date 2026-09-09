"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Bench, Pitch, PitchRow } from "@/components/Pitch";
import { Jersey } from "@/components/Jersey";
import { PlayerPicker } from "@/components/PlayerPicker";
import {
  FORMATIONS,
  MAX_PLAYERS_PER_CLUB,
  POSITIONS,
  POSITION_LABELS,
  POSITION_SHORT,
  STARTING_XI_BOUNDS,
  STARTING_XI_SIZE,
  formatEUR,
  playerFullName,
  type SelectablePlayer,
} from "@/lib/fantasy-rules";

export type SquadEntry = {
  player: SelectablePlayer;
  purchasePrice: number;
  isStarting: boolean;
  squadOrder: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
};

type LineupState = { starting: boolean; captain: boolean; vice: boolean };

/**
 * "Moj tim" — jedan ekran, po uzoru na FPL.
 *
 * Ključno u ponašanju: klik na × NE menja tim. On samo otvara stanje
 * "igrač označen za prodaju", pa se bira zamena, pa transfer stoji kao
 * neupisan (pending). Više transfera može da čeka istovremeno, budžet se
 * preračunava odmah, a u bazu ide tek na potvrdu.
 *
 * Sve stanje je ključevano po ID-ju IZVORNOG igrača u tom mestu u timu — tako
 * ostaje stabilno i kad se zamena promeni ili poništi.
 */
export function MyTeam({
  gameweekId,
  gameweekNumber,
  deadlineAt,
  squad,
  allPlayers,
  budgetRemaining,
  freeTransfers,
  preSeason,
  opponentByClub,
}: {
  gameweekId: string;
  gameweekNumber: number;
  deadlineAt: string;
  squad: SquadEntry[];
  allPlayers: SelectablePlayer[];
  budgetRemaining: number;
  freeTransfers: number;
  /** Pre prvog roka su transferi neograničeni i bez penala. */
  preSeason: boolean;
  /** club_id → "OFI (A)" za ovo kolo. Prazno dok kalendar nije poznat. */
  opponentByClub: Record<string, string>;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [replacements, setReplacements] = useState<Map<string, SelectablePlayer>>(new Map());
  const [lineup, setLineup] = useState<Map<string, LineupState>>(
    () =>
      new Map(
        squad.map((e) => [
          e.player.id,
          { starting: e.isStarting, captain: e.isCaptain, vice: e.isViceCaptain },
        ])
      )
  );
  const [transferSlot, setTransferSlot] = useState<string | null>(null);
  const [swapSlot, setSwapSlot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const slots = useMemo(
    () =>
      squad.map((entry) => {
        const replacement = replacements.get(entry.player.id) ?? null;
        const state =
          lineup.get(entry.player.id) ?? {
            starting: entry.isStarting,
            captain: entry.isCaptain,
            vice: entry.isViceCaptain,
          };
        return {
          key: entry.player.id,
          entry,
          replacement,
          current: replacement ?? entry.player,
          state,
        };
      }),
    [squad, replacements, lineup]
  );

  const slotByKey = useMemo(() => new Map(slots.map((s) => [s.key, s])), [slots]);

  // --- Budžet: odmah odražava sve neupisane transfere -----------------------
  const budgetNow = useMemo(() => {
    let b = budgetRemaining;
    for (const s of slots) {
      if (!s.replacement) continue;
      b += s.entry.purchasePrice - s.replacement.price;
    }
    return Math.round(b * 10) / 10;
  }, [slots, budgetRemaining]);

  const pending = slots.filter((s) => s.replacement);
  const pointsCost = preSeason ? 0 : -4 * Math.max(0, pending.length - freeTransfers);

  const lineupDirty = squad.some((e) => {
    const st = lineup.get(e.player.id);
    if (!st) return false;
    return (
      st.starting !== e.isStarting || st.captain !== e.isCaptain || st.vice !== e.isViceCaptain
    );
  });
  const dirty = pending.length > 0 || lineupDirty;

  // --- Izbor zamene ---------------------------------------------------------
  const activeSlot = transferSlot ? slotByKey.get(transferSlot) ?? null : null;

  /**
   * Koliko se novca oslobađa kad se mesto oslobodi. budgetNow već sadrži efekat
   * trenutne zamene na tom mestu (ako je ima), pa se vraća njena cena; ako
   * zamene još nema, vraća se cena po kojoj je prodati igrač kupljen.
   */
  const refundForActive = activeSlot
    ? activeSlot.replacement
      ? activeSlot.replacement.price
      : activeSlot.entry.purchasePrice
    : 0;

  /**
   * Ovo je iznos koji korisnik zaista može da potroši na zamenu: novac u kasi
   * PLUS ono što dobija za igrača kog prodaje. Prikazuje se umesto stanja kase
   * čim se klikne ×, jer je "u kasi 1.5M" obmanjujuće kad prodaješ igrača od
   * 4.2M — stvaran limit je 5.7M.
   */
  const budgetForSwap = Math.round((budgetNow + refundForActive) * 10) / 10;

  const inSquadIds = useMemo(() => new Set(slots.map((s) => s.current.id)), [slots]);

  function clubCountExcludingSlot(clubId: string, slotKey: string): number {
    return slots.filter((s) => s.key !== slotKey && s.current.club_id === clubId).length;
  }

  function blockedReason(p: SelectablePlayer): string | null {
    if (!activeSlot) return null;
    if (inSquadIds.has(p.id)) return "Već u timu";
    if (p.position !== activeSlot.current.position) return "Druga pozicija";
    if (clubCountExcludingSlot(p.club_id, activeSlot.key) >= MAX_PLAYERS_PER_CLUB) {
      return "Već 3 iz kluba";
    }
    if (budgetForSwap - p.price < -1e-9) {
      return `Nedostaje ${formatEUR(p.price - budgetForSwap)}`;
    }
    return null;
  }

  function startTransfer(slotKey: string) {
    setSwapSlot(null);
    setError(null);
    setFlash(null);
    setTransferSlot(slotKey);
  }

  function chooseReplacement(p: SelectablePlayer) {
    if (!activeSlot) return;
    setReplacements((prev) => {
      const next = new Map(prev);
      next.set(activeSlot.key, p);
      return next;
    });
    setTransferSlot(null);
  }

  function cancelReplacement(slotKey: string) {
    setReplacements((prev) => {
      const next = new Map(prev);
      next.delete(slotKey);
      return next;
    });
    if (transferSlot === slotKey) setTransferSlot(null);
  }

  function discardAll() {
    setReplacements(new Map());
    setLineup(
      new Map(
        squad.map((e) => [
          e.player.id,
          { starting: e.isStarting, captain: e.isCaptain, vice: e.isViceCaptain },
        ])
      )
    );
    setTransferSlot(null);
    setSwapSlot(null);
    setError(null);
    setFlash("Sve neupisane izmene su poništene.");
  }

  // --- Zamena teren ↔ klupa -------------------------------------------------
  function wouldBeValidSwap(aKey: string, bKey: string): boolean {
    const a = slotByKey.get(aKey)!;
    const b = slotByKey.get(bKey)!;
    if (a.state.starting === b.state.starting) return false;

    const nextStarting = new Set(
      slots.filter((s) => s.state.starting).map((s) => s.key)
    );
    if (a.state.starting) {
      nextStarting.delete(a.key);
      nextStarting.add(b.key);
    } else {
      nextStarting.delete(b.key);
      nextStarting.add(a.key);
    }

    for (const pos of POSITIONS) {
      const count = slots.filter(
        (s) => nextStarting.has(s.key) && s.current.position === pos
      ).length;
      const [min, max] = STARTING_XI_BOUNDS[pos];
      if (count < min || count > max) return false;
    }
    return nextStarting.size === STARTING_XI_SIZE;
  }

  function handleJerseyClick(slotKey: string) {
    if (transferSlot) return; // usred biranja zamene — ne mešaj sa postavom
    if (!swapSlot) {
      setSwapSlot(slotKey);
      setFlash(null);
      return;
    }
    if (swapSlot === slotKey) {
      setSwapSlot(null);
      return;
    }
    if (!wouldBeValidSwap(swapSlot, slotKey)) {
      setSwapSlot(slotKey);
      return;
    }

    const a = slotByKey.get(swapSlot)!;
    const leaving = a.state.starting ? a.key : slotKey;
    const entering = a.state.starting ? slotKey : a.key;

    setLineup((prev) => {
      const next = new Map(prev);
      const l = { ...(next.get(leaving) ?? { starting: true, captain: false, vice: false }) };
      const e = { ...(next.get(entering) ?? { starting: false, captain: false, vice: false }) };
      l.starting = false;
      e.starting = true;
      if (l.captain) {
        l.captain = false;
        setFlash("Kapiten je otišao na klupu — izaberi novog.");
      }
      if (l.vice) {
        l.vice = false;
        setFlash("Vice-kapiten je otišao na klupu — izaberi novog.");
      }
      next.set(leaving, l);
      next.set(entering, e);
      return next;
    });
    setSwapSlot(null);
  }

  /**
   * Prebacivanje na drugu formaciju. Zadržava što više trenutnih startera —
   * prvo oni koji već igraju, pa najbolji po poenima, pa po ceni — da promena
   * 4-4-2 → 3-5-2 ne prevrne pola tima bez potrebe.
   */
  function applyFormation(def: number, mid: number, fwd: number) {
    const need: Record<string, number> = { GK: 1, DEF: def, MID: mid, FWD: fwd };
    const nextStarting = new Set<string>();

    for (const pos of POSITIONS) {
      const ranked = slots
        .filter((s) => s.current.position === pos)
        .sort(
          (a, b) =>
            Number(b.state.starting) - Number(a.state.starting) ||
            b.current.total_points - a.current.total_points ||
            b.current.price - a.current.price
        );
      if (ranked.length < need[pos]) {
        setError(
          `Nemaš dovoljno igrača za formaciju ${def}-${mid}-${fwd} (${POSITION_LABELS[pos]}: treba ${need[pos]}, imaš ${ranked.length}).`
        );
        return;
      }
      ranked.slice(0, need[pos]).forEach((s) => nextStarting.add(s.key));
    }

    // Kapiten ili vice koji ispadne iz postave dobija zamenu odmah — bolje nego
    // da korisnik ostane sa blokiranim čuvanjem i porukom da mora da bira.
    const bestStarters = slots
      .filter((s) => nextStarting.has(s.key) && s.current.position !== "GK")
      .sort(
        (a, b) =>
          b.current.total_points - a.current.total_points || b.current.price - a.current.price
      );

    const oldCaptain = slots.find((s) => s.state.captain);
    const oldVice = slots.find((s) => s.state.vice);
    let captainKey =
      oldCaptain && nextStarting.has(oldCaptain.key) ? oldCaptain.key : bestStarters[0]?.key;
    let viceKey = oldVice && nextStarting.has(oldVice.key) ? oldVice.key : undefined;
    if (!viceKey || viceKey === captainKey) {
      viceKey = bestStarters.find((s) => s.key !== captainKey)?.key;
    }

    setLineup((prev) => {
      const next = new Map(prev);
      for (const s of slots) {
        next.set(s.key, {
          starting: nextStarting.has(s.key),
          captain: s.key === captainKey,
          vice: s.key === viceKey,
        });
      }
      return next;
    });
    setSwapSlot(null);
    setError(null);
    const changedRoles =
      (oldCaptain && oldCaptain.key !== captainKey) || (oldVice && oldVice.key !== viceKey);
    setFlash(
      changedRoles
        ? `Formacija ${def}-${mid}-${fwd}. Traka je prešla na igrača koji je ostao u postavi — proveri izbor.`
        : `Formacija ${def}-${mid}-${fwd}.`
    );
  }

  function setCaptain(slotKey: string) {
    setLineup((prev) => {
      const next = new Map(prev);
      for (const [k, v] of next) {
        next.set(k, { ...v, captain: k === slotKey, vice: k === slotKey ? false : v.vice });
      }
      return next;
    });
  }

  function setVice(slotKey: string) {
    setLineup((prev) => {
      const next = new Map(prev);
      for (const [k, v] of next) {
        next.set(k, { ...v, vice: k === slotKey, captain: k === slotKey ? false : v.captain });
      }
      return next;
    });
  }

  // --- Validacija pre upisa -------------------------------------------------
  const problems = useMemo(() => {
    const out: string[] = [];
    const starters = slots.filter((s) => s.state.starting);
    if (starters.length !== STARTING_XI_SIZE) {
      out.push(`Prva postava mora imati ${STARTING_XI_SIZE} igrača (trenutno ${starters.length}).`);
    }
    for (const pos of POSITIONS) {
      const n = starters.filter((s) => s.current.position === pos).length;
      const [min, max] = STARTING_XI_BOUNDS[pos];
      if (n < min || n > max) {
        out.push(`${POSITION_LABELS[pos]} u prvih 11: ${n} (dozvoljeno ${min}–${max}).`);
      }
    }
    if (!slots.some((s) => s.state.captain && s.state.starting)) out.push("Izaberi kapitena iz prvih 11.");
    if (!slots.some((s) => s.state.vice && s.state.starting)) out.push("Izaberi vice-kapitena iz prvih 11.");
    if (budgetNow < -1e-9) out.push(`Budžet je u minusu: ${formatEUR(budgetNow)}.`);

    const perClub = new Map<string, number>();
    for (const s of slots) perClub.set(s.current.club_id, (perClub.get(s.current.club_id) ?? 0) + 1);
    for (const [club, n] of perClub) {
      if (n > MAX_PLAYERS_PER_CLUB) {
        const name = slots.find((s) => s.current.club_id === club)!.current.club_name;
        out.push(`Najviše ${MAX_PLAYERS_PER_CLUB} igrača iz istog kluba — ${name}: ${n}.`);
      }
    }
    return out;
  }, [slots, budgetNow]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setFlash(null);

    if (pending.length > 0) {
      const { data, error: trError } = await supabase.rpc("apply_transfers", {
        p_gameweek_id: gameweekId,
        p_transfers: pending.map((s) => ({
          player_out: s.entry.player.id,
          player_in: s.replacement!.id,
        })),
      });
      if (trError) {
        setError(trError.message);
        setSaving(false);
        return;
      }
      if (data && data.ok === false) {
        setError("Transferi nisu izvršeni — osveži stranicu i pokušaj ponovo.");
        setSaving(false);
        return;
      }
    }

    if (lineupDirty || pending.length > 0) {
      const starters = slots
        .filter((s) => s.state.starting)
        .sort(
          (a, b) =>
            POSITIONS.indexOf(a.current.position) - POSITIONS.indexOf(b.current.position) ||
            b.current.price - a.current.price
        );
      const benchOrder = slots
        .filter((s) => !s.state.starting)
        .sort((a, b) => {
          if (a.current.position === "GK" && b.current.position !== "GK") return 1;
          if (b.current.position === "GK" && a.current.position !== "GK") return -1;
          return b.current.price - a.current.price;
        });
      const order = new Map<string, number>();
      starters.forEach((s, i) => order.set(s.key, i + 1));
      benchOrder.forEach((s, i) => order.set(s.key, i + 1));

      const { error: lineupError } = await supabase.rpc("update_lineup", {
        p_gameweek_id: gameweekId,
        p_players: slots.map((s) => ({
          player_id: s.current.id,
          is_starting: s.state.starting,
          squad_order: order.get(s.key) ?? 1,
          is_captain: s.state.captain,
          is_vice_captain: s.state.vice,
        })),
      });
      if (lineupError) {
        setError(
          pending.length > 0
            ? `Transferi su sačuvani, ali postava nije: ${lineupError.message}`
            : lineupError.message
        );
        setSaving(false);
        router.refresh();
        return;
      }
    }

    setReplacements(new Map());
    setSaving(false);
    setFlash(
      pending.length > 0
        ? `Sačuvano — ${pending.length} ${pending.length === 1 ? "transfer" : "transfera"} izvršeno.`
        : "Postava je sačuvana."
    );
    router.refresh();
  }

  // --- Render ---------------------------------------------------------------
  const starterSlots = slots.filter((s) => s.state.starting);
  const benchSlots = slots
    .filter((s) => !s.state.starting)
    .sort((a, b) => {
      if (a.current.position === "GK" && b.current.position !== "GK") return 1;
      if (b.current.position === "GK" && a.current.position !== "GK") return -1;
      return b.current.price - a.current.price;
    });

  const rows = POSITIONS.map((pos) =>
    starterSlots.filter((s) => s.current.position === pos)
  ).filter((row) => row.length > 0);

  const formation = POSITIONS.slice(1)
    .map((pos) => starterSlots.filter((s) => s.current.position === pos).length)
    .join("-");

  const renderSlot = (s: (typeof slots)[number], onPitch: boolean) => (
    <Jersey
      key={s.key}
      color={s.current.club_color}
      name={s.current.last_name}
      detail={
        s.replacement
          ? "novi"
          : opponentByClub[s.current.club_id] ?? formatEUR(s.entry.purchasePrice)
      }
      initials={s.current.club_name.slice(0, 3).toUpperCase()}
      flag={s.current.status !== "available" ? s.current.status : null}
      isGoalkeeper={s.current.position === "GK"}
      positionLabel={onPitch ? undefined : POSITION_SHORT[s.current.position]}
      isCaptain={s.state.captain}
      isViceCaptain={s.state.vice}
      active={swapSlot === s.key || transferSlot === s.key || Boolean(s.replacement)}
      dimmed={
        transferSlot
          ? transferSlot !== s.key
          : swapSlot !== null && swapSlot !== s.key && !wouldBeValidSwap(swapSlot, s.key)
      }
      onClick={() => handleJerseyClick(s.key)}
      onRemove={s.replacement ? () => cancelReplacement(s.key) : () => startTransfer(s.key)}
      onCaptain={onPitch ? () => setCaptain(s.key) : undefined}
      onViceCaptain={onPitch ? () => setVice(s.key) : undefined}
    />
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
      <div>
        <div className="bg-navy-800 rounded-xl ring-1 ring-black/25 px-4 py-3 mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <span>
            <span className="text-slate-400">Kolo </span>
            <span className="font-display text-lg">{gameweekNumber}</span>
          </span>
          {activeSlot ? (
            <span>
              <span className="text-slate-400">Budžet za zamenu </span>
              <span className="font-display text-lg text-gold-300">
                {formatEUR(budgetForSwap)}
              </span>
              <span className="text-slate-400 text-xs ml-1.5">
                (kasa {formatEUR(budgetNow)} + {formatEUR(refundForActive)} za{" "}
                {activeSlot.current.last_name})
              </span>
            </span>
          ) : (
            <span>
              <span className="text-slate-400">U kasi </span>
              <span
                className={`font-display text-lg ${budgetNow < 0 ? "text-danger-400" : "text-gold-300"}`}
              >
                {formatEUR(budgetNow)}
              </span>
            </span>
          )}
          <span>
            <span className="text-slate-400">Slobodni transferi </span>
            <span className="font-semibold">{preSeason ? "neograničeno" : freeTransfers}</span>
          </span>
          {pending.length > 0 && (
            <span>
              <span className="text-slate-400">Cena transfera </span>
              <span className={`font-semibold ${pointsCost < 0 ? "text-danger-400" : ""}`}>
                {pointsCost} poena
              </span>
            </span>
          )}
          <label className="flex items-center gap-2 ml-auto">
            <span className="text-slate-400">Formacija</span>
            <select
              value={formation}
              onChange={(e) => {
                const f = FORMATIONS.find((x) => x.label === e.target.value);
                if (f) applyFormation(f.def, f.mid, f.fwd);
              }}
              disabled={Boolean(transferSlot)}
              className="bg-navy-900/60 border border-navy-600 rounded-lg px-2 py-1.5 text-sm text-chalk-50 focus:border-gold-400 focus:outline-none disabled:opacity-40"
            >
              {FORMATIONS.map((f) => (
                <option key={f.label} value={f.label}>
                  {f.label}
                </option>
              ))}
              {!FORMATIONS.some((f) => f.label === formation) && (
                <option value={formation}>{formation}</option>
              )}
            </select>
          </label>
          <span className="text-slate-400 w-full lg:w-auto">
            rok {new Date(deadlineAt).toLocaleString("sr-RS")}
          </span>
        </div>

        <Pitch>
          <div className="flex flex-col gap-5 sm:gap-7">
            {rows.map((row, i) => (
              <PitchRow key={i}>{row.map((s) => renderSlot(s, true))}</PitchRow>
            ))}
          </div>
        </Pitch>
        <Bench note={`Formacija ${formation}`}>
          {benchSlots.map((s) => renderSlot(s, false))}
        </Bench>

        {flash && <p className="text-gold-300 text-sm mt-3">{flash}</p>}
      </div>

      <div className="flex flex-col gap-4">
        {activeSlot ? (
          <>
            <div className="bg-navy-800 rounded-xl ring-1 ring-black/25 p-4">
              <p className="text-sm text-slate-300">
                Prodaješ <strong>{playerFullName(activeSlot.current)}</strong> za{" "}
                {formatEUR(refundForActive)}. Za zamenu možeš potrošiti do{" "}
                <strong className="text-gold-300">{formatEUR(budgetForSwap)}</strong>.
              </p>
              <button
                type="button"
                onClick={() => setTransferSlot(null)}
                className="mt-3 border border-navy-600 text-slate-300 font-semibold text-sm px-3 py-1.5 rounded-lg hover:text-chalk-50"
              >
                Odustani
              </button>
            </div>
            <PlayerPicker
              players={allPlayers}
              lockedPosition={activeSlot.current.position}
              selectedIds={inSquadIds}
              blockedReason={blockedReason}
              onPick={chooseReplacement}
            />
          </>
        ) : (
          <>
            <PendingPanel
              pending={pending.map((s) => ({
                key: s.key,
                out: s.entry.player,
                outPrice: s.entry.purchasePrice,
                in: s.replacement!,
              }))}
              onChange={startTransfer}
              onCancel={cancelReplacement}
            />
            <HelpPanel swapping={Boolean(swapSlot)} />
          </>
        )}

        <div className="bg-navy-800 rounded-xl ring-1 ring-black/25 p-4 lg:sticky lg:bottom-4">
          {problems.length > 0 && (
            <ul className="text-danger-400 text-xs bg-danger-400/10 rounded-lg px-3 py-2 mb-3 flex flex-col gap-1">
              {problems.slice(0, 4).map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          {error && <p className="text-danger-400 text-sm mb-3">{error}</p>}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || problems.length > 0 || saving}
            className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-3 rounded-lg w-full disabled:opacity-40"
          >
            {saving
              ? "Čuvam…"
              : pending.length > 0 && lineupDirty
                ? "Sačuvaj izmene"
                : pending.length > 0
                  ? `Potvrdi ${pending.length} ${pending.length === 1 ? "transfer" : "transfera"}`
                  : "Sačuvaj postavu"}
          </button>
          {dirty && (
            <button
              type="button"
              onClick={discardAll}
              className="mt-2 w-full text-slate-300 text-sm py-2 hover:text-chalk-50"
            >
              Poništi izmene
            </button>
          )}
          {dirty && (
            <p className="text-[11px] text-slate-400 mt-1 text-center">
              Izmene još nisu upisane.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PendingPanel({
  pending,
  onChange,
  onCancel,
}: {
  pending: { key: string; out: SelectablePlayer; outPrice: number; in: SelectablePlayer }[];
  onChange: (key: string) => void;
  onCancel: (key: string) => void;
}) {
  if (pending.length === 0) return null;
  return (
    <div className="bg-navy-800 rounded-xl ring-1 ring-black/25 p-4">
      <h3 className="font-display text-lg mb-3">Transferi na čekanju</h3>
      <ul className="flex flex-col gap-2">
        {pending.map((t) => (
          <li key={t.key} className="bg-navy-700/60 rounded-lg px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 line-through truncate">{t.out.last_name}</span>
              <span className="text-slate-500">→</span>
              <span className="truncate font-semibold">{t.in.last_name}</span>
              <span className="ml-auto shrink-0 text-slate-300">
                {t.outPrice >= t.in.price ? "+" : "−"}
                {formatEUR(Math.abs(t.outPrice - t.in.price))}
              </span>
            </div>
            <div className="flex gap-3 mt-1.5">
              <button
                type="button"
                onClick={() => onChange(t.key)}
                className="text-xs text-slate-300 underline underline-offset-2 hover:text-chalk-50"
              >
                promeni izbor
              </button>
              <button
                type="button"
                onClick={() => onCancel(t.key)}
                className="text-xs text-slate-300 underline underline-offset-2 hover:text-danger-400"
              >
                poništi
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HelpPanel({ swapping }: { swapping: boolean }) {
  return (
    <div className="bg-navy-800 rounded-xl ring-1 ring-black/25 p-4 text-sm">
      <h3 className="font-display text-lg mb-2">Kako se menja tim</h3>
      {swapping ? (
        <p className="text-slate-300 mb-3">
          Igrač je izabran. Klikni na igrača sa druge strane (teren ↔ klupa) da ih zameniš mestima.
          Prigušeni igrači bi pokvarili formaciju.
        </p>
      ) : (
        <p className="text-slate-300 mb-3">
          Klikni na dres, pa na drugog igrača sa suprotne strane, da zameniš postavu i klupu.
          Kapitena i vice-kapitena biraš dugmićima <strong>C</strong> i <strong>V</strong>.
        </p>
      )}
      <p className="text-slate-300">
        <strong>×</strong> u uglu dresa započinje transfer: igrač se označi za prodaju i otvara se
        lista zamena na njegovoj poziciji. Ništa nije konačno dok ne klikneš dugme za čuvanje.
      </p>
    </div>
  );
}
