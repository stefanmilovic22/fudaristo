"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { playerFullName, type Position } from "@/lib/fantasy-rules";
import { LocalTime } from "@/components/LocalTime";
import { FdrChip } from "@/components/FdrChip";
import { JerseyIcon } from "@/components/JerseyIcon";
import { assetUrl } from "@/lib/asset-url";
import { Link } from "@/i18n/navigation";

export type UpcomingFixture = {
  /** Već formatirano, npr. "PAOK (H)" — isti oblik kao opponentByClub. */
  label: string;
  kickoffAt: string;
  /** Težina meča 1 (lako) – 5 (teško), po mestu protivnika u tabeli (lib/fdr.ts). */
  difficulty?: number;
};

/** Dugme u meniju igrača („Moj tim“): kapiten, vicekapiten, zamena, transfer. */
export type PlayerAction = {
  key: string;
  label: string;
  /** Slovo ili znak u kružiću levo od natpisa (C, V, ⇅, ⇄). */
  badge: string;
  /** Već važi za ovog igrača (npr. on JESTE kapiten) — dugme je istaknuto. */
  active?: boolean;
  /**
   * Dugme sa strelicom umesto natpisa (pomeranje na klupi). Natpis ostaje samo kao
   * tooltip i oznaka za čitače ekrana, jer u dugme ne staje.
   */
  arrow?: "left" | "right";
  /** Dugme je prikazano, ali nije moguće (npr. već je prvi na klupi). */
  disabled?: boolean;
  onClick: () => void;
};

