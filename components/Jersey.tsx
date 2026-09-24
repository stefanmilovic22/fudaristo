"use client";

import { useTranslations } from "next-intl";

/**
 * Dres — osnovna vizuelna jedinica terena, po uzoru na FPL.
 *
 * Dva režima:
 *  - `compact` (samo početna strana, dekorativno) — nepromenjeno, jednobojan
 *    oblik bez okvira, videti app/[locale]/page.tsx.
 *  - puna veličina (Moj tim, teren, klupa, squad builder, javni pregled tima)
 *    — dres, ime i klub su zajedno u jednom uokvirenom kartončiću, po uzoru
 *    na FPL. Klub može imati pravu fotografiju dresa (`photoUrl`, videti
 *    clubs.jersey_photo_url) — kad je nema, ostaje jednobojan vektorski oblik
 *    kao i danas, samo unutar istog okvira.
 *
 * Veličina punog dresa ide u dva koraka (64px do `sm`, 82px od `sm`) —
 * namerno, ne proizvoljno: red od 5 igrača (najviše dozvoljeno za DEF/MID,
 * videti STARTING_XI_BOUNDS) na 82px ne staje ni na 400px širokom telefonu.
 * 64px staje sa rezervom čak i na najužem ciljanom telefonu (375px, iPhone SE).
 */

const SHIRT_PATH =
  "M34 4 L22 8 L4 20 L14 36 L24 31 L24 70 Q50 75 76 70 L76 31 L86 36 L96 20 L78 8 L66 4 Q50 16 34 4 Z";

/** Da li tekst na ovoj boji treba da bude taman ili svetao. */
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

export type JerseyProps = {
  color?: string;
  /** Prava fotografija dresa kluba (clubs.jersey_photo_url). Bez nje — vektor. */
  photoUrl?: string | null;
  /** Prezime na pločici ispod dresa. */
  name?: string;
  /** Druga pločica — cena, poeni, ili šta god je relevantno. */
  detail?: string;
  initials?: string;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  /** Prikazuje crveni indikator (povreda, suspenzija...). */
  flag?: string | null;
  /** Golman nosi drugačiji dres od saigrača — i u stvarnosti i ovde. */
  isGoalkeeper?: boolean;
  /** Kratka oznaka pozicije iznad dresa (koristi se na klupi). */
  positionLabel?: string;
  /** Vizuelno istaknut — npr. izabran za zamenu. */
  active?: boolean;
  /** Prigušen — npr. ne može da uđe u zamenu sa aktivnim igračem. */
  dimmed?: boolean;
  /** Manji, potpuno nepromenjen dekorativni dres — videti komentar iznad. */
  compact?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
  onCaptain?: () => void;
  onViceCaptain?: () => void;
};

