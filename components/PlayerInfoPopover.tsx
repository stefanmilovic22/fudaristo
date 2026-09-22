"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { playerFullName, POSITION_SHORT, type Position } from "@/lib/fantasy-rules";

// Napomena: POSITION_SHORT (GOL/ODB/VEZ/NAP) je fiksno srpski, ne prevodi se
// po lokalu — isto kao što ga my-team.tsx već koristi za oznake na klupi.
// Nije uvedena nova nedoslednost, samo ista koja već postoji u toj datoteci.

export type UpcomingFixture = {
  /** Već formatirano, npr. "PAOK (H)" — isti oblik kao opponentByClub. */
  label: string;
  kickoffAt: string;
};

export type PlayerInfoPopoverProps = {
  /** Element pored kog se prozorčić pozicionira (dres na terenu ili klupi). */
  anchorRef: RefObject<HTMLElement | null>;
  player: {
    first_name: string;
    last_name: string;
    club_name: string;
    club_color: string;
    position: Position;
    total_points: number;
    avg_rating: number | null;
  };
  fixtures: UpcomingFixture[];
  onClose: () => void;
};

/**
 * Prozorčić sa informacijama o igraču — otvara se iznad dresa kad se igrač
 * izabere u postavi (isti trenutak kao postojeći "swapSlot", videti
 * my-team.tsx). Ne dira klik-logiku zamene — samo dodatni prikaz dok je
 * igrač izabran.
 *
 * ⚠️ NAMERNO portal u document.body, position: fixed po koordinatama dresa —
 * NE običan `absolute` unutar dresa. I Pitch i Bench kontejneri imaju
 * `overflow-hidden` (seku travnjak/pozadinu na zaobljene ivice), pa bi
 * apsolutno pozicioniran prozorčić iznad golmana (prvi red terena) ili bilo
 * kog igrača na klupi bio delimično ili potpuno odsečen tom ivicom. Portal to
 * zaobilazi u potpunosti — prozorčić se crta van tih kontejnera.
 */
export function PlayerInfoPopover({ anchorRef, player, fixtures, onClose }: PlayerInfoPopoverProps) {
  const locale = useLocale();
  const t = useTranslations("playerInfo");
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPos({ left: rect.left + rect.width / 2, top: rect.top });
    }
    update();
    // Klik ↔ scroll/resize retko padaju u isti trenutak, ali prozorčić ume da
    // ostane otvoren dok korisnik skroluje stranicu — bez ovoga bi "isplivao"
    // daleko od dresa na koji se odnosi.
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
      // stopPropagation: klik UNUTAR prozorčića ne sme da padne do dresa
      // ispod i pokrene handleJerseyClick po drugi put.
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        transform: "translate(-50%, calc(-100% - 14px))",
      }}
      className="w-[210px] bg-navy-800 rounded-xl shadow-2xl ring-1 ring-black/30 p-3 z-[100] text-left"
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

      <div className="flex items-center gap-1.5 mt-1.5">
        <span className="text-[10px] font-bold tracking-wide text-navy-950 bg-slate-300 px-1.5 py-0.5 rounded-full shrink-0">
          {POSITION_SHORT[player.position]}
        </span>
        <span className="text-slate-400 text-xs truncate">{player.club_name}</span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 mt-3 mb-2.5">
        <div className="px-2.5 py-2 bg-navy-900 rounded-lg">
          <span className="block text-[10px] uppercase tracking-wide text-slate-400">{t("points")}</span>
          <span className="font-display font-bold text-2xl text-gold-300 tabular-nums">
            {player.total_points}
          </span>
        </div>
        {player.avg_rating !== null && (
          <div className="px-2.5 py-2 bg-navy-900 rounded-lg">
            <span className="block text-[10px] uppercase tracking-wide text-slate-400">{t("rating")}</span>
            <span className="font-display font-bold text-2xl text-gold-300 tabular-nums">
              {player.avg_rating.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{t("nextMatches")}</p>
      <div className="flex flex-col">
        {fixtures.length === 0 && <p className="text-xs text-slate-500 py-1">—</p>}
        {fixtures.map((f, i) => (
          <div
            key={i}
            className="flex items-center justify-between text-xs py-1 border-t border-white/5 first:border-t-0"
          >
            <span className="truncate">{f.label}</span>
            <span className="text-slate-400 tabular-nums shrink-0 ml-2">
              {new Date(f.kickoffAt).toLocaleDateString(locale, { day: "numeric", month: "numeric" })}
            </span>
          </div>
        ))}
      </div>

      {/* Strelica koja pokazuje ka dresu ispod. */}
      <div
        aria-hidden
        className="absolute left-1/2 top-full -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-t-[10px] border-t-[#142238]"
      />
    </div>,
    document.body
  );
}
