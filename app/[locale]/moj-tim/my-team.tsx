"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Bench, Pitch, PitchRow } from "@/components/Pitch";
import { Jersey } from "@/components/Jersey";
import { PlayerPicker } from "@/components/PlayerPicker";
import { PlayerInfoPopover, type UpcomingFixture } from "@/components/PlayerInfoPopover";
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
  playerShirtName,
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
  // Default na prazan objekat: ako pozivalac (stranica) zaboravi da prosledi
  // ovaj prop (npr. stara verzija page.tsx pored nove my-team.tsx), komponenta
  // i dalje radi — samo bez naredna-3-meča u prozorčiću — umesto da puca na
  // `upcomingByClub[clubId]` nad undefined objektom.
  upcomingByClub = {},
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
  /** club_id → naredna do 3 zakazana meča, za prozorčić sa info o igraču. */
  upcomingByClub: Record<string, UpcomingFixture[]>;
}) {
  const t = useTranslations("team");
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const tPos = useTranslations("positions");
  const tPitch = useTranslations("pitch");
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
    if (inSquadIds.has(p.id)) return tCommon("alreadyInSquad");
    if (p.position !== activeSlot.current.position) return "Druga pozicija";
    if (clubCountExcludingSlot(p.club_id, activeSlot.key) >= MAX_PLAYERS_PER_CLUB) {
      return tCommon("maxFromClub");
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
    setFlash(t("allUndone"));
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
        setFlash(t("captainToBench"));
      }
      if (l.vice) {
        l.vice = false;
        setFlash(t("viceToBench"));
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
          t("notEnoughFor", {
            formation: `${def}-${mid}-${fwd}`,
            position: tPos(pos),
            need: need[pos],
            have: ranked.length,
          })
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
        ? t("formationApplied", { formation: `${def}-${mid}-${fwd}` })
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
      out.push(t("xiSize", { size: STARTING_XI_SIZE, count: starters.length }));
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
    if (budgetNow < -1e-9) out.push(t("budgetNegative", { amount: formatEUR(budgetNow) }));

    const perClub = new Map<string, number>();
    for (const s of slots) perClub.set(s.current.club_id, (perClub.get(s.current.club_id) ?? 0) + 1);
    for (const [club, n] of perClub) {
      if (n > MAX_PLAYERS_PER_CLUB) {
        const name = slots.find((s) => s.current.club_id === club)!.current.club_name;
        out.push(t("maxPerClub", { max: MAX_PLAYERS_PER_CLUB, club: name, count: n }));
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
        setError(t("transfersFailed"));
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
            ? t("transfersSavedLineupNot", { message: lineupError.message })
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
        ? t("savedTransfers", { count: pending.length })
        : t("savedLineup")
    );
    router.refresh();
  }

  // --- Render ---------------------------------------------------------------
  const starterSlots = slots.filter((s) => s.state.starting);
  // Golman se prikazuje odvojeno od klupe: njegov redosled nije prioritet
  // ulaska, jer ga može zameniti samo drugi golman.
  const benchSlots = slots
    .filter((s) => !s.state.starting)
    .sort((a, b) => {
      if (a.current.position === "GK" && b.current.position !== "GK") return 1;
      if (b.current.position === "GK" && a.current.position !== "GK") return -1;
      return b.current.price - a.current.price;
    });

  const benchGk = benchSlots.find((s) => s.current.position === "GK") ?? null;
  const benchOutfield = benchSlots.filter((s) => s.current.position !== "GK");

  const rows = POSITIONS.map((pos) =>
    starterSlots.filter((s) => s.current.position === pos)
  ).filter((row) => row.length > 0);

  const formation = POSITIONS.slice(1)
    .map((pos) => starterSlots.filter((s) => s.current.position === pos).length)
    .join("-");

  const renderSlot = (s: (typeof slots)[number], onPitch: boolean) => (
    <JerseySlot
      key={s.key}
      showPopover={swapSlot === s.key}
      player={s.current}
      fixtures={upcomingByClub[s.current.club_id] ?? []}
      onClosePopover={() => setSwapSlot(null)}
    >
      <Jersey
        color={s.current.club_color}
        photoUrl={s.current.club_jersey_photo_url}
        name={playerShirtName(s.current)}
        detail={
          // Isto kao za sve ostale igrače, i za novododatog (zamenu) — protivnik
          // za ovo kolo, ne tekst "novi". Ranije se "novi" prikazivalo dok
          // transfer čeka potvrdu, pa se ispod novog igrača nije videlo protiv
          // koga igra.
          opponentByClub[s.current.club_id] ??
          formatEUR(s.replacement ? s.replacement.price : s.entry.purchasePrice)
        }
        initials={s.current.club_short}
        flag={s.current.status !== "available" ? s.current.status : null}
        isGoalkeeper={s.current.position === "GK"}
        positionLabel={
          onPitch
            ? undefined
            : s.current.position === "GK"
              ? POSITION_SHORT.GK
              : `${benchOutfield.findIndex((b) => b.key === s.key) + 1} · ${POSITION_SHORT[s.current.position]}`
        }
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
    </JerseySlot>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 sm:gap-5">
      <div>
        <div className="bg-navy-800 rounded-xl ring-1 ring-black/25 px-3 sm:px-4 py-3 mb-3 sm:mb-4 flex flex-wrap items-baseline gap-x-4 sm:gap-x-6 gap-y-1 text-[13px] sm:text-sm">
          <span>
            <span className="text-slate-400">{t("gameweek")} </span>
            <span className="font-display text-lg">{gameweekNumber}</span>
          </span>
          {activeSlot ? (
            <span>
              <span className="text-slate-400">{t("swapBudget")} </span>
              <span className="font-display text-lg text-gold-300">
                {formatEUR(budgetForSwap)}
              </span>
              <span className="text-slate-400 text-xs ml-1.5">
                (kasa {formatEUR(budgetNow)} + {formatEUR(refundForActive)} za{" "}
                {playerShirtName(activeSlot.current)})
              </span>
            </span>
          ) : (
            <span>
              <span className="text-slate-400">{t("wallet")} </span>
              <span
                className={`font-display text-lg ${budgetNow < 0 ? "text-danger-400" : "text-gold-300"}`}
              >
                {formatEUR(budgetNow)}
              </span>
            </span>
          )}
          <span>
            <span className="text-slate-400">{t("freeTransfers")} </span>
            <span className="font-semibold">{preSeason ? t("unlimited") : freeTransfers}</span>
          </span>
          {pending.length > 0 && (
            <span>
              <span className="text-slate-400">{t("transferCost")} </span>
              <span className={`font-semibold ${pointsCost < 0 ? "text-danger-400" : ""}`}>
                {pointsCost} {t("pointsSuffix")}
              </span>
            </span>
          )}
          <label className="flex items-center gap-2 ml-auto">
            <span className="text-slate-400">{tPitch("formationLabel")}</span>
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
          <span className="text-slate-400 w-full lg:w-auto text-xs sm:text-[13px]">
            {tCommon("deadline")} {new Date(deadlineAt).toLocaleString(locale)}
          </span>
        </div>

        <Pitch>
          <div className="flex flex-col gap-2 xs:gap-3 sm:gap-4">
            {rows.map((row, i) => (
              <PitchRow key={i}>{row.map((s) => renderSlot(s, true))}</PitchRow>
            ))}
          </div>
        </Pitch>
        <Bench
          note={tPitch("formation", { label: formation })}
          goalkeeper={benchGk ? renderSlot(benchGk, false) : undefined}
        >
          {benchOutfield.map((s) => renderSlot(s, false))}
        </Bench>

        {flash && <p className="text-gold-300 text-sm mt-3">{flash}</p>}
      </div>

      <div className="flex flex-col gap-4">
        {activeSlot ? (
          <>
            <div className="bg-navy-800 rounded-xl ring-1 ring-black/25 p-4">
              <p className="text-sm text-slate-300">
                {t.rich("selling", {
                  name: playerFullName(activeSlot.current),
                  price: formatEUR(refundForActive),
                  budget: formatEUR(budgetForSwap),
                  b: (chunks) => <strong className="text-gold-300">{chunks}</strong>,
                })}
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

{/* Na telefonu se lepi za DNO ekrana: desna kolona je ispod terena, pa je
              dugme za čuvanje inače bilo daleko van vidokruga — posle svake
              izmene trebalo je skrolovati kroz ceo teren i listu igrača.
              Na širokom ekranu kolona ionako stoji, pa se vraća u normalan tok. */}
          <div className="sticky bottom-0 z-20 -mx-3 px-3 pb-3 pt-2 bg-navy-950/95 backdrop-blur border-t border-navy-700 lg:static lg:mx-0 lg:px-0 lg:pb-0 lg:pt-0 lg:bg-transparent lg:backdrop-blur-none lg:border-0">
          <div className="bg-navy-800 rounded-xl ring-1 ring-black/25 p-3 sm:p-4">
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
              ? tCommon("saving")
              : pending.length > 0 && lineupDirty
                ? t("saveChanges")
                : pending.length > 0
                  ? t("confirmTransfers", { count: pending.length })
                  : t("saveLineup")}
          </button>
          {dirty && (
            <button
              type="button"
              onClick={discardAll}
              className="mt-2 w-full text-slate-300 text-sm py-2 hover:text-chalk-50"
            >
              {t("undoChanges")}
            </button>
          )}
          {dirty && (
            <p className="text-[11px] text-slate-400 mt-1 text-center">
              {t("notSavedYet")}
            </p>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Nosilac reference za dres — treba je PlayerInfoPopover-u da izračuna gde da
 * se pozicionira (portal u document.body, videti komentar u tom fajlu za
 * zašto obično `absolute` unutar dresa ne radi ovde: Pitch i Bench seku
 * sadržaj na ivicama pa bi golman i klupa odsecali prozorčić).
 */
function JerseySlot({
  children,
  showPopover,
  player,
  fixtures,
  onClosePopover,
}: {
  children: React.ReactNode;
  showPopover: boolean;
  player: SelectablePlayer;
  fixtures: UpcomingFixture[];
  onClosePopover: () => void;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={anchorRef} className="relative">
      {children}
      {showPopover && (
        <PlayerInfoPopover
          anchorRef={anchorRef}
          player={player}
          fixtures={fixtures}
          onClose={onClosePopover}
        />
      )}
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
  const t = useTranslations("team");
  const locale = useLocale();
  const tCommon = useTranslations("common");
  if (pending.length === 0) return null;
  return (
    <div className="bg-navy-800 rounded-xl ring-1 ring-black/25 p-4">
      <h3 className="font-display text-lg mb-3">{t("pendingTransfers")}</h3>
      <ul className="flex flex-col gap-2">
        {pending.map((row) => (
          <li key={row.key} className="bg-navy-700/60 rounded-lg px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 line-through truncate">{playerShirtName(row.out)}</span>
              <span className="text-slate-500">→</span>
              <span className="truncate font-semibold">{playerShirtName(row.in)}</span>
              <span className="ml-auto shrink-0 text-slate-300">
                {row.outPrice >= row.in.price ? "+" : "−"}
                {formatEUR(Math.abs(row.outPrice - row.in.price))}
              </span>
            </div>
            <div className="flex gap-3 mt-1.5">
              <button
                type="button"
                onClick={() => onChange(row.key)}
                className="text-xs text-slate-300 underline underline-offset-2 hover:text-chalk-50"
              >
                {t("changePick")}
              </button>
              <button
                type="button"
                onClick={() => onCancel(row.key)}
                className="text-xs text-slate-300 underline underline-offset-2 hover:text-danger-400"
              >
                {tCommon("undo")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Sažeto u <details> — ovo je pomoć za PRVI put, ne nešto što svaki povratni
 * korisnik treba da gleda na svakom ekranu. Bez ovoga je desna kolona duža
 * od samog terena, pa "Moj klub" nikad ne bi mogao da stane u jedan ekran
 * (videti razgovor: cilj je bio uklopiti stranicu, po uzoru na FPL).
 */
function HelpPanel({ swapping }: { swapping: boolean }) {
  const t = useTranslations("team");
  return (
    <details className="bg-navy-800 rounded-xl ring-1 ring-black/25 p-4 text-sm group">
      <summary className="font-display text-base cursor-pointer select-none list-none flex items-center justify-between">
        {t("howToChange")}
        <span className="text-slate-400 text-xs group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="mt-2">
        {swapping ? (
          <p className="text-slate-300 mb-3">{t("swapHelpActive")}</p>
        ) : (
          <p className="text-slate-300 mb-3">{t("swapHelpIdle")}</p>
        )}
        <p className="text-slate-300">{t("transferHelp")}</p>
      </div>
    </details>
  );
}
