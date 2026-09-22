"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  SQUAD_COMPOSITION,
  SQUAD_SIZE,
  STARTING_XI_SIZE,
  BENCH_SIZE,
  STARTING_XI_BOUNDS,
  BUDGET_TOTAL,
  MAX_PLAYERS_PER_CLUB,
} from "@/lib/fantasy-rules";
import {
  GOAL_POINTS,
  CLEAN_SHEET_POINTS,
  ASSIST_POINTS,
  PENALTY_MISSED_POINTS,
  YELLOW_CARD_POINTS,
  RED_CARD_POINTS,
  OWN_GOAL_POINTS,
  PENALTY_SAVED_POINTS,
} from "@/lib/scoring";

/**
 * Nisu izvezeni iz koda jer žive samo u SQL migracijama (migrations/003,
 * 005, 008 — `free_transfers = least(5, free_transfers + 1)`) i u
 * my-team.tsx (`-4 * Math.max(...)`). Ovde su isključivo za prikaz — ako se
 * ta pravila ikad promene, promeniti i ovde (isti obrazac kao svuda drugde
 * gde se pravila dupliraju između baze i klijenta, videti komentare tamo).
 */
const FREE_TRANSFERS_MAX = 5;
const EXTRA_TRANSFER_COST = -4;

const TOC_KEYS = ["squad", "lineup", "captain", "transfers", "autosubs", "chips", "scoring"] as const;
type TocKey = (typeof TOC_KEYS)[number];

const SECTION_ICONS: Record<TocKey, (p: { className?: string }) => React.ReactNode> = {
  squad: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6M16 5.2a3 3 0 0 1 0 5.6M22 20c0-2.7-2-5-5-5.8" strokeLinecap="round" />
    </svg>
  ),
  lineup: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 9v12" strokeLinecap="round" />
    </svg>
  ),
  captain: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M12 3l2.2 4.9 5.4.6-4 3.7 1.1 5.3L12 14.9 7.3 17.5l1.1-5.3-4-3.7 5.4-.6L12 3Z" strokeLinejoin="round" />
    </svg>
  ),
  transfers: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M7 4 3 8l4 4M3 8h13M17 12l4 4-4 4M21 16H8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  autosubs: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M17 2l4 4-4 4M21 6H8a5 5 0 0 0-5 5v1M7 22l-4-4 4-4M3 18h13a5 5 0 0 0 5-5v-1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  chips: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 14h2" strokeLinecap="round" />
    </svg>
  ),
  scoring: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M5 20V10M12 20V4M19 20v-6" strokeLinecap="round" />
    </svg>
  ),
};

