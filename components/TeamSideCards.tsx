import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ClubBadge } from "@/components/ClubBadge";
import { readableInk } from "@/lib/color";

export type HistoryItem = { number: number; points: number | null; hasSquad: boolean };

/**
 * Leva kolona kartica na javnoj stranici tima (samo web, lg+) — po uzoru na
 * FPL: poeni i plasman, istorija kola, značka tima i omiljeni klub.
 *
 * Poslednja kartica leži uz dno kolone, a istorija kola u sredini popunjava sav
 * preostali prostor (lista se skroluje) — tako leva kolona uvek završava u
 * ravni sa klupom desno, bez obzira na broj kola.
 */
export async function TeamSideCards({
  basePath,
  current,
  history,
  overallPoints,
  rank,
  managers,
  gameweekPoints,
  teamName,
  teamColor,
  club,
}: {
  basePath: string;
  current: number;
  history: HistoryItem[]; // od najstarijeg kola
  overallPoints: number;
  rank: number | null;
  managers: number | null;
  gameweekPoints: number | null;
  teamName: string;
  teamColor: string;
  club: { name: string; short_name: string; primary_color: string } | null;
}) {
  const t = await getTranslations("publicTeam");
  const tCommon = await getTranslations("common");
  const href = (n: number) => `${basePath}?kolo=${n}`;
  const max = Math.max(1, ...history.map((h) => h.points ?? 0));
  // Oznake brojeva kola ispod stubića samo dok staju (inače svako peto kolo).
  const labelEvery = history.length > 14 ? 5 : 1;
  const dash = "–";

  const cardTitle = "bg-navy-700 border-b border-gold-400/30 px-4 py-2";
  const titleText = "font-display text-sm uppercase tracking-wider text-gold-300";

  return (
    <>
      <section className="bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden shrink-0">
        <div className={cardTitle}>
          <h3 className={titleText}>{t("pointsRankingsTitle")}</h3>
        </div>
        <dl className="px-4 py-2.5 text-sm flex flex-col gap-1.5">
          <Row label={t("overallPoints")} value={overallPoints} />
          <Row label={t("overallRank")} value={rank ?? dash} />
          <Row label={t("totalManagers")} value={managers ?? dash} />
          <Row label={t("gameweekPoints")} value={gameweekPoints ?? dash} />
        </dl>
      </section>

      <section className="bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden flex flex-col flex-1 min-h-0">
        <div className={`${cardTitle} shrink-0`}>
          <h3 className={titleText}>{t("historyTitle")}</h3>
        </div>

        {/* Stubići: visina = poeni kola, klik otvara kolo. */}
        <div className="px-3 pt-3 pb-2 shrink-0">
          <div className="flex items-end gap-[3px] h-[88px]">
            {history.map((h) => {
              const ratio = h.points ? Math.max(0.06, h.points / max) : 0.04;
              const active = h.number === current;
              const bar = (
                <span
                  className={`block w-full rounded-t ${
                    active ? "bg-gold-400" : h.hasSquad ? "bg-navy-600 group-hover:bg-gold-400/60" : "bg-navy-700"
                  }`}
                  style={{ height: `${Math.round(ratio * 100)}%` }}
                />
              );
              return (
                <div key={h.number} className="flex-1 min-w-0 h-full flex flex-col justify-end items-stretch">
                  {h.hasSquad ? (
                    <Link
                      href={href(h.number)}
                      prefetch
                      className="group flex flex-col justify-end h-full"
                      title={`${tCommon("gameweekN", { number: h.number })} · ${h.points ?? 0}`}
                    >
                      {bar}
                    </Link>
                  ) : (
                    <span className="flex flex-col justify-end h-full" title={t("noSquadShort")}>
                      {bar}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-[3px] mt-1">
            {history.map((h) => (
              <span
                key={h.number}
                className={`flex-1 min-w-0 text-center text-[10px] ${h.number === current ? "text-gold-300 font-bold" : "text-slate-500"}`}
              >
                {h.number % labelEvery === 0 || h.number === current ? h.number : ""}
              </span>
            ))}
          </div>
        </div>

        {/* Lista svih kola, najnovije prvo; skroluje se unutar kartice. */}
        <ul className="px-4 pb-3 flex-1 min-h-0 overflow-y-auto text-sm">
          {[...history].reverse().map((h) => (
            <li key={h.number} className="border-t border-navy-700">
              {h.hasSquad ? (
                <Link
                  href={href(h.number)}
                  prefetch
                  className={`flex items-center justify-between py-1.5 hover:text-gold-300 ${
                    h.number === current ? "text-gold-300 font-bold" : ""
                  }`}
                >
                  <span>{tCommon("gameweekN", { number: h.number })}</span>
                  <span className="tabular-nums font-semibold">{h.points ?? 0}</span>
                </Link>
              ) : (
                <div className="flex items-center justify-between py-1.5 text-slate-600">
                  <span>{tCommon("gameweekN", { number: h.number })}</span>
                  <span className="text-xs">{t("noSquadShort")}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden shrink-0">
        <div className={cardTitle}>
          <h3 className={titleText}>{t("teamBadgeTitle")}</h3>
        </div>
        <div className="px-4 py-3 flex items-center gap-3">
          <div
            className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center font-display font-bold text-lg"
            style={{ backgroundColor: teamColor, color: readableInk(teamColor) }}
          >
            {(teamName ?? "??").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-slate-400 text-xs">{t("teamColour")}</div>
            <span className="inline-block w-12 h-1.5 rounded-full mt-1.5" style={{ backgroundColor: teamColor }} />
          </div>
          {club && (
            <div className="shrink-0 flex flex-col items-center gap-1" title={club.name}>
              <ClubBadge short={club.short_name} color={club.primary_color} size={40} />
              <span className="text-slate-400 text-[11px]">{t("fanClub")}</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
