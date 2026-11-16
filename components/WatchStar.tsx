"use client";

/**
 * Zvezdica „prati igrača“. Dugme je visoko 44 px (prst; na najužim ekranima 36 px široko), a crtež manji — da red u
 * listi ne postane viši. Stoji pored reda igrača, ne unutar njega (dugme u
 * dugmetu nije dozvoljeno).
 */
export function WatchStar({
  watched,
  disabled,
  onToggle,
  label,
}: {
  watched: boolean;
  disabled?: boolean;
  onToggle: () => void;
  /** Već prevedeno: „Prati igrača“ / „Prestani da pratiš“. */
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={watched}
      aria-label={label}
      title={label}
      className={`shrink-0 w-9 xs:w-11 h-11 grid place-items-center rounded-lg transition-colors disabled:opacity-50 ${
        watched ? "text-gold-300" : "text-slate-500 hover:text-gold-300"
      }`}
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill={watched ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
        <path d="m12 3.2 2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8L12 3.2Z" />
      </svg>
    </button>
  );
}
