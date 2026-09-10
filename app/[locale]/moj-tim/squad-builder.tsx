"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Bench, Pitch, PitchRow } from "@/components/Pitch";
import { EmptySlot, Jersey } from "@/components/Jersey";
import { PlayerPicker } from "@/components/PlayerPicker";
import {
  MAX_PLAYERS_PER_CLUB,
  POSITIONS,
  FORMATIONS,
  POSITION_LABELS,
  POSITION_SHORT,
  SQUAD_COMPOSITION,
  SQUAD_SIZE,
  STARTING_XI_BOUNDS,
  STARTING_XI_SIZE,
  autoPickSquad,
  buildSquadOrder,
  formatEUR,
  playerFullName,
  validateFullSquad,
  validateStartingXI,
  type Position,
  type SelectablePlayer,
} from "@/lib/fantasy-rules";

type Step = "squad" | "lineup";

export function SquadBuilder({
  gameweekId,
  players,
  budgetAvailable,
}: {
  gameweekId: string;
  players: SelectablePlayer[];
  /** Raspoloživ novac iz users.budget_remaining — 100M za prvi tim ikad. */
  budgetAvailable: number;
}) {
  const t = useTranslations("builder");
  const tTeam = useTranslations("team");
  const tCommon = useTranslations("common");
  const tPos = useTranslations("positions");
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("squad");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [startingIds, setStartingIds] = useState<Set<string>>(new Set());
  const [captainId, setCaptainId] = useState<string | null>(null);
  const [viceCaptainId, setViceCaptainId] = useState<string | null>(null);
  const [pendingPosition, setPendingPosition] = useState<Position | null>(null);
  const [swapId, setSwapId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const playersById = useMemo(() => {
    const map = new Map<string, SelectablePlayer>();
    for (const p of players) map.set(p.id, p);
    return map;
  }, [players]);

  const selected = useMemo(
    () => [...selectedIds].map((id) => playersById.get(id)!).filter(Boolean),
    [selectedIds, playersById]
  );

  const spent = selected.reduce((sum, p) => sum + p.price, 0);
  const remaining = budgetAvailable - spent;
  const isComplete = selected.length === SQUAD_SIZE;

  const countByPosition = (pos: Position) => selected.filter((p) => p.position === pos).length;
  const countByClub = (clubId: string) => selected.filter((p) => p.club_id === clubId).length;

  // --- "Da li ću moći da popunim ostatak tima" ------------------------------
  // Bez ove provere je lako potrošiti budžet na 12 igrača i zaglaviti se sa tri
  // prazna mesta. Svaki kandidat se meri protiv NAJJEFTINIJE moguće popune svih
  // preostalih mesta (prefiksne sume po poziciji, pa je provera O(1) po igraču).
  const affordability = useMemo(() => {
    const prefix = new Map<Position, number[]>();
    const rank = new Map<string, number>();

    for (const pos of POSITIONS) {
      const avail = players
        .filter((p) => p.position === pos && !selectedIds.has(p.id))
        .sort((a, b) => a.price - b.price);
      avail.forEach((p, i) => rank.set(p.id, i));
      const sums = [0];
      for (const p of avail) sums.push(sums[sums.length - 1] + p.price);
      prefix.set(pos, sums);
    }

    const chosen: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const id of selectedIds) {
      const p = playersById.get(id);
      if (p) chosen[p.position]++;
    }
    const need: Record<Position, number> = {
      GK: SQUAD_COMPOSITION.GK - chosen.GK,
      DEF: SQUAD_COMPOSITION.DEF - chosen.DEF,
      MID: SQUAD_COMPOSITION.MID - chosen.MID,
      FWD: SQUAD_COMPOSITION.FWD - chosen.FWD,
    };

    const cheapest = (pos: Position, n: number) => {
      if (n <= 0) return 0;
      const sums = prefix.get(pos)!;
      return n < sums.length ? sums[n] : Number.POSITIVE_INFINITY;
    };

    const minCostAfterAdding = (c: SelectablePlayer): number => {
      let total = 0;
      for (const pos of POSITIONS) {
        if (pos !== c.position) {
          total += cheapest(pos, need[pos]);
          continue;
        }
        const n = need[pos] - 1;
        const idx = rank.get(c.id) ?? Number.POSITIVE_INFINITY;
        // Ako je kandidat među n najjeftinijih, njegovo mesto zauzima sledeći.
        total += idx < n ? cheapest(pos, n + 1) - c.price : cheapest(pos, n);
      }
      return total;
    };

    return { minCostAfterAdding };
  }, [players, selectedIds, playersById]);

  function blockedReason(p: SelectablePlayer): string | null {
    if (countByPosition(p.position) >= SQUAD_COMPOSITION[p.position]) {
      return `${POSITION_LABELS[p.position]} popunjen`;
    }
    if (countByClub(p.club_id) >= MAX_PLAYERS_PER_CLUB) return tCommon("maxFromClub");
    if (p.price > remaining + 1e-9) return "Preskup";
    if (spent + p.price + affordability.minCostAfterAdding(p) > budgetAvailable + 1e-9) {
      return "Ne bi ostalo za ostatak tima";
    }
    return null;
  }

  // --- Akcije nad sastavom --------------------------------------------------
  function addPlayer(p: SelectablePlayer) {
    setSelectedIds((prev) => new Set(prev).add(p.id));
    setSaveError(null);
    setNotice(null);
    if (
      pendingPosition &&
      countByPosition(pendingPosition) + 1 >= SQUAD_COMPOSITION[pendingPosition]
    ) {
      setPendingPosition(null);
    }
  }

  function removePlayer(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setStartingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (captainId === id) setCaptainId(null);
    if (viceCaptainId === id) setViceCaptainId(null);
    if (swapId === id) setSwapId(null);
    setSaveError(null);
    setNotice(null);
  }

  function resetSquad() {
    setSelectedIds(new Set());
    setStartingIds(new Set());
    setCaptainId(null);
    setViceCaptainId(null);
    setPendingPosition(null);
    setSwapId(null);
    setSaveError(null);
    setStep("squad");
    setNotice(t("cleared"));
  }

  function handleAutoPick() {
    const result = autoPickSquad(players, budgetAvailable);
    if (!result) {
      setSaveError(
        t("autoFailed")
      );
      return;
    }
    setSaveError(null);
    setNotice(null);
    setSelectedIds(new Set(result.squad.map((p) => p.id)));
    setStartingIds(result.startingIds);
    setCaptainId(result.captainId);
    setViceCaptainId(result.viceCaptainId);
    setPendingPosition(null);
    setSwapId(null);
    setStep("lineup");
  }

  // Kad se sastav upotpuni, predloži postavu — korisnik je odatle menja.
  useEffect(() => {
    if (!isComplete || startingIds.size > 0) return;
    const proposal = autoPickSquad(selected, budgetAvailable);
    if (!proposal) return;
    setStartingIds(proposal.startingIds);
    setCaptainId(proposal.captainId);
    setViceCaptainId(proposal.viceCaptainId);
  }, [isComplete, startingIds.size, selected, budgetAvailable]);

  // --- Zamena teren ↔ klupa -------------------------------------------------
  function wouldBeValidSwap(a: SelectablePlayer, b: SelectablePlayer): boolean {
    const aStarts = startingIds.has(a.id);
    const bStarts = startingIds.has(b.id);
    if (aStarts === bStarts) return false;

    const next = new Set(startingIds);
    if (aStarts) {
      next.delete(a.id);
      next.add(b.id);
    } else {
      next.delete(b.id);
      next.add(a.id);
    }

    for (const pos of POSITIONS) {
      const count = selected.filter((p) => next.has(p.id) && p.position === pos).length;
      const [min, max] = STARTING_XI_BOUNDS[pos];
      if (count < min || count > max) return false;
    }
    return next.size === STARTING_XI_SIZE;
  }

  function handleLineupClick(p: SelectablePlayer) {
    if (!swapId) {
      setSwapId(p.id);
      setNotice(null);
      return;
    }
    if (swapId === p.id) {
      setSwapId(null);
      return;
    }
    const a = playersById.get(swapId)!;
    if (!wouldBeValidSwap(a, p)) {
      setSwapId(p.id);
      return;
    }

    const leaving = startingIds.has(a.id) ? a : p;
    const entering = startingIds.has(a.id) ? p : a;

    setStartingIds((prev) => {
      const next = new Set(prev);
      next.delete(leaving.id);
      next.add(entering.id);
      return next;
    });
    if (captainId === leaving.id) {
      setCaptainId(null);
      setNotice(tTeam("captainToBench"));
    }
    if (viceCaptainId === leaving.id) {
      setViceCaptainId(null);
      setNotice(tTeam("viceToBench"));
    }
    setSwapId(null);
  }

  const fullSquadErrors = validateFullSquad(selected, budgetAvailable);
  const xiErrors = isComplete
    ? validateStartingXI(selected, startingIds, captainId, viceCaptainId)
    : [];
  const allErrors = [...fullSquadErrors, ...xiErrors];
  const canSave = allErrors.length === 0 && !saving;

  async function handleSave() {
    setSaving(true);
    setSaveError(null);

    const orderById = buildSquadOrder(selected, startingIds);

    // Ceo upis (15 redova u squads + skidanje budžeta) ide kroz jednu Postgres
    // funkciju — atomično, i sa serverskom proverom roka, budžeta, sastava i
    // max-3-po-klubu. Klijentska validacija iznad je samo za brz fidbek.
    const { data, error } = await supabase.rpc("save_squad", {
      p_gameweek_id: gameweekId,
      p_players: selected.map((p) => ({
        player_id: p.id,
        is_starting: startingIds.has(p.id),
        squad_order: orderById.get(p.id) ?? 1,
        is_captain: p.id === captainId,
        is_vice_captain: p.id === viceCaptainId,
      })),
    });

    if (error) {
      setSaveError(error.message);
      setSaving(false);
      return;
    }
    if (data && data.ok === false) {
      setSaveError(t("notSaved"));
      setSaving(false);
      return;
    }

    // Ovde NEMA pune navigacije: SquadBuilder se već prikazuje na /moj-tim,
    // pa je push na istu putanju bio bez efekta. Refresh je taj koji ponovo
    // učita stranicu sa servera i pokaže sačuvan tim.
    router.refresh();
  }

  /**
   * Primena formacije jednim izborom. Ranije se ovde postava mogla menjati
   * SAMO klikom na dva igrača redom — a dugme "Popuni automatski" ostavlja
   * neku svoju postavu, pa je jedini način da se dobije 3-5-2 bio sačuvati
   * tim pa ga menjati na /moj-tim, gde dropdown postoji. Sad je isti izbor i
   * ovde.
   */
  function applyFormation(def: number, mid: number, fwd: number) {
    const need: Record<Position, number> = { GK: 1, DEF: def, MID: mid, FWD: fwd };
    const next = new Set<string>();

    for (const pos of POSITIONS) {
      const ranked = selected
        .filter((p) => p.position === pos)
        .sort(
          (a, b) =>
            Number(startingIds.has(b.id)) - Number(startingIds.has(a.id)) ||
            b.total_points - a.total_points ||
            b.price - a.price
        );
      if (ranked.length < need[pos]) {
        setNotice(
          tTeam("notEnoughFor", {
            formation: `${def}-${mid}-${fwd}`,
            position: tPos(pos),
            need: need[pos],
            have: ranked.length,
          })
        );
        return;
      }
      ranked.slice(0, need[pos]).forEach((p) => next.add(p.id));
    }

    setSwapId(null);
    setStartingIds(next);
    setNotice(null);
  }

  const swapPlayer = swapId ? playersById.get(swapId) ?? null : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
      <div>
        <StatusBar
          selectedCount={selected.length}
          remaining={remaining}
          budgetAvailable={budgetAvailable}
        />

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex gap-1 bg-navy-800 p-1 rounded-lg">
            <StepTab active={step === "squad"} onClick={() => setStep("squad")}>
              Sastav {selected.length}/{SQUAD_SIZE}
            </StepTab>
            <StepTab
              active={step === "lineup"}
              disabled={!isComplete}
              onClick={() => setStep("lineup")}
            >
              Postava i kapiten
            </StepTab>
          </div>

          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={handleAutoPick}
              className="bg-navy-800 border border-gold-400 text-gold-300 font-semibold text-sm px-3 py-2 rounded-lg hover:bg-gold-400 hover:text-navy-950 transition-colors"
            >
              Popuni automatski
            </button>
            <button
              type="button"
              onClick={resetSquad}
              disabled={selected.length === 0}
              className="border border-navy-600 text-slate-300 font-semibold text-sm px-3 py-2 rounded-lg hover:border-danger-400 hover:text-danger-400 transition-colors disabled:opacity-40"
            >
              Isprazni tim
            </button>
          </div>
        </div>

        {step === "squad" ? (
          <SquadStep
            selected={selected}
            pendingPosition={pendingPosition}
            onSlotClick={setPendingPosition}
            onRemove={removePlayer}
          />
        ) : (
          <LineupStep
            selected={selected}
            startingIds={startingIds}
            onFormation={applyFormation}
            captainId={captainId}
            viceCaptainId={viceCaptainId}
            swapPlayer={swapPlayer}
            canSwapWith={(p) => (swapPlayer ? wouldBeValidSwap(swapPlayer, p) : true)}
            onPlayerClick={handleLineupClick}
            onCaptain={(id) => {
              if (viceCaptainId === id) setViceCaptainId(null);
              setCaptainId(id);
            }}
            onVice={(id) => {
              if (captainId === id) setCaptainId(null);
              setViceCaptainId(id);
            }}
          />
        )}

        {notice && <p className="text-slate-300 text-sm mt-3">{notice}</p>}
      </div>

      {/* Desna kolona se lepi za vrh, a NE dno.
          Ranije je panel sa greškama i dugmetom bio `lg:sticky lg:bottom-4`
          unutar kolone — pri dnu prozora bi legao PREKO liste igrača i
          poklopio je. Sad cela kolona stoji, lista igrača skroluje unutar
          svoje kutije, a panel je ispod nje u normalnom toku: uvek vidljiv,
          nikad ne preklapa. */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {step === "squad" ? (
            <PlayerPicker
              players={players}
              lockedPosition={pendingPosition}
              selectedIds={selectedIds}
              blockedReason={blockedReason}
              onPick={addPlayer}
              onClearLock={() => setPendingPosition(null)}
            />
          ) : (
            <SwapHelp swapPlayer={swapPlayer} />
          )}
        </div>

        <div className="shrink-0 bg-navy-800 rounded-xl ring-1 ring-black/25 p-4">
          {allErrors.length > 0 && (
            <details className="mb-3 group">
              {/* Sažeto po pravilu: kad je tim prazan grešaka je pet i panel
                  naraste preko pola ekrana. Broj je dovoljan da se zna da nešto
                  fali; spisak je jedan klik daleko. */}
              <summary className="text-danger-400 text-xs bg-danger-400/10 rounded-lg px-3 py-2 cursor-pointer list-none flex items-center justify-between gap-2">
                <span>
                  {allErrors.length === 1
                    ? t("oneThingMissing")
                    : t("thingsMissing", { count: allErrors.length })}
                </span>
                <span className="text-[10px] opacity-70 group-open:hidden">{t("show")}</span>
                <span className="text-[10px] opacity-70 hidden group-open:inline">sakrij</span>
              </summary>
              <ul className="text-danger-400 text-xs mt-2 px-3 flex flex-col gap-1 list-disc list-inside">
                {allErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </details>
          )}
          {saveError && <p className="text-danger-400 text-sm mb-3">{saveError}</p>}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-3 rounded-lg w-full disabled:opacity-40"
          >
            {saving ? t("savingSquad") : t("saveSquad")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------

function StatusBar({
  selectedCount,
  remaining,
  budgetAvailable,
}: {
  selectedCount: number;
  remaining: number;
  budgetAvailable: number;
}) {
  const t = useTranslations("builder");
  const used = budgetAvailable - remaining;
  const pct = budgetAvailable > 0 ? Math.min(100, Math.max(0, (used / budgetAvailable) * 100)) : 0;

  return (
    <div className="bg-navy-800 rounded-xl ring-1 ring-black/25 px-4 py-3 mb-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="text-slate-400">{t("playersLabel")} </span>
          <span className="font-display text-lg">
            {selectedCount}/{SQUAD_SIZE}
          </span>
        </span>
        <span>
          <span className="text-slate-400">Preostalo </span>
          <span
            className={`font-display text-lg ${remaining < 0 ? "text-danger-400" : "text-gold-300"}`}
          >
            {formatEUR(remaining)}
          </span>
        </span>
        <span className="text-slate-400">od {formatEUR(budgetAvailable)}</span>
      </div>
      <div className="mt-2 h-1 rounded-full bg-navy-950 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            remaining < 0 ? "bg-danger-400" : "bg-gold-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StepTab({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-sm font-semibold px-3 py-2 rounded-md transition-colors disabled:opacity-40 ${
        active ? "bg-gold-400 text-navy-950" : "text-slate-300 hover:text-chalk-50"
      }`}
    >
      {children}
    </button>
  );
}

function SquadStep({
  selected,
  pendingPosition,
  onSlotClick,
  onRemove,
}: {
  selected: SelectablePlayer[];
  pendingPosition: Position | null;
  onSlotClick: (pos: Position) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Pitch>
      <div className="flex flex-col gap-5 sm:gap-7">
        {POSITIONS.map((pos) => {
          const inRow = selected
            .filter((p) => p.position === pos)
            .sort((a, b) => b.price - a.price);
          const empties = SQUAD_COMPOSITION[pos] - inRow.length;

          return (
            <PitchRow key={pos}>
              {inRow.map((p) => (
                <Jersey
                  key={p.id}
                  color={p.club_color}
                  name={p.last_name}
                  detail={formatEUR(p.price)}
                  initials={p.club_name.slice(0, 3).toUpperCase()}
                  flag={p.status !== "available" ? p.status : null}
                  isGoalkeeper={p.position === "GK"}
                  onRemove={() => onRemove(p.id)}
                />
              ))}
              {Array.from({ length: empties }).map((_, i) => (
                <EmptySlot
                  key={`${pos}-${i}`}
                  label={POSITION_LABELS[pos]}
                  highlighted={pendingPosition === pos}
                  onAdd={() => onSlotClick(pos)}
                />
              ))}
            </PitchRow>
          );
        })}
      </div>
    </Pitch>
  );
}

function LineupStep({
  selected,
  startingIds,
  onFormation,
  captainId,
  viceCaptainId,
  swapPlayer,
  canSwapWith,
  onPlayerClick,
  onCaptain,
  onVice,
}: {
  selected: SelectablePlayer[];
  startingIds: Set<string>;
  onFormation: (def: number, mid: number, fwd: number) => void;
  captainId: string | null;
  viceCaptainId: string | null;
  swapPlayer: SelectablePlayer | null;
  canSwapWith: (p: SelectablePlayer) => boolean;
  onPlayerClick: (p: SelectablePlayer) => void;
  onCaptain: (id: string) => void;
  onVice: (id: string) => void;
}) {
  const t = useTranslations("builder");
  const tPitch = useTranslations("pitch");
  const starters = selected.filter((p) => startingIds.has(p.id));
  const bench = selected
    .filter((p) => !startingIds.has(p.id))
    .sort((a, b) => {
      if (a.position === "GK" && b.position !== "GK") return 1;
      if (b.position === "GK" && a.position !== "GK") return -1;
      return b.price - a.price;
    });

  const render = (p: SelectablePlayer, onPitch: boolean) => (
    <Jersey
      key={p.id}
      color={p.club_color}
      name={p.last_name}
      detail={formatEUR(p.price)}
      initials={p.club_name.slice(0, 3).toUpperCase()}
      flag={p.status !== "available" ? p.status : null}
      isGoalkeeper={p.position === "GK"}
      positionLabel={onPitch ? undefined : POSITION_SHORT[p.position]}
      isCaptain={p.id === captainId}
      isViceCaptain={p.id === viceCaptainId}
      active={swapPlayer?.id === p.id}
      dimmed={swapPlayer !== null && swapPlayer.id !== p.id && !canSwapWith(p)}
      onClick={() => onPlayerClick(p)}
      onCaptain={onPitch ? () => onCaptain(p.id) : undefined}
      onViceCaptain={onPitch ? () => onVice(p.id) : undefined}
    />
  );

  // Golman gore, napadači dole — isti raspored kao na FPL terenu.
  const rows = POSITIONS
    .map((pos) => starters.filter((p) => p.position === pos))
    .filter((row) => row.length > 0);

  const formationLabel = POSITIONS.slice(1)
    .map((pos) => starters.filter((p) => p.position === pos).length)
    .join("-");

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="text-sm text-slate-300" htmlFor="formacija">
          {t("formation")}
        </label>
        <select
          id="formacija"
          value={formationLabel}
          onChange={(e) => {
            const f = FORMATIONS.find((x) => x.label === e.target.value);
            if (f) onFormation(f.def, f.mid, f.fwd);
          }}
          disabled={swapPlayer !== null}
          className="bg-navy-900 border border-navy-600 rounded-lg px-2 py-1.5 text-sm text-chalk-50 focus:border-gold-400 focus:outline-none disabled:opacity-40"
        >
          {/* Trenutna formacija ne mora biti u spisku (npr. posle ručne
              zamene), pa se dodaje da <select> ne skoči na tuđu vrednost. */}
          {!FORMATIONS.some((f) => f.label === formationLabel) && (
            <option value={formationLabel}>{formationLabel}</option>
          )}
          {FORMATIONS.map((f) => (
            <option key={f.label} value={f.label}>
              {f.label}
            </option>
          ))}
        </select>
        {swapPlayer !== null && (
          <span className="text-xs text-slate-500">{t("finishSwapFirst")}</span>
        )}
      </div>

      <Pitch>
        <div className="flex flex-col gap-5 sm:gap-7">
          {rows.map((row, i) => (
            <PitchRow key={i}>{row.map((p) => render(p, true))}</PitchRow>
          ))}
        </div>
      </Pitch>
      <Bench note={tPitch("formation", { label: formationLabel })}>{bench.map((p) => render(p, false))}</Bench>
    </>
  );
}

function SwapHelp({ swapPlayer }: { swapPlayer: SelectablePlayer | null }) {
  const t = useTranslations("builder");
  return (
    <div className="bg-navy-800 rounded-xl ring-1 ring-black/25 p-4 text-sm">
      <h3 className="font-display text-lg mb-2">{t("lineupTitle")}</h3>
      {swapPlayer ? (
        <p className="text-slate-300">
          {t.rich("swapHelpActive", {
            name: playerFullName(swapPlayer),
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      ) : (
        <p className="text-slate-300">{t("swapHelpIdleFull")}</p>
      )}
      <p className="text-slate-400 text-[13px] mt-3">{t("captainHintFull")}</p>
    </div>
  );
}
