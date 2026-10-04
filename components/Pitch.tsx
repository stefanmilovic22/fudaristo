"use client";

import { useTranslations } from "next-intl";

/**
 * Teren u duhu Agia Sofia Arene (OPAP Arena, stadion AEK-a u Atini).
 *
 * Preuzeto: tamna, gotovo crna tribina koja uokviruje travu, uska žuta linija
 * na prelazu sa tribine na teren, i reklamna traka iza gola. Stadion je iznutra
 * crno-žut, a ta dva tona su već u paleti (navy i gold), pa se uklapa bez novih
 * boja.
 *
 * Namerno NIJE doslovna rekonstrukcija: teren je pozadina za dresove, i sve što
 * povuče pažnju na sebe otima je od igrača. Tribina je zato jednobojna sa
 * blagim šarom, bez sedišta u boji i bez natpisa.
 */
export function Pitch({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-xl overflow-hidden ring-1 ring-black/40 bg-[#0A0D12]">
      {/* Tribina — okvir oko travnjaka */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(115deg, rgba(255,255,255,0.028) 0 3px, transparent 3px 7px)",
        }}
      />

      <Goal />

      {/* Travnjak. Gornji razmak nosi gol i reklame.
          Boja trave namerno NIJE u pitch-* tokenima iz tailwind.config.ts —
          taj isti "pitch" naziv već nosi posve drugo značenje na drugim
          mestima (text-pitch-400 = zelena za "pozitivnu" vrednost u
          statistici/tabeli/rasporisu poena, videti PlayerPointsBreakdownPopover,
          liga/standings-table, pravila). Da su travu i taj semantički zeleni
          ton delili isti token, promena boje trave bi nehotice prefarbala i
          sve te brojeve — zato su boje trave ovde direktne heksadecimalne
          vrednosti, van deljene palete. */}
      <div className="relative mx-1.5 mb-1.5 mt-[56px] xs:mx-2 xs:mb-2 xs:mt-[68px] sm:mx-3 sm:mb-3 sm:mt-[84px] rounded-lg overflow-hidden ring-1 ring-gold-400/25">
        <GrassTexture />

        <svg
          aria-hidden
          viewBox="0 0 100 140"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          <g
            fill="none"
            stroke="#F2F3E8"
            strokeWidth="0.45"
            vectorEffect="non-scaling-stroke"
          >
            <rect x="3" y="3" width="94" height="134" />
            <line x1="3" y1="70" x2="97" y2="70" />
            <ellipse cx="50" cy="70" rx="13" ry="13" />
            <rect x="24" y="3" width="52" height="20" />
            <rect x="38" y="3" width="24" height="8" />
            <path d="M 38 23 A 13 13 0 0 0 62 23" />
            <rect x="24" y="117" width="52" height="20" />
            <rect x="38" y="129" width="24" height="8" />
            <path d="M 38 117 A 13 13 0 0 1 62 117" />
            <path d="M 3 7 A 4 4 0 0 0 7 3" />
            <path d="M 93 3 A 4 4 0 0 0 97 7" />
            <path d="M 3 133 A 4 4 0 0 1 7 137" />
            <path d="M 93 137 A 4 4 0 0 1 97 133" />
          </g>
          <g fill="#F2F3E8">
            <circle cx="50" cy="70" r="0.9" />
            <circle cx="50" cy="16" r="0.9" />
            <circle cx="50" cy="124" r="0.9" />
          </g>
        </svg>

        {/* pb je namerno velik: poslednji red (napad) nosi pločice sa imenom i
            poenima ISPOD dresa, a one su ranije izlazile iz okvira terena. */}
        <div className="relative px-1 pt-4 pb-7 xs:px-2 sm:px-5 sm:pt-6 sm:pb-10">{children}</div>
      </div>
    </div>
  );
}

/**
 * Trava — 10 vodoravnih redova (naizmenično svetao/taman = pokošene pruge),
 * svaki podeljen na 8 kolona sa blago različitom nijansom (neparno/parno) —
 * ista tehnika i iste boje kao referentni HTML koji je poslao korisnik.
 * Kontrast red-na-red nosi pruge; kontrast kolona unutar reda je namerno
 * suptilan (samo par nijansi razlike), da se ne pretvori u šahovnicu —
 * ranija verzija sa jednakim kontrastom u oba pravca je upravo to i uradila.
 */
