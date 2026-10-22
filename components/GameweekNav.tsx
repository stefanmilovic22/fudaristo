"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Izbor kola kao na FPL-u: naslov "Kolo N" sa strelicama sa obe strane.
 * Strelice vode na ?kolo=N iste stranice (puni prefetch, pa je prelazak skoro
 * trenutan) i preskaču kola u kojima tim nije imao sastav.
 */
export function GameweekNav({
  basePath,
  current,
  items,
}: {
  basePath: string;
  current: number;
  /** Zaključana kola, od najstarijeg; `hasSquad` je false ako tim tada nije imao sastav. */
  items: { number: number; hasSquad: boolean }[];
}) {
  const t = useTranslations("publicTeam");
  const index = items.findIndex((i) => i.number === current);
  const prev = items.slice(0, Math.max(index, 0)).reverse().find((i) => i.hasSquad) ?? null;
  const next = index >= 0 ? (items.slice(index + 1).find((i) => i.hasSquad) ?? null) : null;
  const href = (n: number) => `${basePath}?kolo=${n}`;

  const arrow =
    "w-9 h-9 flex items-center justify-center rounded-full text-lg leading-none transition-colors";
  const on = `${arrow} bg-navy-700 text-chalk-50 hover:bg-gold-400 hover:text-navy-950`;
  const off = `${arrow} bg-navy-800 text-slate-600 cursor-not-allowed`;

  return (
    <div className="flex items-center justify-center gap-4">
      {prev ? (
        <Link href={href(prev.number)} prefetch className={on} aria-label={t("prevGameweek")} title={t("prevGameweek")}>
          ‹
        </Link>
      ) : (
        <span className={off} aria-hidden>
          ‹
        </span>
      )}
      <h3 className="font-display text-lg sm:text-xl min-w-[9rem] text-center">
        {t("gameweekTitle", { number: current })}
      </h3>
      {next ? (
        <Link href={href(next.number)} prefetch className={on} aria-label={t("nextGameweek")} title={t("nextGameweek")}>
          ›
        </Link>
      ) : (
        <span className={off} aria-hidden>
          ›
        </span>
      )}
    </div>
  );
}
