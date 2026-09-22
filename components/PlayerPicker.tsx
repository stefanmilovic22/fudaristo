"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BUDGET_LOCK_REASON,
  POSITIONS,
  POSITION_LABELS,
  formatEUR,
  playerFullName,
  type Position,
  type SelectablePlayer,
} from "@/lib/fantasy-rules";

type SortKey = "price_desc" | "price_asc" | "points_desc" | "name_asc";

const SORT_KEYS: Record<SortKey, string> = {
  price_desc: "sortPriceDesc",
  price_asc: "sortPriceAsc",
  points_desc: "sortPoints",
  name_asc: "sortName",
};

const PRICE_CAPS = [15, 12, 10, 8, 6, 5];

export type PickerProps = {
  players: SelectablePlayer[];
  /** Kad je slot izabran na terenu, lista je zaključana na tu poziciju. */
  lockedPosition?: Position | null;
  selectedIds: Set<string>;
  /** Vraća razlog zašto igrač ne može da se doda, ili null ako može. */
  blockedReason: (p: SelectablePlayer) => string | null;
  onPick: (p: SelectablePlayer) => void;
  onClearLock?: () => void;
};

export function PlayerPicker({
  players,
  lockedPosition,
  selectedIds,
  blockedReason,
  onPick,
  onClearLock,
}: PickerProps) {
  const t = useTranslations("picker");
  const tPos = useTranslations("positions");
  const tCommon = useTranslations("common");
  const tStats = useTranslations("stats");
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<Position | "ALL">("ALL");
  const [clubId, setClubId] = useState<string>("ALL");
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>("price_desc");

  const clubs = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of players) map.set(p.club_id, p.club_name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "sr"));
  }, [players]);

  const activePosition = lockedPosition ?? (position === "ALL" ? null : position);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = players.filter((p) => {
      if (activePosition && p.position !== activePosition) return false;
      if (clubId !== "ALL" && p.club_id !== clubId) return false;
      if (maxPrice !== null && p.price > maxPrice) return false;
      if (q && !playerFullName(p).toLowerCase().includes(q) && !p.club_name.toLowerCase().includes(q))
        return false;
      return true;
    });

    list.sort((a, b) => {
      switch (sort) {
        case "price_asc":
          return a.price - b.price || a.last_name.localeCompare(b.last_name, "sr");
        case "points_desc":
          return b.total_points - a.total_points || b.price - a.price;
        case "name_asc":
          return a.last_name.localeCompare(b.last_name, "sr");
        default:
          return b.price - a.price || b.total_points - a.total_points;
      }
    });
    return list;
  }, [players, activePosition, clubId, maxPrice, search, sort]);

  const inputClass =
    "bg-navy-900/60 border border-navy-600 rounded-lg px-2.5 py-2 text-sm text-chalk-50 focus:border-gold-400 focus:outline-none";

  return (
    <div className="bg-navy-800 rounded-xl ring-1 ring-black/25 p-4 flex flex-col gap-3 h-fit">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg">
          {lockedPosition ? t("choose", { position: tPos(lockedPosition) }) : t("allPlayers")}
        </h3>
        {lockedPosition && onClearLock && (
          <button
            type="button"
            onClick={onClearLock}
            className="text-xs text-slate-300 hover:text-chalk-50 underline underline-offset-2"
          >
            {t("showAll")}
          </button>
        )}
      </div>

      <input
        type="search"
        placeholder={t("search")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={inputClass}
      />

      {!lockedPosition && (
        <div className="flex gap-1 bg-navy-900/50 p-1 rounded-lg">
          {(["ALL", ...POSITIONS] as const).map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => setPosition(pos)}
              className={`flex-1 text-xs font-semibold px-2 py-1.5 rounded-md transition-colors ${
                position === pos
                  ? "bg-gold-400 text-navy-950"
                  : "text-slate-300 hover:text-chalk-50"
              }`}
            >
              {pos === "ALL" ? t("allPositions") : tPos(pos as never)}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-slate-400">
          Klub
          <select value={clubId} onChange={(e) => setClubId(e.target.value)} className={inputClass}>
            <option value="ALL">{t("allClubs")}</option>
            {clubs.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-slate-400">
          Cena do
          <select
            value={maxPrice ?? "ALL"}
            onChange={(e) => setMaxPrice(e.target.value === "ALL" ? null : Number(e.target.value))}
            className={inputClass}
          >
            <option value="ALL">{t("noLimit")}</option>
            {PRICE_CAPS.map((cap) => (
              <option key={cap} value={cap}>
                {cap.toFixed(1)}M
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-[11px] text-slate-400">
        {t("sort")}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className={inputClass}
        >
          {(Object.keys(SORT_KEYS) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {t(SORT_KEYS[k] as never)}
            </option>
          ))}
        </select>
      </label>

      <p className="text-[11px] text-slate-400">
        {t("count", { count: visible.length })}
      </p>

      <div className="flex flex-col gap-1 max-h-[420px] overflow-y-auto pr-1 -mr-1">
        {visible.map((p) => {
          const chosen = selectedIds.has(p.id);
          const reason = chosen ? tCommon("alreadyInSquad") : blockedReason(p);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => !reason && onPick(p)}
              disabled={Boolean(reason)}
              title={reason ?? undefined}
              className={`group flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-sm transition-colors ${
                reason
                  ? "opacity-40 cursor-not-allowed bg-navy-900/40"
                  : "bg-navy-700/60 hover:bg-navy-700"
              }`}
            >
              <span
                className="w-1.5 h-8 rounded-full shrink-0"
                style={{ backgroundColor: p.club_color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {playerFullName(p)}
                  {p.status !== "available" && (
                    <span className="text-danger-400 text-[11px] ml-1.5">{p.status}</span>
                  )}
                </span>
                <span className="block text-[11px] text-slate-400 truncate">
                  {p.club_name} · {p.position}
                </span>
              </span>
              <span className="shrink-0 text-right">
                {/* Uvećano i izdvojeno iz sitne sive linije iznad — pre je broj
                    poena bio 11px, zakopan između kluba i pozicije, teško
                    čitljiv baš kad se lista sortira po poenima. */}
                {p.total_points > 0 && (
                  <span className="block text-sm font-bold text-gold-300 tabular-nums">
                    {p.total_points}{" "}
                    <span className="text-[9px] font-medium text-slate-400">
                      {tStats("unitPoints")}
                    </span>
                  </span>
                )}
                <span className="block font-semibold">{formatEUR(p.price)}</span>
                {reason && !chosen && (
                  <span
                    className={`block text-[10px] ${
                      reason === BUDGET_LOCK_REASON
                        ? "text-danger-400 font-semibold"
                        : "text-slate-400"
                    }`}
                  >
                    {reason}
                  </span>
                )}
              </span>
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="text-slate-400 text-sm py-6 text-center">
            {t("noMatch")}
          </p>
        )}
      </div>
    </div>
  );
}
