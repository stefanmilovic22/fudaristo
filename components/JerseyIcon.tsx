/**
 * Mali dres pored imena igrača (liste Klubovi / Igrači). Bez logike i bez
 * prevoda, pa radi u serverskim i u klijentskim komponentama. Pravi dres
 * kluba (fotografija) kad postoji; inače jednobojan dres u boji kluba, kao i
 * na terenu (Jersey.tsx). Golman ima isprekidan zlatan okvir — isto kao tamo.
 */
const SHIRT_PATH =
  "M34 4 L22 8 L4 20 L14 36 L24 31 L24 70 Q50 75 76 70 L76 31 L86 36 L96 20 L78 8 L66 4 Q50 16 34 4 Z";

export function JerseyIcon({
  color,
  photoUrl,
  isGoalkeeper,
  size = 30,
}: {
  color: string;
  photoUrl?: string | null;
  isGoalkeeper?: boolean;
  /** Širina u px. */
  size?: number;
}) {
  if (photoUrl) {
    return (
      <span
        aria-hidden
        className={`shrink-0 inline-block overflow-hidden ${isGoalkeeper ? "rounded-sm outline outline-1 outline-dashed outline-gold-300" : ""}`}
        style={{ width: size, height: Math.round(size * 1.08) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- spoljni URL po klubu, kao u Jersey.tsx */}
        <img src={photoUrl} alt="" loading="lazy" decoding="async" className="w-full h-auto block" />
      </span>
    );
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 76"
      width={size}
      className="shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
    >
      <path
        d={SHIRT_PATH}
        fill={color}
        stroke={isGoalkeeper ? "#F0C868" : "rgba(255,255,255,0.35)"}
        strokeWidth={isGoalkeeper ? 5 : 3}
        strokeLinejoin="round"
        strokeDasharray={isGoalkeeper ? "9 5" : undefined}
      />
    </svg>
  );
}