export function Jersey({
  color = "#8494AC",
  photoUrl,
  name,
  detail,
  initials,
  isCaptain,
  isViceCaptain,
  flag,
  isGoalkeeper,
  positionLabel,
  active,
  dimmed,
  compact,
  onRemove,
  onClick,
  onCaptain,
  onViceCaptain,
}: JerseyProps) {
  const t = useTranslations("pitch");
  const ink = readableInk(color);

  // --- Compact: samo dekorativni dresovi na početnoj strani, nepromenjeno. --
  if (compact) {
    return (
      <div
        className={`relative w-[38px] xs:w-[44px] sm:w-[48px] md:w-[52px] flex flex-col items-center transition-opacity ${
          dimmed ? "opacity-35" : ""
        }`}
      >
        {positionLabel && (
          <span className="mb-1 text-[8px] font-bold uppercase tracking-wider text-slate-400">
            {positionLabel}
          </span>
        )}

        <button
          type="button"
          onClick={onClick}
          disabled={!onClick}
          aria-label={name ? `${name}${detail ? `, ${detail}` : ""}` : t("player")}
          className={`relative block w-[30px] xs:w-[34px] sm:w-[38px] md:w-[40px] rounded-md transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 ${
            onClick ? "hover:-translate-y-0.5 cursor-pointer" : "cursor-default"
          } ${active ? "-translate-y-1" : ""}`}
        >
          <svg viewBox="0 0 100 76" className="w-full drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]">
            <path
              d={SHIRT_PATH}
              fill={color}
              stroke={isGoalkeeper ? "#F0C868" : "rgba(255,255,255,0.35)"}
              strokeWidth={isGoalkeeper ? 4 : 2.5}
              strokeLinejoin="round"
              strokeDasharray={isGoalkeeper ? "7 4" : undefined}
            />
            {initials && (
              <text x="50" y="52" textAnchor="middle" fontSize="15" fontWeight="700" fill={ink} opacity="0.85">
                {initials}
              </text>
            )}
          </svg>
          {active && <span className="absolute inset-x-0 -bottom-1 h-0.5 rounded-full bg-gold-400" />}
        </button>

        {isGoalkeeper && (
          <span
            title={t("goalkeeper")}
            aria-hidden
            className="absolute -top-1 -left-1 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-gold-400 text-navy-950 text-[8px] font-bold grid place-items-center ring-2 ring-navy-950"
          >
            GK
          </span>
        )}

        {isCaptain && <Armband label="C" tone="gold" size="w-3.5 h-3.5 sm:w-4 sm:h-4" text="text-[8px]" />}
        {!isCaptain && isViceCaptain && (
          <Armband label="V" tone="chalk" size="w-3.5 h-3.5 sm:w-4 sm:h-4" text="text-[8px]" />
        )}

        {flag && (
          <span
            title={flag}
            className="absolute top-0 left-0 w-3 h-3 rounded-full bg-danger-400 border-2 border-navy-950"
          />
        )}

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={name ? t("remove", { name }) : t("removeGeneric")}
            className="absolute -top-1.5 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-navy-950 border border-slate-500 text-slate-300 text-[8px] leading-none flex items-center justify-center hover:bg-danger-400 hover:text-chalk-50 hover:border-danger-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300"
          >
            ×
          </button>
        )}

        <div className="w-full mt-1 rounded-t-[3px] bg-chalk-50 text-navy-950 text-[8px] font-semibold leading-tight px-0.5 py-[1px] text-center truncate">
          {name ?? "—"}
        </div>
        <div className="w-full rounded-b-[3px] bg-navy-950/85 text-chalk-50 text-[8px] leading-tight px-0.5 py-[1px] text-center truncate">
          {detail ?? ""}
        </div>

        {(onCaptain || onViceCaptain) && (
          <div className="flex gap-1 mt-0.5">
            {onCaptain && (
              <button
                type="button"
                onClick={onCaptain}
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full text-[8px] font-bold border transition-colors ${
                  isCaptain
                    ? "bg-gold-400 text-navy-950 border-gold-400"
                    : "bg-navy-800/80 text-slate-300 border-navy-600 hover:border-gold-400"
                }`}
                title="Kapiten"
              >
                C
              </button>
            )}
            {onViceCaptain && (
              <button
                type="button"
                onClick={onViceCaptain}
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full text-[8px] font-bold border transition-colors ${
                  isViceCaptain
                    ? "bg-chalk-50 text-navy-950 border-chalk-50"
                    : "bg-navy-800/80 text-slate-300 border-navy-600 hover:border-chalk-50"
                }`}
                title="Vice-kapiten"
              >
                V
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // --- Puna veličina: dres + ime + klub zajedno u jednom okviru. ------------
  return (
    <div
      className={`relative w-[64px] sm:w-[82px] flex flex-col items-center transition-opacity ${
        dimmed ? "opacity-35" : ""
      }`}
    >
      {positionLabel && (
        <span className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
          {positionLabel}
        </span>
      )}

      <div className="relative w-full rounded-[9px] bg-white/[0.07] border border-white/10 pt-[5px] shadow-[0_3px_8px_rgba(0,0,0,0.25)]">
        <button
          type="button"
          onClick={onClick}
          disabled={!onClick}
          aria-label={name ? `${name}${detail ? `, ${detail}` : ""}` : t("player")}
          className={`relative flex justify-center w-full rounded-md transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 ${
            onClick ? "hover:-translate-y-0.5 cursor-pointer" : "cursor-default"
          } ${active ? "-translate-y-1" : ""}`}
        >
          {photoUrl ? (
            // Fotografija se NE seče u SHIRT_PATH siluetu (probano — deo dresa
            // nestaje i izgleda kao greška). Umesto toga fiksna visina
            // (overflow-hidden) blago odseca dno, dovoljno tesno da kartončić
            // ostane nizak koliko i vektorski dres pored njega.
            <div
              className={`w-[45px] h-[49px] sm:w-[58px] sm:h-[63px] overflow-hidden drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)] ${
                isGoalkeeper ? "border-2 border-dashed border-gold-300" : ""
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- spoljni URL po klubu, next/image domenska bela lista nepotrebna komplikacija za ovoliko slika */}
              <img src={photoUrl} alt="" className="w-full h-auto block" />
            </div>
          ) : (
            <svg viewBox="0 0 100 76" className="w-[45px] sm:w-[58px] drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]">
              <path
                d={SHIRT_PATH}
                fill={color}
                stroke={isGoalkeeper ? "#F0C868" : "rgba(255,255,255,0.35)"}
                strokeWidth={isGoalkeeper ? 4 : 2.5}
                strokeLinejoin="round"
                strokeDasharray={isGoalkeeper ? "7 4" : undefined}
              />
              {initials && (
                <text x="50" y="52" textAnchor="middle" fontSize="22" fontWeight="700" fill={ink} opacity="0.85">
                  {initials}
                </text>
              )}
            </svg>
          )}
          {active && <span className="absolute inset-x-0 -bottom-1 h-0.5 rounded-full bg-gold-400" />}
        </button>

        {isGoalkeeper && (
          <span
            title={t("goalkeeper")}
            aria-hidden
            className="absolute -top-1.5 left-0.5 w-4 h-4 rounded-full bg-gold-400 text-navy-950 text-[8px] font-bold grid place-items-center ring-2 ring-navy-950"
          >
            GK
          </span>
        )}

        {isCaptain && <Armband label="C" tone="gold" size="w-4 h-4" text="text-[8px]" />}
        {!isCaptain && isViceCaptain && <Armband label="V" tone="chalk" size="w-4 h-4" text="text-[8px]" />}

        {flag && (
          <span
            title={flag}
            className="absolute top-0 left-0 w-3 h-3 rounded-full bg-danger-400 border-2 border-navy-950"
          />
        )}

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={name ? t("remove", { name }) : t("removeGeneric")}
            className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-navy-950 border border-slate-500 text-slate-300 text-[10px] leading-none flex items-center justify-center hover:bg-danger-400 hover:text-chalk-50 hover:border-danger-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300"
          >
            ×
          </button>
        )}

        <div className="w-full mt-1 bg-chalk-50 text-navy-950 text-[9px] font-semibold leading-tight px-1 py-[2px] text-center truncate">
          {name ?? "—"}
        </div>
        <div className="w-full rounded-b-[8px] bg-navy-950/[0.88] text-chalk-50 text-[8.5px] leading-tight px-1 py-[2px] text-center truncate">
          {detail ?? ""}
        </div>
      </div>

      {(onCaptain || onViceCaptain) && (
        <div className="flex gap-1 mt-1.5">
          {onCaptain && (
            <button
              type="button"
              onClick={onCaptain}
              className={`w-[18px] h-[18px] rounded-full text-[9px] font-bold border transition-colors ${
                isCaptain
                  ? "bg-gold-400 text-navy-950 border-gold-400"
                  : "bg-navy-800/80 text-slate-300 border-navy-600 hover:border-gold-400"
              }`}
              title="Kapiten"
            >
              C
            </button>
          )}
          {onViceCaptain && (
            <button
              type="button"
              onClick={onViceCaptain}
              className={`w-[18px] h-[18px] rounded-full text-[9px] font-bold border transition-colors ${
                isViceCaptain
                  ? "bg-chalk-50 text-navy-950 border-chalk-50"
                  : "bg-navy-800/80 text-slate-300 border-navy-600 hover:border-chalk-50"
              }`}
              title="Vice-kapiten"
            >
              V
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Armband({
  label,
  tone,
  size,
  text,
}: {
  label: string;
  tone: "gold" | "chalk";
  size: string;
  text: string;
}) {
  return (
    <span
      className={`absolute -top-1.5 -left-1 ${size} rounded-full ${text} font-bold flex items-center justify-center border-2 border-navy-950 ${
        tone === "gold" ? "bg-gold-400 text-navy-950" : "bg-chalk-50 text-navy-950"
      }`}
    >
      {label}
    </span>
  );
}

/** Prazno mesto na terenu — klik otvara izbor igrača za tu poziciju. */
export function EmptySlot({
  label,
  onAdd,
  highlighted,
}: {
  label: string;
  onAdd: () => void;
  highlighted?: boolean;
}) {
  const t = useTranslations("pitch");
  return (
    <div className="w-[64px] sm:w-[82px] flex flex-col items-center">
      <div className="relative w-full rounded-[9px] bg-white/[0.07] border border-white/10 pt-[5px] shadow-[0_3px_8px_rgba(0,0,0,0.25)]">
        <button
          type="button"
          onClick={onAdd}
          aria-label={t("add", { label })}
          className="flex justify-center w-full rounded-md transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300"
        >
          <svg viewBox="0 0 100 76" className="w-[45px] sm:w-[58px]">
            <path
              d={SHIRT_PATH}
              fill="rgba(11,21,38,0.35)"
              stroke={highlighted ? "#E8B33D" : "rgba(244,246,248,0.5)"}
              strokeWidth="2.5"
              strokeDasharray="6 5"
              strokeLinejoin="round"
            />
            <text
              x="50"
              y="52"
              textAnchor="middle"
              fontSize="30"
              fontWeight="300"
              fill={highlighted ? "#E8B33D" : "rgba(244,246,248,0.75)"}
            >
              +
            </text>
          </svg>
        </button>

        {/* Dve pločice, kao kod popunjenog dresa — da se redovi na terenu poklapaju. */}
        <div
          className={`w-full mt-1 text-[9px] font-semibold leading-tight px-1 py-[2px] text-center truncate ${
            highlighted ? "bg-gold-400/25 text-gold-300" : "bg-navy-950/55 text-slate-400"
          }`}
        >
          {label}
        </div>
        <div className="w-full rounded-b-[8px] bg-navy-950/35 text-slate-500 text-[8.5px] leading-tight px-1 py-[2px] text-center">
          prazno
        </div>
      </div>
    </div>
  );
}