export function RulesBoard() {
  const t = useTranslations("rules");
  const tPos = useTranslations("positions");
  const [active, setActive] = useState<TocKey>("squad");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    function onScroll() {
      const pos = window.scrollY + 140;
      let current: TocKey = TOC_KEYS[0];
      for (const key of TOC_KEYS) {
        const el = sectionRefs.current[key];
        if (el && el.offsetTop <= pos) current = key;
      }
      setActive(current);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const bold = { b: (chunks: React.ReactNode) => <b className="text-chalk-50 font-semibold">{chunks}</b> };

  return (
    <div>
      <div className="pb-3 mb-1 border-b border-navy-700">
        <h1 className="font-display text-2xl sm:text-[30px]">{t("title")}</h1>
        <p className="text-slate-400 text-sm sm:text-[14.5px] max-w-[62ch] leading-relaxed mt-1.5">
          {t("intro")}
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 lg:items-start">
        <nav
          className="lg:sticky lg:top-4 flex lg:flex-col gap-0.5 overflow-x-auto lg:overflow-visible
                     sticky top-0 z-10 -mx-3 sm:-mx-7 lg:mx-0 px-3 sm:px-7 lg:px-1.5 py-2 lg:py-1.5
                     bg-navy-950/90 lg:bg-navy-800 backdrop-blur lg:backdrop-blur-none
                     border-b lg:border border-navy-700 lg:rounded-[10px] lg:flex-none lg:w-40"
        >
          {TOC_KEYS.map((key) => {
            const Icon = SECTION_ICONS[key];
            return (
              <a
                key={key}
                href={`#${key}`}
                className={`flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold px-2 py-1.5 rounded-[7px] transition-colors ${
                  active === key
                    ? "bg-navy-950 text-gold-300 lg:ring-1 lg:ring-navy-600"
                    : "text-slate-300 hover:text-chalk-50 hover:bg-navy-700"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${active === key ? "text-gold-300" : "text-slate-500"}`} />
                {t(`toc.${key}`)}
              </a>
            );
          })}
        </nav>

        <main className="flex-1 min-w-0 flex flex-col gap-3.5 mt-3 lg:mt-0">
          {/* 01 — Sastav tima */}
          <section
            id="squad"
            ref={(el) => {
              sectionRefs.current.squad = el;
            }}
            className="scroll-mt-4 bg-navy-800 border border-navy-700 rounded-[14px] p-5"
          >
            <SectionHeading n="01" title={t("squad.title")} />
            <p className="text-slate-400 text-[13.5px] leading-relaxed max-w-[68ch] mb-4">
              {t("squad.sub", { size: SQUAD_SIZE, budget: BUDGET_TOTAL.toFixed(0) })}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-1">
              <Fact value={String(SQUAD_SIZE)} label={t("squad.factPlayers")} />
              <Fact value={`${BUDGET_TOTAL.toFixed(1)}M`} label={t("squad.factBudget")} />
              <Fact value={String(MAX_PLAYERS_PER_CLUB)} label={t("squad.factMaxClub")} />
            </div>
            <RuleList
              items={[
                t.rich("squad.rule1", {
                  ...bold,
                  gk: SQUAD_COMPOSITION.GK,
                  def: SQUAD_COMPOSITION.DEF,
                  mid: SQUAD_COMPOSITION.MID,
                  fwd: SQUAD_COMPOSITION.FWD,
                }),
                t.rich("squad.rule2", { ...bold, size: SQUAD_SIZE }),
                t.rich("squad.rule3", { ...bold, max: MAX_PLAYERS_PER_CLUB }),
                t.rich("squad.rule4", bold),
              ]}
            />
          </section>

          {/* 02 — Postava */}
          <section
            id="lineup"
            ref={(el) => {
              sectionRefs.current.lineup = el;
            }}
            className="scroll-mt-4 bg-navy-800 border border-navy-700 rounded-[14px] p-5"
          >
            <SectionHeading n="02" title={t("lineup.title")} />
            <p className="text-slate-400 text-[13.5px] leading-relaxed max-w-[68ch] mb-3.5">
              {t("lineup.sub", { size: SQUAD_SIZE, starting: STARTING_XI_SIZE, bench: BENCH_SIZE })}
            </p>
            <div className="flex flex-wrap gap-2 mb-1">
              <PosBadge short={tPos("shortGK")} range="1" label={t("lineup.gkLabel")} />
              <PosBadge
                short={tPos("shortDEF")}
                range={`${STARTING_XI_BOUNDS.DEF[0]}–${STARTING_XI_BOUNDS.DEF[1]}`}
                label={t("lineup.defLabel")}
              />
              <PosBadge
                short={tPos("shortMID")}
                range={`${STARTING_XI_BOUNDS.MID[0]}–${STARTING_XI_BOUNDS.MID[1]}`}
                label={t("lineup.midLabel")}
              />
              <PosBadge
                short={tPos("shortFWD")}
                range={`${STARTING_XI_BOUNDS.FWD[0]}–${STARTING_XI_BOUNDS.FWD[1]}`}
                label={t("lineup.fwdLabel")}
              />
            </div>
            <RuleList
              items={[
                t.rich("lineup.rule1", { ...bold, bench: BENCH_SIZE }),
                t.rich("lineup.rule2", bold),
                t.rich("lineup.rule3", bold),
              ]}
            />
          </section>

          {/* 03 — Kapiten */}
          <section
            id="captain"
            ref={(el) => {
              sectionRefs.current.captain = el;
            }}
            className="scroll-mt-4 bg-navy-800 border border-navy-700 rounded-[14px] p-5"
          >
            <SectionHeading n="03" title={t("captain.title")} />
            <p className="text-slate-400 text-[13.5px] leading-relaxed max-w-[68ch] mb-4">{t("captain.sub")}</p>
            <RuleList
              items={[
                t.rich("captain.rule1", bold),
                t.rich("captain.rule2", bold),
                t.rich("captain.rule3", bold),
                t.rich("captain.rule4", bold),
              ]}
            />
          </section>

          {/* 04 — Transferi */}
          <section
            id="transfers"
            ref={(el) => {
              sectionRefs.current.transfers = el;
            }}
            className="scroll-mt-4 bg-navy-800 border border-navy-700 rounded-[14px] p-5"
          >
            <SectionHeading n="04" title={t("transfers.title")} />
            <p className="text-slate-400 text-[13.5px] leading-relaxed max-w-[68ch] mb-4">{t("transfers.sub")}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-1">
              <Fact value={t("transfers.factFreeValue")} label={t("transfers.factFreeLabel")} />
              <Fact value={String(FREE_TRANSFERS_MAX)} label={t("transfers.factMaxLabel")} />
              <Fact value={String(EXTRA_TRANSFER_COST)} label={t("transfers.factCostLabel")} />
            </div>
            <RuleList
              items={[
                t.rich("transfers.rule1", { ...bold, max: FREE_TRANSFERS_MAX }),
                t.rich("transfers.rule2", { ...bold, cost: EXTRA_TRANSFER_COST }),
                t.rich("transfers.rule3", bold),
              ]}
            />
          </section>

          {/* 05 — Auto-zamene */}
          <section
            id="autosubs"
            ref={(el) => {
              sectionRefs.current.autosubs = el;
            }}
            className="scroll-mt-4 bg-navy-800 border border-navy-700 rounded-[14px] p-5"
          >
            <SectionHeading n="05" title={t("autosubs.title")} />
            <p className="text-slate-400 text-[13.5px] leading-relaxed max-w-[68ch] mb-4">{t("autosubs.sub")}</p>
            <RuleList
              items={[
                t.rich("autosubs.rule1", bold),
                t.rich("autosubs.rule2", bold),
                t.rich("autosubs.rule3", bold),
                t.rich("autosubs.rule4", bold),
              ]}
            />
          </section>

          {/* 06 — Čipovi */}
          <section
            id="chips"
            ref={(el) => {
              sectionRefs.current.chips = el;
            }}
            className="scroll-mt-4 bg-navy-800 border border-navy-700 rounded-[14px] p-5"
          >
            <SectionHeading n="06" title={t("chips.title")} />
            <p className="text-slate-400 text-[13.5px] leading-relaxed max-w-[68ch] mb-4">
              {t.rich("chips.sub", bold)}
            </p>
            <div className="grid sm:grid-cols-2 gap-2.5">
              <ChipCard nameKey="tripleCaptainName" descKey="tripleCaptainBlurb" mult="×3" />
              <ChipCard nameKey="favoriteClubName" descKey="favoriteClubBlurb" mult="×2" />
              <ChipCard nameKey="joker1Name" descKey="joker1Blurb" mult="∞" muted />
              <ChipCard nameKey="joker2Name" descKey="joker2Blurb" mult="∞" muted />
            </div>
            <p className="text-slate-500 text-xs mt-3">{t("chips.footer")}</p>
          </section>

          {/* 07 — Bodovanje */}
          <section
            id="scoring"
            ref={(el) => {
              sectionRefs.current.scoring = el;
            }}
            className="scroll-mt-4 bg-navy-800 border border-navy-700 rounded-[14px] p-5"
          >
            <SectionHeading n="07" title={t("scoring.title")} />
            <p className="text-slate-400 text-[13.5px] leading-relaxed max-w-[68ch] mb-1">{t("scoring.sub")}</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse mt-1.5 text-[13.5px]">
                <thead>
                  <tr>
                    <Th>{t("scoring.colEvent")}</Th>
                    <Th>{t("scoring.colPoints")}</Th>
                    <Th className="hidden sm:table-cell">{t("scoring.colPosition")}</Th>
                    <Th>{t("scoring.colNote")}</Th>
                  </tr>
                </thead>
                <tbody>
                  <ScoreRow
                    event={t("scoring.minutesShort.event")}
                    points="+1"
                    tone="pos"
                    positions={[]}
                    note={t("scoring.minutesShort.note")}
                    tPos={tPos}
                  />
                  <ScoreRow
                    event={t("scoring.minutesLong.event")}
                    points="+2"
                    tone="pos"
                    positions={[]}
                    note={t("scoring.minutesLong.note")}
                    tPos={tPos}
                  />
                  <ScoreRow
                    event={t("scoring.goal.event")}
                    points={`+${GOAL_POINTS.GK} / +${GOAL_POINTS.MID} / +${GOAL_POINTS.FWD}`}
                    tone="pos"
                    positions={["GK", "DEF", "MID", "FWD"]}
                    note={t("scoring.goal.note", { gk: GOAL_POINTS.GK, mid: GOAL_POINTS.MID, fwd: GOAL_POINTS.FWD })}
                    tPos={tPos}
                  />
                  <ScoreRow
                    event={t("scoring.assist.event")}
                    points={`+${ASSIST_POINTS}`}
                    tone="pos"
                    positions="all"
                    note={t("scoring.assist.note")}
                    tPos={tPos}
                  />
                  <ScoreRow
                    event={t("scoring.cleanSheet.event")}
                    points={`+${CLEAN_SHEET_POINTS.GK} / +${CLEAN_SHEET_POINTS.MID} / ${CLEAN_SHEET_POINTS.FWD}`}
                    tone="pos"
                    positions={["GK", "DEF", "MID", "FWD"]}
                    note={t("scoring.cleanSheet.note", {
                      gk: CLEAN_SHEET_POINTS.GK,
                      mid: CLEAN_SHEET_POINTS.MID,
                    })}
                    tPos={tPos}
                  />
                  <ScoreRow
                    event={t("scoring.saves.event")}
                    points="+1"
                    tone="pos"
                    positions={["GK"]}
                    note={t("scoring.saves.note")}
                    tPos={tPos}
                  />
                  <ScoreRow
                    event={t("scoring.penSaved.event")}
                    points={`+${PENALTY_SAVED_POINTS}`}
                    tone="pos"
                    positions={["GK"]}
                    note={t("scoring.penSaved.note")}
                    tPos={tPos}
                  />
                  <ScoreRow
                    event={t("scoring.conceded.event")}
                    points="−1"
                    tone="neg"
                    positions={["GK", "DEF"]}
                    note={t("scoring.conceded.note")}
                    tPos={tPos}
                  />
                  <ScoreRow
                    event={t("scoring.penMissed.event")}
                    points={String(PENALTY_MISSED_POINTS)}
                    tone="neg"
                    positions="all"
                    note={t("scoring.penMissed.note")}
                    tPos={tPos}
                  />
                  <ScoreRow
                    event={t("scoring.yellow.event")}
                    points={String(YELLOW_CARD_POINTS)}
                    tone="neg"
                    positions="all"
                    note={t("scoring.yellow.note")}
                    tPos={tPos}
                  />
                  <ScoreRow
                    event={t("scoring.red.event")}
                    points={String(RED_CARD_POINTS)}
                    tone="neg"
                    positions="all"
                    note={t("scoring.red.note")}
                    tPos={tPos}
                  />
                  <ScoreRow
                    event={t("scoring.ownGoal.event")}
                    points={String(OWN_GOAL_POINTS)}
                    tone="neg"
                    positions="all"
                    note={t("scoring.ownGoal.note")}
                    tPos={tPos}
                  />
                  <ScoreRow
                    event={t("scoring.bonus.event")}
                    points="+1…+3"
                    tone="pos"
                    positions="all"
                    note={t("scoring.bonus.note")}
                    tPos={tPos}
                    last
                  />
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function SectionHeading({ n, title }: { n: string; title: string }) {
  return (
    <h2 className="flex items-baseline gap-2.5 font-display text-lg sm:text-xl mb-1">
      <span className="text-gold-300 text-sm">{n}</span>
      {title}
    </h2>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-navy-900 border border-navy-700 rounded-[10px] px-3.5 py-3">
      <div className="font-display text-[22px] text-gold-300 leading-tight tabular-nums">{value}</div>
      <div className="text-slate-400 text-xs mt-0.5">{label}</div>
    </div>
  );
}

function RuleList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2.5 mt-3.5">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex gap-2.5 text-[13.5px] text-slate-300 leading-relaxed pt-2.5 border-t border-navy-700 first:pt-0 first:border-t-0"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-gold-400 shrink-0 mt-1.5" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function PosBadge({ short, range, label }: { short: string; range: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 bg-navy-900 border border-navy-700 rounded-[10px] px-3.5 py-2.5 min-w-[76px]">
      <span className="font-display text-[11px] font-bold tracking-wide text-navy-950 bg-slate-300 px-2 py-0.5 rounded-full">
        {short}
      </span>
      <span className="font-display text-base">{range}</span>
      <span className="text-slate-500 text-[10.5px]">{label}</span>
    </div>
  );
}

function ChipCard({
  nameKey,
  descKey,
  mult,
  muted,
}: {
  nameKey: "tripleCaptainName" | "favoriteClubName" | "joker1Name" | "joker2Name";
  descKey: "tripleCaptainBlurb" | "favoriteClubBlurb" | "joker1Blurb" | "joker2Blurb";
  mult: string;
  muted?: boolean;
}) {
  const tChips = useTranslations("chips");
  return (
    <div className="bg-navy-900 border border-navy-700 rounded-xl px-4 py-3.5 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-[15px]">{tChips(nameKey)}</span>
        <span
          className={`font-display text-xs font-bold px-2 py-0.5 rounded-full ${
            muted ? "bg-navy-600 text-slate-300" : "bg-gold-400 text-navy-950"
          }`}
        >
          {mult}
        </span>
      </div>
      <p className="text-slate-400 text-[12.5px] leading-relaxed">{tChips(descKey)}</p>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`text-left font-display font-medium uppercase tracking-wide text-[11px] text-slate-500 pb-2 px-2.5 border-b border-navy-700 ${className}`}
    >
      {children}
    </th>
  );
}

