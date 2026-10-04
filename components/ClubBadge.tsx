import { readableInk } from "@/lib/color";

/**
 * Okrugli „grb” kluba (boja kluba + skraćenica). Slova se biraju prema boji
 * pozadine, a tanak svetao obruč drži tamne grbove (crn PAOK) vidljivim na
 * tamnoj podlozi sajta.
 */
export function ClubBadge({
  short,
  color,
  size = 22,
  className = "",
}: {
  short: string;
  color: string;
  /** Prečnik u px. */
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`shrink-0 rounded-full grid place-items-center font-extrabold leading-none ring-1 ring-white/25 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        color: readableInk(color),
        fontSize: Math.max(8, Math.round(size * 0.36)),
      }}
    >
      {short.slice(0, 3)}
    </span>
  );
}
