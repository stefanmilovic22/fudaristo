"use client";

import { useTranslations } from "next-intl";
import { Pitch, PitchRow } from "@/components/Pitch";
import { POSITION_SHORT } from "@/lib/fantasy-rules";

export type TeamOfWeekPlayer = {
  id: string;
  /** Prezime (ili ime ako prezimena nema) — za pločicu ispod dresa. */
  name: string;
  /** Puno ime — za spisak ispod terena, gde pločica dresa preseče duža prezimena. */
  fullName: string;
  clubName: string;
  clubShort: string;
  clubColor: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  points: number;
};

export type TeamOfWeekData = {
  gameweekNumber: number;
  /** Tačno 11 — GK/DEF/MID/FWD u formaciji koju je selectTeamOfTheWeek izabrao. */
  players: TeamOfWeekPlayer[];
};

const POSITION_ORDER = ["GK", "DEF", "MID", "FWD"] as const;

/** Isti oblik dresa kao Jersey.tsx (nije izvezen odatle jer je taj fajl "use client" sa dosta više izvoza). */
const SHIRT_PATH =
  "M34 4 L22 8 L4 20 L14 36 L24 31 L24 70 Q50 75 76 70 L76 31 L86 36 L96 20 L78 8 L66 4 Q50 16 34 4 Z";

/** Isto pravilo kao Jersey.tsx (nije izvezeno odatle) — taman ili svetao tekst po boji kluba. */
function readableInk(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#0B1526";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? "#0B1526" : "#F4F6F8";
}

/**
 * Dres SAMO za ovaj prikaz (ne deljeni Jersey.tsx) — namerno, jer Jersey ima
 * FIKSNU usku pločicu za ime (radi na terenu za "Moj klub" gde staje 11+4
 * dresa u red), pa duža prezimena (npr. "Moutoussamy", "Chatziemmanouil")
 * tamo seku na "...". Ovde ima manje dresova po redu, pa pločica sme da bude
 * šira i da PRELOMI red umesto da seče tekst.
 */
function TeamOfWeekJersey({
  color,
  name,
  points,
  initials,
  isGoalkeeper,
}: {
  color: string;
  name: string;
  points: number;
  initials: string;
  isGoalkeeper?: boolean;
}) {
  const t = useTranslations("pitch");
  const ink = readableInk(color);
  return (
    <div className="relative flex flex-col items-center w-16 xs:w-[74px] sm:w-20">
      <div className="relative block w-11 xs:w-12 sm:w-[52px]">
        <svg viewBox="0 0 100 76" className="w-full drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]">
          <path
            d={SHIRT_PATH}
            fill={color}
            stroke={isGoalkeeper ? "#F0C868" : "rgba(255,255,255,0.35)"}
            strokeWidth={isGoalkeeper ? 4 : 2.5}
            strokeLinejoin="round"
            strokeDasharray={isGoalkeeper ? "7 4" : undefined}
          />
          <text x="50" y="52" textAnchor="middle" fontSize="20" fontWeight="700" fill={ink} opacity="0.85">
            {initials}
          </text>
        </svg>

        {/* Isti "GK" indikator kao Jersey.tsx — boja kluba je ista za sve
            igrače, pa isprekidana ivica sama nije dovoljna kad je slika sitna. */}
        {isGoalkeeper && (
          <span
            title={t("goalkeeper")}
            aria-hidden
            className="absolute -top-1 -left-1 w-3.5 h-3.5 rounded-full bg-gold-400 text-navy-950 text-[8px] font-bold grid place-items-center ring-2 ring-navy-950"
          >
            GK
          </span>
        )}
      </div>
      <div className="w-full mt-1 rounded-t-[3px] bg-chalk-50 text-navy-950 text-[10px] font-semibold leading-tight px-1 py-[2px] text-center break-words">
        {name}
      </div>
      <div className="w-full rounded-b-[3px] bg-navy-950/85 text-chalk-50 text-[10px] leading-tight px-1 py-[2px] text-center">
        {points}
      </div>
    </div>
  );
}

/**
 * "Tim kola" — po uzoru na FPL: najbolji sastav CELE lige za jedno kolo, ne
 * sastav nijednog konkretnog korisnika. Čisto informativan prikaz (bez klika).
 */
export function TeamOfWeekBoard({ data }: { data: TeamOfWeekData }) {
  const t = useTranslations("stats");
  const rows = POSITION_ORDER.map((pos) => data.players.filter((p) => p.position === pos)).filter(
    (row) => row.length > 0
  );
  // Formacija se piše bez golmana (konvencija "4-3-3", isto kao svuda drugde
  // u aplikaciji) — DEF-MID-FWD brojevi po poziciji.
  const formation = POSITION_ORDER.slice(1)
    .map((pos) => data.players.filter((p) => p.position === pos).length)
    .join("-");

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <p className="text-slate-400 text-sm">{t("teamOfWeekSubtitle", { number: data.gameweekNumber })}</p>
        <span className="text-xs font-display bg-navy-800 border border-navy-600 rounded-full px-2.5 py-1 text-slate-300">
          {t("teamOfWeekFormation", { formation })}
        </span>
      </div>

      <Pitch>
        <div className="flex flex-col gap-2 xs:gap-3 sm:gap-4">
          {rows.map((row, i) => (
            <PitchRow key={i}>
              {row.map((p) => (
                <TeamOfWeekJersey
                  key={p.id}
                  color={p.clubColor}
                  name={p.name}
                  points={p.points}
                  initials={p.clubShort}
                  isGoalkeeper={p.position === "GK"}
                />
              ))}
            </PitchRow>
          ))}
        </div>
      </Pitch>

      {/* Pun spisak ispod terena — sa pozicijom, da se vidi ceo raspored bez
          oslanjanja samo na pločicu dresa. */}
      <div className="mt-3 bg-navy-800 border border-navy-600 rounded-lg p-4">
        <ol className="flex flex-col">
          {rows.flat().map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 py-2 border-t border-navy-700 first:border-t-0"
            >
              <span
                className="text-[10px] font-bold tracking-wide text-navy-950 bg-slate-300 px-1.5 py-0.5 rounded-full shrink-0"
                aria-hidden
              >
                {POSITION_SHORT[p.position]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{p.fullName}</div>
                <div className="text-xs text-slate-500 truncate">{p.clubName}</div>
              </div>
              <span className="font-display font-bold tabular-nums whitespace-nowrap">{p.points}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