/** Par dugmadi sa strelicama (levo/desno) sa kratkim naslovom iznad. */
function ArrowRow({
  actions,
  caption,
  size,
}: {
  actions: PlayerAction[];
  caption?: string;
  size: "lg" | "sm";
}) {
  if (actions.length === 0) return null;
  const big = size === "lg";
  return (
    <div className={big ? "mt-3" : "mt-2 pt-2 border-t border-white/10"}>
      {caption && (
        <p className={`uppercase tracking-wide text-slate-500 ${big ? "text-[10px] mb-1.5" : "text-[10px] mb-1"}`}>
          {caption}
        </p>
      )}
      <div className={`grid grid-cols-2 ${big ? "gap-2" : "gap-1.5"}`}>
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={a.onClick}
            disabled={a.disabled}
            aria-label={a.label}
            title={a.label}
            className={`flex items-center justify-center border text-gold-300 transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
              big ? "min-h-[52px] rounded-xl" : "min-h-[36px] rounded-lg"
            } bg-navy-900 border-navy-600 ${a.disabled ? "" : big ? "active:bg-navy-700" : "hover:bg-navy-700"}`}
          >
            <svg
              viewBox="0 0 24 24"
              className={big ? "w-7 h-7" : "w-5 h-5"}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {a.arrow === "left" ? <path d="M19 12H5m6-6-6 6 6 6" /> : <path d="M5 12h14m-6-6 6 6-6 6" />}
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

export type PlayerInfoPopoverProps = {
  /** Element pored kog se prozorčić pozicionira (dres na terenu ili klupi). */
  anchorRef: RefObject<HTMLElement | null>;
  player: {
    /** Kad postoji, prozorčić nudi link na stranicu igrača. */
    id?: string;
    first_name: string;
    last_name: string;
    club_name: string;
    club_color: string;
    position: Position;
    total_points: number;
    avg_rating: number | null;
    /** Fotografija dresa kluba — prikazuje se u zaglavlju panela na telefonu. */
    club_jersey_photo_url?: string | null;
  };
  fixtures: UpcomingFixture[];
  onClose: () => void;
  /**
   * Radnje nad igračem. Kad postoje, prozorčić postaje MENI IGRAČA: na telefonu
   * se otvara kao panel uz dno ekrana (velika dugmad, ništa ne izlazi van
   * ekrana), na širem ekranu ostaje prozorčić iznad dresa sa dugmadima u njemu.
   */
  actions?: PlayerAction[];
  /** Kratko uputstvo ispod dugmadi (npr. kako se radi zamena). */
  hint?: string;
  /** Naslov iznad dugmadi sa strelicama (npr. „Redosled na klupi“). */
  arrowCaption?: string;
};

/** Širina prozorčića iznad dresa — potrebna i za držanje unutar ekrana. */
const POPOVER_WIDTH = 264;
const EDGE_GAP = 8;

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
export function PlayerInfoPopover({ anchorRef, player, fixtures, onClose, actions, hint, arrowCaption }: PlayerInfoPopoverProps) {
  const locale = useLocale();
  const t = useTranslations("playerInfo");
  const tPos = useTranslations("positions");
  // left = sredina prozorčića (već pomerena da ostane u ekranu); arrow = koliko
  // je strelica pomerena od sredine da i dalje pokazuje na dres; place = da li je
  // prozorčić iznad dresa ili ispod njega (kad gore nema mesta).
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    arrow: number;
    place: "above" | "below";
    narrow: boolean;
  } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const hasActions = Boolean(actions && actions.length > 0);
  const textActions = (actions ?? []).filter((a) => !a.arrow);
  const arrowActions = (actions ?? []).filter((a) => a.arrow);
  const sheetMode = hasActions && Boolean(pos?.narrow);

  useLayoutEffect(() => {
    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      // Telefon uspravno, ali i telefon položen (nizak ekran): tamo prozorčić ne
      // bi stao iznad dresa, pa se koristi panel uz dno.
      const narrow = vw < 640 || vh < 560;

      // Dres je izašao iz vidnog polja (korisnik je odskrolovao) — prozorčić ne
      // sme da lebdi sam po ekranu, pa se zatvara.
      if (!narrow && (rect.bottom < 0 || rect.top > vh)) {
        onClose();
        return;
      }

      const center = rect.left + rect.width / 2;
      const half = POPOVER_WIDTH / 2;
      // Igrač uz ivicu ekrana: prozorčić se pomera ka sredini da ne izađe van.
      const left = Math.min(Math.max(center, half + EDGE_GAP), Math.max(half + EDGE_GAP, vw - half - EDGE_GAP));

      // Vertikalno: preferirano iznad dresa; ako bi zašlo pod lepljivo zaglavlje,
      // ide ispod dresa; i u tom slučaju se drži unutar ekrana.
      const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const minTop = Math.max(headerBottom, 0) + EDGE_GAP;
      const h = boxRef.current?.offsetHeight ?? 340;
      const ARROW = 14;
      let place: "above" | "below" = "above";
      let top = rect.top - ARROW - h;
      if (top < minTop) {
        place = "below";
        top = rect.bottom + ARROW;
      }
      top = Math.max(minTop, Math.min(top, vh - h - EDGE_GAP));
      setPos({ left, top, arrow: center - left, place, narrow });
    }
    update();
    // Prvo merenje je bez stvarne visine (prozorčić tek nastaje) — ponovi čim se iscrta.
    const raf = requestAnimationFrame(update);
    // Klik ↔ scroll/resize retko padaju u isti trenutak, ali prozorčić ume da
    // ostane otvoren dok korisnik skroluje stranicu — bez ovoga bi "isplivao"
    // daleko od dresa na koji se odnosi.
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, onClose]);

  // Panel uz dno: pozadina se ne skroluje ispod njega (strana ostaje na mestu,
  // panel se ne „vozi“ po ekranu), a Escape ga zatvara.
  useLayoutEffect(() => {
    if (!sheetMode) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetMode, onClose]);

  if (!pos) return null;

  const positionChip = (
    <span className="text-[10px] font-bold tracking-wide text-navy-950 bg-slate-300 px-1.5 py-0.5 rounded-full shrink-0">
      {tPos(`short${player.position}`)}
    </span>
  );

  const statTiles = (
    <>
      <div className="px-2.5 py-2 bg-navy-900 rounded-lg">
        <span className="block text-[10px] uppercase tracking-wide text-slate-400">{t("points")}</span>
        <span className="font-display font-bold text-2xl text-gold-300 tabular-nums">{player.total_points}</span>
      </div>
      {player.avg_rating !== null && (
        <div className="px-2.5 py-2 bg-navy-900 rounded-lg">
          <span className="block text-[10px] uppercase tracking-wide text-slate-400">{t("rating")}</span>
          <span className="font-display font-bold text-2xl text-gold-300 tabular-nums">
            {player.avg_rating.toFixed(1)}
          </span>
        </div>
      )}
    </>
  );

  const detailsLink = player.id ? (
    <Link
      href={`/igraci/${player.id}`}
      className="block mt-2.5 pt-2 border-t border-white/10 text-gold-300 text-xs font-semibold hover:underline"
    >
      {t("details")} →
    </Link>
  ) : null;

  // --- Telefon: meni igrača kao panel uz dno ekrana --------------------------
  // Samo kad ima radnji („Moj tim“). Lista igrača i dalje koristi prozorčić.
  if (sheetMode) {
    const photo = assetUrl(player.club_jersey_photo_url);
    return createPortal(
      <>
        {/* Zatamnjenje: dodir van panela ga zatvara (i ne pada na teren ispod). */}
        <div className="fixed inset-0 z-[99] bg-navy-950/60 touch-none" onClick={onClose} aria-hidden />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={playerFullName(player)}
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-x-0 bottom-0 z-[100] bg-navy-800 rounded-t-2xl border-t border-navy-600 shadow-2xl px-4 pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom))] text-left max-h-[88vh] max-h-[88dvh] overflow-y-auto overscroll-contain"
        >
          <div className="w-11 h-1.5 rounded-full bg-navy-600 mx-auto mb-3" aria-hidden />

          <div className="flex items-center gap-3">
            {/* Ceo dres, bez sečenja: slika zadržava svoju visinu (kragna i rukavi se vide). */}
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- mala statička slika dresa, kao u Jersey.tsx
              <img src={photo} alt="" className="w-14 h-auto shrink-0 block" />
            ) : (
              <JerseyIcon color={player.club_color} isGoalkeeper={player.position === "GK"} size={48} />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-display font-semibold text-xl leading-tight truncate">{playerFullName(player)}</p>
              <p className="flex items-center gap-1.5 mt-1">
                {positionChip}
                <span className="text-slate-400 text-sm truncate">{player.club_name}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-navy-900 text-slate-300 text-xl leading-none"
            >
              ×
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3">{statTiles}</div>

          <p className="text-[10px] uppercase tracking-wide text-slate-500 mt-3 mb-1.5">{t("nextMatches")}</p>
          <div className="flex flex-wrap gap-1.5">
            {fixtures.length === 0 && <span className="text-xs text-slate-500">—</span>}
            {fixtures.map((f, i) => (
              <FdrChip key={i} label={f.label} difficulty={f.difficulty} className="px-2.5 py-1.5 text-xs" />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            {textActions.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={a.onClick}
                aria-pressed={a.active}
                className={`min-h-[52px] rounded-xl border px-2.5 min-[360px]:px-3 flex items-center gap-2 min-[360px]:gap-2.5 text-left text-[14px] min-[360px]:text-[15px] leading-tight font-semibold ${
                  a.active
                    ? "bg-gold-400/15 border-gold-400 text-chalk-50"
                    : "bg-navy-900 border-navy-600 text-chalk-50 active:bg-navy-700"
                } ${textActions.length % 2 === 1 && a === textActions[textActions.length - 1] ? "col-span-2" : ""}`}
              >
                <span
                  aria-hidden
                  className={`w-6 h-6 min-[360px]:w-7 min-[360px]:h-7 shrink-0 rounded-full flex items-center justify-center text-[12px] min-[360px]:text-[13px] font-bold ${
                    a.active ? "bg-gold-400 text-navy-950" : "bg-navy-700 text-gold-300"
                  }`}
                >
                  {a.badge}
                </span>
                <span className="min-w-0 break-words">{a.label}</span>
              </button>
            ))}
          </div>
          <ArrowRow actions={arrowActions} caption={arrowCaption} size="lg" />
          {hint && <p className="text-xs text-slate-400 mt-2.5">{hint}</p>}

          {player.id && (
            <Link
              href={`/igraci/${player.id}`}
              className="mt-3 min-h-[48px] rounded-xl border border-navy-600 px-3 flex items-center justify-between text-gold-300 text-sm font-semibold"
            >
              {t("details")} <span aria-hidden>→</span>
            </Link>
          )}
        </div>
      </>,
      document.body
    );
  }

  // --- Širi ekran (i lista igrača): prozorčić iznad dresa --------------------
  return createPortal(
    <div
      ref={boxRef}
      // stopPropagation: klik UNUTAR prozorčića ne sme da padne do dresa
      // ispod i pokrene handleJerseyClick po drugi put.
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        width: POPOVER_WIDTH,
        transform: "translateX(-50%)",
        maxHeight: "calc(100vh - 16px)",
        overflowY: "auto",
      }}
      className="bg-navy-800 rounded-xl shadow-2xl ring-1 ring-black/30 p-3 z-[100] text-left"
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
        {positionChip}
        <span className="text-slate-400 text-xs truncate">{player.club_name}</span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 mt-3 mb-2.5">{statTiles}</div>

      <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{t("nextMatches")}</p>
      <div className="flex flex-col">
        {fixtures.length === 0 && <p className="text-xs text-slate-500 py-1">—</p>}
        {fixtures.map((f, i) => (
          <div
            key={i}
            className="flex items-center justify-between text-xs py-1 border-t border-white/5 first:border-t-0"
          >
            <FdrChip label={f.label} difficulty={f.difficulty} className="px-2 py-1 text-[11px]" />
            <span className="text-slate-400 tabular-nums shrink-0 ml-2">
              <LocalTime iso={f.kickoffAt} options={{ day: "numeric", month: "numeric" }} />
            </span>
          </div>
        ))}
      </div>

      {hasActions && (
        <div className="mt-2.5 pt-2.5 border-t border-white/10">
        <div className="grid grid-cols-2 gap-1.5">
          {textActions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={a.onClick}
              aria-pressed={a.active}
              className={`min-h-[36px] rounded-lg border px-2 flex items-center gap-1.5 text-left text-xs font-semibold ${
                a.active
                  ? "bg-gold-400/15 border-gold-400 text-chalk-50"
                  : "bg-navy-900 border-navy-600 text-chalk-50 hover:bg-navy-700"
              } ${textActions.length % 2 === 1 && a === textActions[textActions.length - 1] ? "col-span-2" : ""}`}
            >
              <span
                aria-hidden
                className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  a.active ? "bg-gold-400 text-navy-950" : "bg-navy-700 text-gold-300"
                }`}
              >
                {a.badge}
              </span>
              <span className="truncate">{a.label}</span>
            </button>
          ))}
        </div>
        <ArrowRow actions={arrowActions} caption={arrowCaption} size="sm" />
        </div>
      )}
      {hasActions && hint && <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">{hint}</p>}

      {detailsLink}

      {/* Strelica koja pokazuje ka dresu (prati dres i kad je prozorčić pomeren od ivice ili ispod dresa). */}
      <div
        aria-hidden
        style={{ left: `calc(50% + ${pos.arrow}px)` }}
        className={
          pos.place === "above"
            ? "absolute top-full -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-t-[10px] border-t-[#151E39]"
            : "absolute bottom-full -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-b-[10px] border-b-[#151E39]"
        }
      />
    </div>,
    document.body
  );
}
