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

      <div className="relative px-2 py-6 sm:px-5 sm:py-8">{children}</div>
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
  title = "Klupa",
  note,
}: {
  children: React.ReactNode;
  title?: string;
  note?: string;
}) {
  return (
    <div className="mt-2 rounded-xl bg-navy-800 ring-1 ring-black/25 px-3 py-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-display text-sm tracking-wide text-slate-300">{title}</h3>
        {note && <span className="text-[11px] text-slate-400">{note}</span>}
      </div>
      <div className="flex justify-center gap-1.5 sm:gap-4 flex-wrap">{children}</div>
    </div>
  );
}
