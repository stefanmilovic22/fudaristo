import { readableInk } from "@/lib/color";
import { assetUrl } from "@/lib/asset-url";
import { crestFor } from "@/lib/club-crests";

/**
 * Okrugli „grb” kluba. Ako klub ima sliku grba (lib/club-crests.ts) prikazuje se
 * ona; inače boja kluba + skraćenica. Slova se biraju prema boji pozadine, a tanak
 * svetao obruč drži tamne grbove (crn PAOK) vidljivim na tamnoj podlozi sajta.
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
  const crest = crestFor(short);
  if (crest) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- mali statički grb iz /public, bez next/image
      <img
        src={assetUrl(crest)}
        alt=""
        aria-hidden
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={`shrink-0 rounded-full object-cover ring-1 ring-white/25 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
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