function ScoreRow({
  event,
  points,
  tone,
  positions,
  note,
  tPos,
  last,
}: {
  event: string;
  points: string;
  tone: "pos" | "neg";
  positions: ("GK" | "DEF" | "MID" | "FWD")[] | "all";
  note: string;
  tPos: ReturnType<typeof useTranslations>;
  last?: boolean;
}) {
  const t = useTranslations("rules");
  const borderCls = last ? "" : "border-b border-navy-700";
  return (
    <tr>
      <td className={`px-2.5 py-2.5 text-chalk-50 font-medium ${borderCls}`}>{event}</td>
      <td
        className={`px-2.5 py-2.5 font-display font-semibold tabular-nums whitespace-nowrap ${
          tone === "pos" ? "text-pitch-400" : "text-danger-400"
        } ${borderCls}`}
      >
        {points}
      </td>
      <td className={`hidden sm:table-cell px-2.5 py-2.5 ${borderCls}`}>
        {positions === "all" && <span className="text-slate-400 text-xs">{t("scoring.posAll")}</span>}
        {positions !== "all" && positions.length === 0 && (
          <span className="text-slate-500 text-xs">{t("scoring.posNone")}</span>
        )}
        {positions !== "all" && positions.length > 0 && (
          <span className="inline-flex gap-1">
            {positions.map((p) => (
              <span
                key={p}
                className={`font-display text-[9.5px] font-bold rounded px-1 py-px ${
                  p === "GK" ? "bg-gold-300 text-navy-950" : "bg-slate-300 text-navy-950"
                }`}
              >
                {tPos(`short${p}` as "shortGK" | "shortDEF" | "shortMID" | "shortFWD")}
              </span>
            ))}
          </span>
        )}
      </td>
      <td className={`px-2.5 py-2.5 text-slate-500 text-[12.5px] ${borderCls}`}>{note}</td>
    </tr>
  );
}
