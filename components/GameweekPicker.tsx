"use client";

import { useTransition } from "react";
import { useLinkStatus } from "next/link";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";

/**
 * Izbor kola za pregled poena tima, kao u FPL-u: strelice za prethodno/sledeće
 * kolo i padajuća lista sa poenima po kolu. Samo prelazi na ?kolo=N iste
 * stranice, pa se ceo prikaz (teren, poeni, raspis po igraču) osvežava na
 * serveru.
 *
 * Kola u kojima tim nije imao sastav (npr. korisnik se registrovao u 5. kolu)
 * su isključena u listi, a strelice ih preskaču.
 *
 * Brzina: strelice su pravi linkovi sa punim prefetch-om, pa se susedna kola
 * učitaju unapred i prelazak je skoro trenutan. Za ostale prelaze (lista) i
 * dok se kolo učitava prikazuje se mali indikator — da klik ne izgleda kao da
 * se ništa ne dešava.
 */
function ArrowContent({ children }: { children: string }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <span className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-gold-400 animate-spin" aria-hidden />
  ) : (
    <>{children}</>
  );
}

export function GameweekPicker({
  basePath,
  current,
  items,
}: {
  basePath: string;
  current: number;
  /** Zaključana kola, od najstarijeg; `hasSquad` je false ako tim tada nije imao sastav. */
  items: { number: number; points: number | null; hasSquad: boolean }[];
}) {
  const t = useTranslations("publicTeam");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const index = items.findIndex((i) => i.number === current);
  const prev = items.slice(0, Math.max(index, 0)).reverse().find((i) => i.hasSquad) ?? null;
  const next = index >= 0 ? (items.slice(index + 1).find((i) => i.hasSquad) ?? null) : null;
  const href = (n: number) => `${basePath}?kolo=${n}`;
  const go = (n: number) => startTransition(() => router.push(href(n)));

  const arrow =
    "shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-navy-600 text-lg leading-none";
  const arrowOn = `${arrow} text-slate-300 hover:text-chalk-50 hover:border-slate-500 transition-colors`;
  const arrowOff = `${arrow} text-slate-600 opacity-50 cursor-not-allowed`;

  return (
    <div className="flex items-center gap-2 max-w-sm" aria-busy={pending}>
      {prev ? (
        <Link
          href={href(prev.number)}
          prefetch
          className={arrowOn}
          aria-label={t("prevGameweek")}
          title={t("prevGameweek")}
        >
          <ArrowContent>‹</ArrowContent>
        </Link>
      ) : (
        <span className={arrowOff} aria-hidden>
          ‹
        </span>
      )}
      <select
        value={current}
        onChange={(e) => go(Number(e.target.value))}
        disabled={pending}
        aria-label={t("selectGameweek")}
        className="flex-1 min-w-0 h-10 bg-navy-900 border border-navy-600 rounded-lg px-3 text-chalk-50 text-sm font-semibold focus:border-gold-400 focus:outline-none disabled:opacity-70"
      >
        {[...items].reverse().map((i) => (
          <option key={i.number} value={i.number} disabled={!i.hasSquad && i.number !== current}>
            {tCommon("gameweekN", { number: i.number })}
            {i.hasSquad && i.points !== null ? ` · ${t("points", { points: i.points })}` : ""}
            {!i.hasSquad ? ` · ${t("noSquadShort")}` : ""}
          </option>
        ))}
      </select>
      {next ? (
        <Link
          href={href(next.number)}
          prefetch
          className={arrowOn}
          aria-label={t("nextGameweek")}
          title={t("nextGameweek")}
        >
          <ArrowContent>›</ArrowContent>
        </Link>
      ) : (
        <span className={arrowOff} aria-hidden>
          ›
        </span>
      )}
      {pending && (
        <span
          className="shrink-0 w-4 h-4 rounded-full border-2 border-slate-500 border-t-gold-400 animate-spin"
          role="status"
          aria-label={t("loading")}
        />
      )}
    </div>
  );
}
