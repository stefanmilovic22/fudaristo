"use client";

import { useTranslations } from "next-intl";

/**
 * Teren — pravi fudbalski teren, ne samo zeleni okvir.
 *
 * Linije su nacrtane u SVG-u koji se rasteže preko cele površine
 * (preserveAspectRatio="none"), pa se krug oko centra blago izdužuje zajedno sa
 * kontejnerom. To je namerno: linije su na niskoj neprozirnosti i čitaju se kao
 * tekstura, a alternativa (fiksni odnos stranica) bi lomila raspored čim se
 * promeni broj redova sa dresovima.
 *
 * Pokošene trake su CSS gradijent, ne slika — ostaje oštro na svakom ekranu i
 * ne traži nijedan dodatni zahtev.
 */
export function Pitch({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-pitch-700 ring-1 ring-black/25">
      {/* Pokošene trake */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0.045) 0 56px, rgba(0,0,0,0.05) 56px 112px)",
        }}
      />

      {/* Linije terena */}
      <svg
        aria-hidden
        viewBox="0 0 100 140"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
      >
        <g fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth="0.45" vectorEffect="non-scaling-stroke">
          {/* Aut-linije */}
          <rect x="3" y="3" width="94" height="134" />
          {/* Centar */}
          <line x1="3" y1="70" x2="97" y2="70" />
          <ellipse cx="50" cy="70" rx="13" ry="13" />
          {/* Kazneni prostor — protivnički gol (gore) */}
          <rect x="24" y="3" width="52" height="20" />
          <rect x="38" y="3" width="24" height="8" />
          <path d="M 38 23 A 13 13 0 0 0 62 23" />
          {/* Kazneni prostor — naš gol (dole) */}
          <rect x="24" y="117" width="52" height="20" />
          <rect x="38" y="129" width="24" height="8" />
          <path d="M 38 117 A 13 13 0 0 1 62 117" />
          {/* Uglovi */}
          <path d="M 3 7 A 4 4 0 0 0 7 3" />
          <path d="M 93 3 A 4 4 0 0 0 97 7" />
          <path d="M 3 133 A 4 4 0 0 1 7 137" />
          <path d="M 93 137 A 4 4 0 0 1 97 133" />
        </g>
        <g fill="rgba(255,255,255,0.30)">
          <circle cx="50" cy="70" r="0.9" />
          <circle cx="50" cy="16" r="0.9" />
          <circle cx="50" cy="124" r="0.9" />
        </g>
      </svg>

      {/* Gol iza golmana.
          Crta se kao ZASEBAN SVG, ne u onom gore sa linijama terena — taj ima
          preserveAspectRatio="none" pa se rasteže sa brojem redova, a razvučena
          mreža izgleda pokvareno. Ovaj drži svoj odnos stranica. */}
      <svg
        aria-hidden
        viewBox="0 0 120 30"
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[48%] max-w-[240px] pointer-events-none"
      >
        <defs>
          <pattern id="mreza" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M6 0H0V6" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="0.7" />
          </pattern>
        </defs>
        <rect x="8" y="2" width="104" height="24" fill="url(#mreza)" />
        <path
          d="M8 26 V2 H112 V26"
          fill="none"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      {/* pt-* pravi mesta za gol iznad prvog reda (golmana) */}
      <div className="relative px-2 pt-10 pb-6 sm:px-5 sm:pt-12 sm:pb-8">{children}</div>
    </div>
  );
}

/** Jedan red igrača na terenu (linija formacije). */
export function PitchRow({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-center gap-1.5 sm:gap-4 flex-wrap">{children}</div>;
}

/** Klupa — traka ispod terena, kao na FPL-u. */
export function Bench({
  children,
  title,
  note,
}: {
  children: React.ReactNode;
  title?: string;
  note?: string;
}) {
  const t = useTranslations("pitch");
  return (
    <div className="mt-3 rounded-xl overflow-hidden ring-1 ring-black/25">
      {/* Traka zaglavlja u boji terena povezuje klupu sa terenom iznad —
          ranije je bio isti ravan pravougaonik kao bilo koja druga kartica,
          pa se nije čitalo da je deo iste celine. */}
      <div className="flex items-baseline justify-between bg-pitch-700/40 border-b border-black/25 px-4 py-2">
        <h3 className="font-display text-sm uppercase tracking-wider text-chalk-50">{title ?? t("bench")}</h3>
        {note && <span className="text-[11px] text-slate-300">{note}</span>}
      </div>
      <div className="bg-navy-800 px-3 py-4">
        <div className="flex justify-center gap-1.5 sm:gap-4 flex-wrap">{children}</div>
        <p className="text-[11px] text-slate-500 text-center mt-3">{t("benchNote")}</p>
      </div>
    </div>
  );
}
