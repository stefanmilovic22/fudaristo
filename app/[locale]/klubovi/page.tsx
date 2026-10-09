import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getTableDataCached, getUpcomingFixturesCached } from "@/lib/cached-data";
import { computeLeagueTable } from "@/lib/league-table";
import { DataLoadError } from "@/components/DataLoadError";
import { ClubBadge } from "@/components/ClubBadge";
import { FormDots } from "@/components/FormDots";
import { LocalTime } from "@/components/LocalTime";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "clubs" });
  return { title: `${t("title")} — Fudaristo` };
}

/** Klubovi Super lige — javna stranica, podaci iz keša (tabela + raspored). */
export default async function KluboviPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("clubs");
  const tTable = await getTranslations("table");

  let data: Awaited<ReturnType<typeof getTableDataCached>>;
  let upcoming: any[] = [];
  try {
    [data, upcoming] = await Promise.all([getTableDataCached(), getUpcomingFixturesCached().catch(() => [])]);
  } catch (e) {
    console.error("[/klubovi]", e);
    return (
      <div>
        <h2 className="font-display text-2xl mb-4">{t("title")}</h2>
        <DataLoadError whatKey="whatTable" error={{ message: (e as Error).message }} />
      </div>
    );
  }

  const rows = computeLeagueTable(data.clubs, data.fixtures);
  const shortById = new Map(data.clubs.map((c) => [c.id, c.short_name]));

  // Prvi zakazani meč svakog kluba (upcoming je već poređan po vremenu).
  const nextByClub = new Map<string, { opponent: string; home: boolean; kickoffAt: string }>();
  for (const f of upcoming) {
    if (!nextByClub.has(f.home_club_id)) {
      nextByClub.set(f.home_club_id, {
        opponent: shortById.get(f.away_club_id) ?? "?",
        home: true,
        kickoffAt: f.kickoff_at,
      });
    }
    if (!nextByClub.has(f.away_club_id)) {
      nextByClub.set(f.away_club_id, {
        opponent: shortById.get(f.home_club_id) ?? "?",
        home: false,
        kickoffAt: f.kickoff_at,
      });
    }
  }

  const formLabels = { W: tTable("formW"), D: tTable("formD"), L: tTable("formL") };
  const playedAny = rows.some((r) => r.played > 0);
  // Po mestu na tabeli; ako se još nije igralo, po imenu.
  const sorted = playedAny ? rows : [...rows].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <h2 className="font-display text-2xl mb-1">{t("title")}</h2>
      <p className="text-slate-400 text-sm mb-6">{t("lead")}</p>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.map((r) => {
          const next = nextByClub.get(r.clubId);
          return (
            <li key={r.clubId}>
              <Link
                href={`/klubovi/${r.clubId}`}
                className="group block h-full bg-navy-800 border border-navy-700 rounded-xl p-4 hover:border-gold-400/60 hover:bg-navy-700/40 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <ClubBadge short={r.short} color={r.color} size={48} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-lg leading-tight truncate">{r.name}</span>
                    {playedAny && (
                      <span className="block text-xs text-slate-400 mt-0.5">
                        {t("rankPoints", { rank: r.rank, points: r.points })}
                      </span>
                    )}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-5 h-5 shrink-0 text-gold-300 group-hover:translate-x-0.5 transition-transform"
                    aria-hidden
                  >
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>

                <span className="mt-3 pt-3 border-t border-navy-700 flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-400 min-w-0">
                    <span className="block uppercase tracking-wide text-[10px] text-slate-500">{t("nextMatch")}</span>
                    {next ? (
                      <span className="block text-slate-200 font-semibold truncate">
                        {next.opponent} ({next.home ? "H" : "A"}) ·{" "}
                        <LocalTime
                          iso={next.kickoffAt}
                          options={{ weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }}
                        />
                      </span>
                    ) : (
                      <span className="block text-slate-500">{t("noNext")}</span>
                    )}
                  </span>
                  <FormDots results={r.form} labels={formLabels} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
