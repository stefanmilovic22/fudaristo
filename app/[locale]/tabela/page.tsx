import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getTableDataCached } from "@/lib/cached-data";
import { computeLeagueTable, type FormResult } from "@/lib/league-table";
import { DataLoadError } from "@/components/DataLoadError";
import { ClubBadge } from "@/components/ClubBadge";
import { ZONE_RANK_CLASS, zoneFor, type LeagueZone } from "@/lib/league-zones";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "table" });
  return { title: `${t("title")} — Fudaristo` };
}

const FORM_STYLE: Record<FormResult, string> = {
  W: "bg-pitch-500 text-navy-950",
  D: "bg-slate-500 text-chalk-50",
  L: "bg-danger-400 text-chalk-50",
};

/**
 * Tabela Super lige — javna, računa se iz odigranih mečeva
 * (lib/league-table.ts), pa uvek prati unete rezultate.
 */
export default async function TabelaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("table");

  let data: Awaited<ReturnType<typeof getTableDataCached>>;
  try {
    data = await getTableDataCached();
  } catch (e) {
    console.error("[/tabela]", e);
    return (
      <div>
        <h2 className="font-display text-2xl mb-4">{t("title")}</h2>
        <DataLoadError whatKey="whatTable" error={{ message: (e as Error).message }} />
      </div>
    );
  }

  const rows = computeLeagueTable(data.clubs, data.fixtures);
  const playedAny = rows.some((r) => r.played > 0);
  const roundsPlayed = Math.max(0, ...rows.map((r) => r.played));

  return (
    <div>
      <h2 className="font-display text-2xl mb-6">{t("title")}</h2>

      {!playedAny && <p className="text-slate-400 text-sm mb-4">{t("noMatches")}</p>}

      <div className="max-w-[960px] bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden">
        <div className="bg-navy-700 border-b border-gold-400/30 px-4 py-2.5 flex items-baseline justify-between gap-3">
          <h3 className="font-display text-sm uppercase tracking-wider text-gold-300">{t("bandTitle")}</h3>
          {playedAny && <span className="text-[11px] text-slate-300">{t("afterRound", { number: roundsPlayed })}</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-navy-900/70 text-slate-400 text-[11px] uppercase tracking-wide">
                <th className="text-center font-semibold py-3 pl-3 pr-1 w-12">{t("colPos")}</th>
                <th className="text-left font-semibold py-3 px-2">{t("colClub")}</th>
                <th className="text-center font-semibold py-3 px-1.5 w-11" title={t("tipPlayed")}>{t("colP")}</th>
                <th className="text-center font-semibold py-3 px-1.5 w-10 hidden sm:table-cell" title={t("tipWon")}>{t("colW")}</th>
                <th className="text-center font-semibold py-3 px-1.5 w-10 hidden sm:table-cell" title={t("tipDrawn")}>{t("colD")}</th>
                <th className="text-center font-semibold py-3 px-1.5 w-10 hidden sm:table-cell" title={t("tipLost")}>{t("colL")}</th>
                <th className="text-center font-semibold py-3 px-1.5 w-16 hidden md:table-cell" title={t("tipGoals")}>{t("colGoals")}</th>
                <th className="text-center font-semibold py-3 px-1.5 w-12" title={t("tipDiff")}>{t("colGD")}</th>
                <th className="text-center font-semibold py-3 px-2 w-16" title={t("tipPoints")}>{t("colPts")}</th>
                <th className="text-center font-semibold py-3 px-3 w-36 hidden md:table-cell">{t("colForm")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.clubId}
                  className="border-t border-navy-700/80 odd:bg-navy-900/25 hover:bg-navy-700/40 transition-colors"
                >
                  <td className="py-3 pl-3 pr-1 text-center">
                    <span
                      className={`inline-grid place-items-center w-7 h-7 rounded-lg font-display font-bold tabular-nums text-sm ${ZONE_RANK_CLASS[zoneFor(r.rank)]}`}
                    >
                      {r.rank}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <Link
                      href={`/klubovi/${r.clubId}`}
                      className="group flex items-center gap-3 min-w-0"
                    >
                      <ClubBadge short={r.short} color={r.color} size={28} />
                      <span className="font-semibold truncate group-hover:text-gold-300 group-hover:underline underline-offset-2">
                        {r.name}
                      </span>
                    </Link>
                  </td>
                  <td className="py-3 px-1.5 text-center tabular-nums text-slate-300">{r.played}</td>
                  <td className="py-3 px-1.5 text-center tabular-nums text-slate-300 hidden sm:table-cell">{r.won}</td>
                  <td className="py-3 px-1.5 text-center tabular-nums text-slate-300 hidden sm:table-cell">{r.drawn}</td>
                  <td className="py-3 px-1.5 text-center tabular-nums text-slate-300 hidden sm:table-cell">{r.lost}</td>
                  <td className="py-3 px-1.5 text-center tabular-nums text-slate-400 hidden md:table-cell">
                    {r.goalsFor}:{r.goalsAgainst}
                  </td>
                  <td
                    className={`py-3 px-1.5 text-center tabular-nums ${
                      r.goalDiff > 0 ? "text-pitch-400" : r.goalDiff < 0 ? "text-danger-400" : "text-slate-300"
                    }`}
                  >
                    {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className="inline-block min-w-[2.25rem] rounded-lg bg-navy-700 px-2 py-1 font-display font-bold text-base tabular-nums">
                      {r.points}
                    </span>
                    {r.deduction > 0 && (
                      <sup className="text-gold-300 font-bold ml-0.5" title={t("deductionNote", { club: r.name, points: r.deduction })}>
                        *
                      </sup>
                    )}
                  </td>
                  <td className="py-3 px-3 hidden md:table-cell">
                    <div className="flex justify-center gap-1">
                      {r.form.map((f, i) => (
                        <span
                          key={i}
                          className={`w-5 h-5 rounded-full grid place-items-center text-[9px] font-extrabold ${FORM_STYLE[f]}`}
                        >
                          {t(`form${f}`)}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ul className="max-w-[960px] mt-4 flex flex-col gap-2 text-sm text-slate-300">
        {(["championship", "conference", "relegation"] as LeagueZone[]).map((z) => (
          <li key={z} className="flex items-center gap-2.5">
            <span className={`w-3.5 h-3.5 rounded-[4px] shrink-0 ${ZONE_RANK_CLASS[z]}`} aria-hidden />
            {t(`zone_${z}`)}
          </li>
        ))}
      </ul>
      {rows
        .filter((r) => r.deduction > 0)
        .map((r) => (
          <p key={r.clubId} className="max-w-[960px] text-gold-300 text-xs mt-3">
            * {t("deductionNote", { club: r.name, points: r.deduction })}
          </p>
        ))}
      <p className="max-w-[960px] text-slate-500 text-xs mt-3">{t("note")}</p>
    </div>
  );
}
