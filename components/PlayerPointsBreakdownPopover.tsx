"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { playerFullName, POSITION_SHORT, type Position } from "@/lib/fantasy-rules";
import type { ScoringLineItem } from "@/lib/scoring";

export type BreakdownGroup = {
  /** Naziv meča kad je duplo kolo (2+ redova) — izostavljen kad je samo jedan. */
  matchLabel?: string;
  items: ScoringLineItem[];
  subtotal: number;
};

export type PlayerPointsBreakdownPopoverProps = {
  anchorRef: RefObject<HTMLElement | null>;
  player: {
    first_name: string;
    last_name: string;
    club_name: string;
    club_color: string;
    position: Position;
  };
  groups: BreakdownGroup[];
  /** Sirovi zbir (pre kapitenskog množioca). */
  total: number;
  /** 2/3 za kapitena (Triple Captain), inače 1 — videti resolveCaptainMultiplier. */
  multiplier?: number;
  /** "Kapiten ×2" / "Triple ×3", već prevedeno od pozivaoca; izostavljeno kad je multiplier 1. */
  multiplierLabel?: string | null;
  onClose: () => void;
};

/**
 * Raspis poena za javni pregled tuđeg tima — "za svaki poen za šta je
 * dobijen", ne samo krajnji broj. Iste stavke i vrednosti kao
 * lib/scoring.ts (describeRowFantasyPoints) — nikad ne izmišljene ovde.
 *
 * Portal u document.body iz istog razloga kao PlayerInfoPopover: Pitch i
 * Bench seku sadržaj na ivicama (overflow-hidden), pa bi apsolutno
 * pozicioniran prozorčić iznad golmana ili klupe bio odsečen.
 */
export function PlayerPointsBreakdownPopover({
  anchorRef,
  player,
  groups,
  total,
  multiplier = 1,
  multiplierLabel,
  onClose,
}: PlayerPointsBreakdownPopoverProps) {
  const t = useTranslations("playerInfo");
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const finalTotal = total * multiplier;

  useLayoutEffect(() => {
    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPos({ left: rect.left + rect.width / 2, top: rect.top });
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef]);

  if (!pos) return null;

  return createPortal(
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        transform: "translate(-50%, calc(-100% - 14px))",
      }}
      className="w-[240px] bg-navy-800 rounded-xl shadow-2xl ring-1 ring-black/30 p-3 z-[100] text-left"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t("close")}
        className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-chalk-50 hover:bg-white/5 text-sm leading-none"
      >
        ×
      </button>

      <div className="flex items-center gap-2 pr-4">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white/15"
          style={{ backgroundColor: player.club_color }}
          aria-hidden
        />
        <span className="font-display font-semibold text-[15px] leading-tight truncate">
          {playerFullName(player)}
        </span>
      </div>

      <div className="flex items-center gap-1.5 mt-1.5 mb-2.5">
        <span className="text-[10px] font-bold tracking-wide text-navy-950 bg-slate-300 px-1.5 py-0.5 rounded-full shrink-0">
          {POSITION_SHORT[player.position]}
        </span>
        <span className="text-slate-400 text-xs truncate">{player.club_name}</span>
      </div>

      <div className="flex flex-col">
        {groups.map((g, gi) => (
          <div key={gi} className={gi > 0 ? "mt-2 pt-2 border-t border-white/10" : ""}>
            {g.matchLabel && (
              <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{g.matchLabel}</p>
            )}
            {g.items.map((item, ii) => (
              <div
                key={ii}
                className="flex items-center justify-between text-xs py-1 border-t border-white/5 first:border-t-0"
              >
                <span className="text-chalk-50">{item.label}</span>
                <span
                  className={`font-semibold tabular-nums ${
                    item.value > 0 ? "text-pitch-400" : item.value < 0 ? "text-danger-400" : "text-slate-500"
                  }`}
                >
                  {item.value > 0 ? `+${item.value}` : item.value}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Zasebna stavka za kapitensku traku — ne meša se sa raw stavkama iznad
          (golovi, asistencije...) jer nije kategorija poena nego množilac nad
          njihovim zbirom. */}
      {multiplier > 1 && multiplierLabel && (
        <div className="flex items-center justify-between text-xs py-1.5 mt-1 px-2.5 bg-gold-400/10 border border-gold-400/30 rounded-lg">
          <span className="text-gold-300 font-semibold">{multiplierLabel}</span>
          <span className="text-gold-300 font-semibold tabular-nums">×{multiplier}</span>
        </div>
      )}

      <div className="flex items-baseline justify-between mt-2.5 px-2.5 py-2 bg-navy-900 rounded-lg">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">{t("total")}</span>
        <span className="font-display font-bold text-2xl text-gold-300 tabular-nums">{finalTotal}</span>
      </div>

      <div
        aria-hidden
        className="absolute left-1/2 top-full -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-t-[10px] border-t-[#142238]"
      />
    </div>,
    document.body
  );
}