function GrassTexture() {
  const rows = 10;
  const cols = 8;
  const LIGHT_ODD = "#8FD957";
  const LIGHT_EVEN = "#82CC4D";
  const DARK_ODD = "#6FBA42";
  const DARK_EVEN = "#62AA3A";

  return (
    <div aria-hidden className="absolute inset-0 flex flex-col overflow-hidden" style={{ background: "#70BD3F" }}>
      {Array.from({ length: rows }).map((_, r) => {
        const dark = r % 2 === 1;
        return (
          <div key={r} className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cols }).map((__, c) => {
              const odd = c % 2 === 0; // c=0 je 1. dete → CSS nth-child(odd)
              const color = dark ? (odd ? DARK_ODD : DARK_EVEN) : odd ? LIGHT_ODD : LIGHT_EVEN;
              return <div key={c} style={{ background: color }} />;
            })}
          </div>
        );
      })}
      {/* Sitna vodoravna tekstura + blaga promena osvetljenja po dijagonali —
          isti recept kao u referentnom fajlu. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0, transparent 5px, rgba(255,255,255,0.025) 6px), linear-gradient(105deg, rgba(255,255,255,0.08), transparent 25%, rgba(0,0,0,0.035) 70%, rgba(255,255,255,0.04))",
          mixBlendMode: "soft-light",
        }}
      />
    </div>
  );
}

/**
 * Gol iza golmana.
 *
 * Crta se kao zaseban SVG sa fiksnim odnosom stranica, ne u onom sa linijama
 * terena — taj ima preserveAspectRatio="none" pa se rasteže sa brojem redova, a
 * razvučena mreža izgleda pokvareno.
 */
function Goal() {
  return (
    <div aria-hidden className="absolute inset-x-0 top-0 h-[56px] xs:h-[68px] sm:h-[84px] pointer-events-none">
      <svg
        viewBox="0 0 120 40"
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[46%] max-w-[230px]"
      >
        <defs>
          <pattern id="mreza" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M6 0H0V6" fill="none" stroke="rgba(255,255,255,0.34)" strokeWidth="0.7" />
          </pattern>
        </defs>
        <rect x="8" y="4" width="104" height="34" fill="rgba(10,13,18,0.45)" />
        <rect x="8" y="4" width="104" height="34" fill="url(#mreza)" />
        <path
          d="M8 38 V4 H112 V38"
          fill="none"
          stroke="rgba(255,255,255,0.92)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/** Jedan red igrača na terenu (linija formacije). */
export function PitchRow({ children }: { children: React.ReactNode }) {
  // flex-nowrap na telefonu: red formacije NE sme da se prelomi — pet
  // odbrambenih u dva reda više ne liči na 5-3-2. Dresovi se već smanjuju
  // dovoljno da stanu, a min-w-0 dozvoljava da se skupe ako zatreba.
  return (
    <div className="flex justify-center gap-1 xs:gap-1.5 sm:gap-4 flex-nowrap sm:flex-wrap">
      {children}
    </div>
  );
}

/**
 * Klupa — traka ispod terena, kao na FPL-u.
 *
 * Golman se prikazuje odvojeno, iza crte. Njegovo mesto u nizu NIJE redosled
 * ulaska: golmana može zameniti samo drugi golman, pa njegov squad_order ne
 * učestvuje u prioritetu auto-sub-a. Igrači iz polja su numerisani 1-2-3 i to
 * jesu stvarni redovi ulaska. Ranije su svi stajali u istom nizu, pa je golman
 * na prvom mestu izgledao kao „prvi na redu za ulazak”, što nije tačno.
 */
export function Bench({
  children,
  goalkeeper,
  title,
  note,
}: {
  children: React.ReactNode;
  goalkeeper?: React.ReactNode;
  title?: string;
  note?: string;
}) {
  const t = useTranslations("pitch");
  return (
    <div className="mt-3 rounded-xl overflow-hidden ring-1 ring-black/25">
      <div className="flex items-baseline justify-between bg-pitch-700/40 border-b border-black/25 px-4 py-2">
        <h3 className="font-display text-sm uppercase tracking-wider text-chalk-50">
          {title ?? t("bench")}
        </h3>
        {note && <span className="text-[11px] text-slate-300">{note}</span>}
      </div>

      <div className="bg-navy-800 px-2 py-3 sm:px-3 sm:py-4">
        <div className="flex justify-center items-start gap-1 xs:gap-1.5 sm:gap-4 flex-wrap">
          {goalkeeper && (
            <>
              {goalkeeper}
              <div
                aria-hidden
                className="self-stretch w-px bg-navy-600 mx-1 sm:mx-2 hidden sm:block"
              />
            </>
          )}
          {children}
        </div>
        <p className="text-[11px] text-slate-500 text-center mt-3">{t("benchNote")}</p>
      </div>
    </div>
  );
}
