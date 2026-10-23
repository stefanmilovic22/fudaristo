"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FdrChip } from "@/components/FdrChip";
import { markPlannerSeen } from "@/lib/planner-seen";
import { JerseyIcon } from "@/components/JerseyIcon";
import { LocalTime } from "@/components/LocalTime";
import { PlayerPicker } from "@/components/PlayerPicker";
import {
  MAX_PLAYERS_PER_CLUB,
  POSITIONS,
  formatEUR,
  playerFullName,
  type Position,
  type SelectablePlayer,
} from "@/lib/fantasy-rules";
import {
  EXTRA_TRANSFER_COST,
  FREE_TRANSFERS_MAX,
  simulatePlan,
  type Plan,
  type SquadMember,
} from "@/lib/planner";

/** Po kolu planiranja, po klubu: protivnici sa težinom. */
export type PlannerFixtures = Record<string, { label: string; difficulty?: number }[]>[];

const STORAGE_PREFIX = "fudaristo-planner-v1";

export function Planner({
  userId,
  planKey,
  gameweeks,
  squad,
  budget,
  freeNow,
  players,
  fixtures,
  preSeason = false,
}: {
  userId: string;
  /** Menja se kad se promeni ciljno kolo — stari plan tada više ne važi. */
  planKey: string;
  gameweeks: { number: number; deadlineAt: string }[];
  squad: SquadMember[];
  budget: number;
  freeNow: number;
  players: SelectablePlayer[];
  fixtures: PlannerFixtures;
  /** Još nije prošao prvi rok: prvo kolo je bez penala i bez troška slobodnih transfera. */
  preSeason?: boolean;
}) {
  const t = useTranslations("planner");
  const tPos = useTranslations("positions");
  const tTeam = useTranslations("team");
  const tCommon = useTranslations("common");
  const tPlayers = useTranslations("players");

  const gwCount = gameweeks.length;
  const [tab, setTab] = useState(0);
  const [plan, setPlanState] = useState<Plan>(() => gameweeks.map(() => []));
  const [loaded, setLoaded] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  // Igrač iz sastava koji više nije na listi aktivnih ostaje vidljiv.
  const allById = useMemo(() => {
    const m = new Map(playerById);
    for (const s of squad) if (!m.has(s.player.id)) m.set(s.player.id, s.player);
    return m;
  }, [playerById, squad]);

  const storageKey = `${STORAGE_PREFIX}:${userId}:${planKey}`;

  const simulate = (p: Plan) =>
    simulatePlan({ squad, budget, freeNow, plan: p, players: allById, gwCount, preSeason });

  // Kad korisnik otvori planer, „NOVO" oznake po sajtu nestaju.
  useEffect(() => {
    markPlannerSeen();
  }, []);

  // Učitavanje sačuvanog plana (samo u pregledaču).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Plan;
        if (Array.isArray(parsed)) {
          const padded = gameweeks.map((_, i) => (Array.isArray(parsed[i]) ? parsed[i] : []));
          setPlanState(simulate(padded).plan);
        }
      }
    } catch {
      // oštećen ili nedostupan zapis — kreće se od praznog plana
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Svaka izmena prolazi kroz simulaciju: nevažeći transferi (npr. prodaja
  // igrača čija je kupovina poništena) se sami uklanjaju.
  function setPlan(next: Plan) {
    const normalized = simulate(next).plan;
    setPlanState(normalized);
    try {
      localStorage.setItem(storageKey, JSON.stringify(normalized));
    } catch {
      // bez trajnog čuvanja plan važi do zatvaranja stranice
    }
  }

  const result = useMemo(() => simulate(plan), [plan, squad, budget, freeNow, allById, gwCount, preSeason]); // eslint-disable-line react-hooks/exhaustive-deps
  const gw = result.gws[tab];

  const totalCost = result.gws.reduce((s, g) => s + g.cost, 0);
  const totalUsed = result.gws.reduce((s, g) => s + g.used, 0);

  function addTransfer(outId: string, inId: string) {
    const next = plan.map((l) => [...l]);
    next[tab] = [...(next[tab] ?? []).filter((x) => x.outId !== outId), { outId, inId }];
    setPlan(next);
    close();
  }

  function undoTransfer(outId: string) {
    const next = plan.map((l) => [...l]);
    next[tab] = (next[tab] ?? []).filter((x) => x.outId !== outId);
    setPlan(next);
  }

  function close() {
    setPickerFor(null);
    opener.current?.focus();
  }

  useEffect(() => {
    if (!pickerFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerFor]);

  const statusLabel = (s: string) => (s === "available" ? null : tPlayers(`status_${s}` as "status_injured"));

  // --- Izbor zamene ----------------------------------------------------------
  const outMember = pickerFor ? gw.startSquad.find((m) => m.player.id === pickerFor) ?? null : null;
  // Kasa kad se ovaj transfer ne računa (ako već postoji za ovog igrača, vraća se njegov efekat).
  const existing = pickerFor ? gw.transfers.find((x) => x.out.player.id === pickerFor) ?? null : null;
  const budgetForSwap = outMember
    ? Math.round((gw.budgetAfter + (existing ? existing.in.price : 0) + outMember.sellPrice) * 10) / 10
    : 0;
  const endIds = new Set(gw.endSquad.map((m) => m.player.id));

  function blockedReason(p: SelectablePlayer): string | null {
    if (!outMember) return null;
    if (endIds.has(p.id) && p.id !== existing?.in.id) return tCommon("alreadyInSquad");
    if (p.position !== outMember.player.position) return tTeam("otherPosition");
    const currentIn = existing?.in.id;
    const clubCount = gw.endSquad.filter(
      (m) => m.player.club_id === p.club_id && m.player.id !== currentIn
    ).length;
    if (clubCount >= MAX_PLAYERS_PER_CLUB) return tCommon("maxFromClub");
    if (budgetForSwap - p.price < -1e-9) {
      return tTeam("missingAmount", { amount: formatEUR(p.price - budgetForSwap) });
    }
    return null;
  }

  // --- Prikaz ----------------------------------------------------------------
  const outIds = new Set(gw.transfers.map((x) => x.out.player.id));
  const inByOut = new Map(gw.transfers.map((x) => [x.out.player.id, x.in]));

  const chips = (clubId: string, highlightFrom = 0) => (
    <span className="flex items-center gap-1 shrink-0 order-last basis-full pl-[44px] sm:order-none sm:basis-auto sm:pl-0">
      {gameweeks.map((g, i) => {
        const list = fixtures[i]?.[clubId] ?? [];
        return (
          <span
            key={g.number}
            className={`flex flex-col gap-0.5 w-[42px] sm:w-[52px] ${i < highlightFrom ? "opacity-40" : ""}`}
          >
            {list.length === 0 ? (
              <span className="text-center text-slate-500 text-xs py-1">–</span>
            ) : (
              list.map((f, j) => (
                <FdrChip key={j} label={f.label} difficulty={f.difficulty} className="px-1 py-1 text-[10px] sm:text-[11px]" />
              ))
            )}
          </span>
        );
      })}
    </span>
  );

  const row = (m: SquadMember | { player: SelectablePlayer; sellPrice: number }, kind: "keep" | "out" | "in", transferOut?: string) => {
    const pl = m.player;
    const sl = statusLabel(pl.status);
    return (
      <li
        key={`${kind}-${pl.id}`}
        className={`flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-1.5 sm:gap-3 px-3 sm:px-4 py-2 border-t border-navy-700 first:border-t-0 text-sm ${
          kind === "in" ? "bg-pitch-400/10" : ""
        }`}
      >
        <span className="shrink-0 w-9 text-center text-[10px] font-bold tracking-wide text-navy-950 bg-slate-300 rounded-full px-1 py-0.5">
          {tPos(`short${pl.position}`)}
        </span>
        <JerseyIcon color={pl.club_color} photoUrl={pl.club_jersey_photo_url} isGoalkeeper={pl.position === "GK"} size={24} />
        <span className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:gap-2">
          <span className={`truncate font-semibold ${kind === "out" ? "line-through text-slate-500" : kind === "in" ? "text-pitch-400" : ""}`}>
            {kind === "in" ? "→ " : ""}
            {playerFullName(pl)}
          </span>
          <span className="text-xs text-slate-400 shrink-0">{pl.club_short}</span>
          {sl && kind !== "out" && (
            <span className="shrink-0 w-fit text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-danger-400/15 text-danger-400">
              {sl}
            </span>
          )}
        </span>
        <span className={`hidden sm:block shrink-0 w-14 text-right tabular-nums text-slate-300 ${kind === "out" ? "line-through text-slate-500" : ""}`}>
          {formatEUR(kind === "in" ? pl.price : m.sellPrice)}
        </span>
        {kind !== "out" && chips(pl.club_id)}
        {kind === "out" && <span className="flex-1 hidden sm:block" />}
        <span className="shrink-0 w-[68px] text-right">
          {kind === "keep" && (
            <button
              type="button"
              onClick={(e) => {
                opener.current = e.currentTarget;
                setPickerFor(pl.id);
              }}
              className="text-xs font-semibold text-gold-300 border border-navy-600 hover:border-gold-400/60 rounded-md px-2 py-1 transition-colors"
            >
              {t("replace")}
            </button>
          )}
          {kind === "out" && (
            <button
              type="button"
              onClick={() => undoTransfer(transferOut ?? pl.id)}
              className="text-xs font-semibold text-danger-400 border border-navy-600 hover:border-danger-400/60 rounded-md px-2 py-1 transition-colors"
            >
              {t("undo")}
            </button>
          )}
        </span>
      </li>
    );
  };

  const hasPlan = totalUsed > 0;

  return (
    <div className="mx-auto max-w-[1100px]">
      <Link href="/moj-tim" className="text-slate-400 text-sm hover:text-chalk-50">
        ← {t("openTeam")}
      </Link>
      <h2 className="font-display text-2xl mt-2">{t("title")}</h2>
      <p className="text-slate-400 text-sm mb-4 max-w-2xl">{t("subtitle")}</p>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <section className="bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden">
          <div className="bg-navy-700 border-b border-gold-400/30 px-4 py-2.5 flex items-center justify-between gap-3">
            <h3 className="font-display text-sm uppercase tracking-wider text-gold-300">{t("squadTitle")}</h3>
            <span className="text-[11px] text-slate-300">
              {t("deadline")}{" "}
              <LocalTime iso={gameweeks[tab].deadlineAt} options={{ dateStyle: "short", timeStyle: "short" }} />
            </span>
          </div>

          <div role="tablist" aria-label={t("title")} className="flex gap-1.5 px-3 sm:px-4 pt-3 overflow-x-auto">
            {gameweeks.map((g, i) => {
              const used = result.gws[i].used;
              return (
                <button
                  key={g.number}
                  role="tab"
                  type="button"
                  aria-selected={tab === i}
                  onClick={() => setTab(i)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    tab === i ? "bg-gold-400 text-navy-950" : "bg-navy-900 text-slate-300 hover:text-chalk-50"
                  }`}
                >
                  {t("gwTab", { number: g.number })}
                  {used > 0 && (
                    <span className={`ml-1.5 text-[11px] rounded-full px-1.5 py-px ${tab === i ? "bg-navy-950/20" : "bg-black/25"}`}>
                      {used}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 px-3 sm:px-4 py-3 text-xs text-slate-400">
            <Stat label={t("freeTransfers")} value={Number.isFinite(gw.freeAvailable) ? String(gw.freeAvailable) : "∞"} accent />
            <Stat label={t("planned")} value={String(gw.used)} />
            <Stat label={t("cost")} value={gw.cost > 0 ? `−${gw.cost}` : "0"} danger={gw.cost > 0} />
            <Stat label={t("budgetAfter")} value={formatEUR(gw.budgetAfter)} />
          </div>

          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 pt-1 pb-1 text-[10px] uppercase tracking-wide text-slate-500">
            <span className="hidden sm:block w-9 shrink-0" />
            <span className="hidden sm:block w-6 shrink-0" />
            <span className="hidden sm:block flex-1">{t("colPlayer")}</span>
            <span className="hidden sm:block w-14 text-right shrink-0">{t("colPrice")}</span>
            <span className="flex items-center gap-1 shrink-0 pl-[44px] sm:pl-0">
              {gameweeks.map((g, i) => (
                <span
                  key={g.number}
                  className={`w-[42px] sm:w-[52px] text-center ${i === tab ? "text-gold-300 font-bold" : ""}`}
                >
                  {t("gwShort", { number: g.number })}
                </span>
              ))}
            </span>
            <span className="hidden sm:block w-[68px] shrink-0" />
          </div>

          {loaded &&
            POSITIONS.map((pos: Position) => {
              const list = gw.startSquad.filter((m) => m.player.position === pos);
              if (list.length === 0) return null;
              return (
                <ul key={pos}>
                  {list.flatMap((m) => {
                    if (!outIds.has(m.player.id)) return [row(m, "keep")];
                    const incoming = inByOut.get(m.player.id)!;
                    return [
                      row(m, "out", m.player.id),
                      row({ player: incoming, sellPrice: incoming.price }, "in"),
                    ];
                  })}
                </ul>
              );
            })}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden">
            <div className="bg-navy-700 border-b border-gold-400/30 px-4 py-2.5">
              <h3 className="font-display text-sm uppercase tracking-wider text-gold-300">
                {t("planFor", { number: gameweeks[tab].number })}
              </h3>
            </div>
            {gw.transfers.length === 0 ? (
              <p className="text-slate-400 text-sm px-4 py-4">{t("noTransfers")}</p>
            ) : (
              <ul>
                {gw.transfers.map((x, i) => (
                  <li key={x.out.player.id} className="flex items-center gap-2 px-4 py-2.5 border-t border-navy-700 first:border-t-0 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {x.out.player.last_name || x.out.player.first_name}{" "}
                        <span className="text-slate-400 text-xs">{x.out.sellPrice.toFixed(1)}</span>
                        {" → "}
                        {x.in.last_name || x.in.first_name} <span className="text-slate-400 text-xs">{x.in.price.toFixed(1)}</span>
                      </span>
                    </span>
                    <span className={`shrink-0 text-xs font-bold ${i >= gw.freeAvailable ? "text-danger-400" : "text-pitch-400"}`}>
                      {i >= gw.freeAvailable ? `−${EXTRA_TRANSFER_COST}` : t("free")}
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between px-4 py-2.5 border-t border-navy-700 font-bold text-sm">
                  <span>{t("total")}</span>
                  <span className={gw.cost > 0 ? "text-danger-400" : ""}>
                    {gw.cost > 0 ? t("pointsLost", { points: gw.cost }) : t("noPenalty")}
                  </span>
                </li>
              </ul>
            )}
            {hasPlan && (
              <div className="border-t border-navy-700 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-slate-400">
                <span>
                  {t("allGameweeks")}:{" "}
                  <b className={totalCost > 0 ? "text-danger-400" : "text-chalk-50"}>
                    {totalCost > 0 ? t("pointsLost", { points: totalCost }) : t("noPenalty")}
                  </b>
                </span>
                <button
                  type="button"
                  onClick={() => setPlan(gameweeks.map(() => []))}
                  className="font-semibold text-gold-300 hover:underline whitespace-nowrap"
                >
                  {t("clearPlan")}
                </button>
              </div>
            )}
          </section>

          <section className="bg-navy-800 border border-navy-700 rounded-xl px-4 py-3 text-xs text-slate-400 leading-relaxed flex flex-col gap-2">
            <p>
              {t("fdrNote")}{" "}
              <FdrChip label="1" difficulty={1} className="px-1.5 py-0.5 text-[10px]" />{" "}
              <FdrChip label="3" difficulty={3} className="px-1.5 py-0.5 text-[10px]" />{" "}
              <FdrChip label="5" difficulty={5} className="px-1.5 py-0.5 text-[10px]" />
            </p>
            <p>{t("rulesNote", { max: FREE_TRANSFERS_MAX, cost: EXTRA_TRANSFER_COST })}</p>
            {preSeason && <p className="text-gold-300">{t("preSeasonNote")}</p>}
            <p>{t("savedNote")}</p>
          </section>
        </aside>
      </div>

      {pickerFor && outMember && (
        <div className="fixed inset-0 z-[110] bg-black/60 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("pickReplacement", { name: playerFullName(outMember.player) })}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl"
          >
            <div className="flex items-center justify-between bg-navy-700 border border-gold-400/50 rounded-t-xl px-4 py-2.5">
              <span className="text-sm">
                {t("replacing")} <b>{playerFullName(outMember.player)}</b>{" "}
                <span className="text-slate-400">· {t("budgetForSwap", { amount: formatEUR(budgetForSwap) })}</span>
              </span>
              <button type="button" onClick={close} aria-label={t("close")} className="text-slate-300 hover:text-chalk-50 text-lg leading-none">
                ×
              </button>
            </div>
            <PlayerPicker
              players={players}
              lockedPosition={outMember.player.position}
              selectedIds={endIds}
              blockedReason={blockedReason}
              onPick={(p) => addTransfer(outMember.player.id, p.id)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div>
      <div className="uppercase tracking-wide text-[10px]">{label}</div>
      <div className={`font-display text-xl font-bold ${danger ? "text-danger-400" : accent ? "text-gold-300" : "text-chalk-50"}`}>
        {value}
      </div>
    </div>
  );
}
