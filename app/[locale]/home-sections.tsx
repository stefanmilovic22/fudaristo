import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { TeamOfWeekData } from "@/components/TeamOfWeekBoard";

/**
 * Sekcije početne strane ispod hero dela: traka sa statusom, sledeći mečevi,
 * Top 5 lige i Tim kola. Sve su serverske i dobijaju gotove podatke — nijedna
 * ne čita bazu sama.
 */

export function StatusStrip({
  rank,
  gwPoints,
  total,
  budget,
  labels,
}: {
  rank: number | null;
  gwPoints: number | null;
  total: number | null;
  budget: number | null;
  /** Već prevedeni tekstovi — `gw` i `avg` imaju umetnute vrednosti (broj kola, prosek). */
  labels: { rank: string; gw: string; avg: string | null; total: string; budget: string };
}) {
  const stat = (
    key: string,
    label: string,
    value: string,
    sub?: string,
    highlight?: boolean
  ) => (
    <div
      key={key}
      className={`rounded-xl border px-4 py-3.5 ${
        highlight
          ? "bg-gradient-to-br from-[#2a2412] to-navy-800 border-[#5b4a1d]"
          : "bg-navy-800 border-navy-700"
      }`}
    >
      <div className="text-[11px] uppercase tracking-widest font-semibold text-slate-400">{label}</div>
      <div className="font-display text-3xl leading-tight mt-1">{value}</div>
      {sub && <div className="text-xs font-semibold text-pitch-400">{sub}</div>}
    </div>
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stat("rank", labels.rank, rank ? `${rank}.` : "—", undefined, true)}
      {stat("gw", labels.gw, gwPoints !== null ? String(gwPoints) : "—", labels.avg ?? undefined)}
      {stat("total", labels.total, total !== null ? String(total) : "—")}
      {stat("budget", labels.budget, budget !== null ? `${budget.toFixed(1)}M` : "—")}
    </div>
  );
}

function Card({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-navy-800 border border-navy-700 rounded-xl p-4 sm:p-5 flex flex-col min-w-0">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="text-[13px] uppercase tracking-wider text-slate-300 font-medium truncate">{title}</h3>
        <Link href={href} className="text-xs font-bold text-gold-300 hover:text-gold-400 whitespace-nowrap">
          {linkLabel} →
        </Link>
      </div>
      {children}
    </div>
  );
}

function ClubDot({ short, color }: { short: string; color: string }) {
  return (
    <span
      className="w-[22px] h-[22px] shrink-0 rounded-full grid place-items-center text-[8px] font-extrabold text-navy-950"
      style={{ backgroundColor: color }}
    >
      {short.slice(0, 3)}
    </span>
  );
}

export async function NextMatchesCard({ matches, gwNumber }: { matches: any[]; gwNumber: number }) {
  const t = await getTranslations("home");
  const locale = await getLocale();
  const fmt = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Athens",
  });
  return (
    <Card title={t("nextMatches", { number: gwNumber })} href="/raspored" linkLabel={t("fullSchedule")}>
      {matches.length === 0 ? (
        <p className="text-sm text-slate-400">{t("noFixtures")}</p>
      ) : (
        <ul className="flex flex-col">
          {matches.slice(0, 5).map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-2 py-2.5 border-t border-navy-700 first:border-t-0 text-sm"
            >
              <span className="flex items-center gap-2 flex-1 min-w-0 font-semibold">
                <ClubDot short={m.home?.short_name ?? "?"} color={m.home?.primary_color ?? "#8494AC"} />
                <span className="truncate">{m.home?.name ?? "?"}</span>
              </span>
              <span className="shrink-0 text-[11px] font-semibold text-slate-400 bg-navy-900 rounded-md px-2 py-1">
                {fmt.format(new Date(m.kickoff_at))}
              </span>
              <span className="flex items-center justify-end gap-2 flex-1 min-w-0 font-semibold text-right">
                <span className="truncate">{m.away?.name ?? "?"}</span>
                <ClubDot short={m.away?.short_name ?? "?"} color={m.away?.primary_color ?? "#8494AC"} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export async function LeagueTopCard({
  rows,
  currentUserId,
}: {
  rows: { userId: string; teamName: string; totalPoints: number; rank: number }[] | null;
  currentUserId: string | null;
}) {
  const t = await getTranslations("home");

  // Gost: red-ovi su lažni (nikakvi stvarni podaci ne idu u HTML), samo
  // zamućena slika tabele sa pozivom na registraciju.
  if (rows === null) {
    return (
      <Card title={t("leagueTop5")} href="/liga" linkLabel={t("fullTable")}>
        <div className="relative">
          <ul className="flex flex-col blur-[5px] select-none" aria-hidden>
            {[1, 2, 3, 4, 5].map((n) => (
              <li key={n} className="flex items-center gap-3 py-2.5 border-t border-navy-700 first:border-t-0 text-sm">
                <span className="w-5 font-display font-bold text-slate-300">{n}</span>
                <span className="flex-1">•••••••••••</span>
                <span className="font-display font-bold">•••</span>
              </li>
            ))}
          </ul>
          <div className="absolute inset-0 grid place-items-center text-center bg-navy-800/50 rounded-lg px-3">
            <div>
              <p className="text-xs text-slate-300 mb-2.5">{t("leagueGuestNote")}</p>
              <Link
                href="/register"
                className="inline-block bg-gold-400 text-navy-950 font-bold text-xs px-4 py-2 rounded-lg hover:bg-gold-300"
              >
                {t("leagueGuestCta")}
              </Link>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card title={t("leagueTop5")} href="/liga" linkLabel={t("fullTable")}>
      <ul className="flex flex-col">
        {rows.map((r) => {
          const me = r.userId === currentUserId;
          return (
            <li
              key={r.userId}
              className={`flex items-center gap-3 py-2.5 px-2 -mx-2 border-t border-navy-700 first:border-t-0 text-sm rounded-md ${
                me ? "bg-gold-400/10 text-gold-300 font-bold" : ""
              }`}
            >
              <span className="w-5 font-display font-bold text-slate-300">{r.rank}</span>
              <span className="flex-1 truncate">{r.teamName}</span>
              <span className="font-display font-bold tabular-nums">{r.totalPoints}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const ROW_ORDER = ["GK", "DEF", "MID", "FWD"] as const;

export async function TeamOfWeekCard({ data }: { data: TeamOfWeekData | null }) {
  const t = await getTranslations("home");
  if (!data) {
    return (
      <Card title={t("totwTitle", { number: "—" })} href="/statistike" linkLabel={t("statsLink")}>
        <p className="text-sm text-slate-400">{t("noTotw")}</p>
      </Card>
    );
  }
  const rows = ROW_ORDER.map((pos) => data.players.filter((p) => p.position === pos)).filter(
    (r) => r.length > 0
  );
  const best = [...data.players].sort((a, b) => b.points - a.points)[0];

  return (
    <Card title={t("totwTitle", { number: data.gameweekNumber })} href="/statistike" linkLabel={t("statsLink")}>
      <div
        className="rounded-lg border border-white/30 flex flex-col justify-around gap-2 px-2 py-3 aspect-[4/3.1]"
        style={{ background: "linear-gradient(#37A160,#2E8B52)" }}
        aria-hidden
      >
        {rows.map((row, i) => (
          <div key={i} className="flex justify-around">
            {row.map((p) => (
              <span
                key={p.id}
                title={`${p.fullName} · ${p.points}`}
                className="w-5 h-5 rounded-full border-2 border-navy-950/50"
                style={{ backgroundColor: p.position === "GK" ? "#28405F" : p.clubColor }}
              />
            ))}
          </div>
        ))}
      </div>
      {best && (
        <div className="mt-3 flex items-center gap-2 bg-navy-900 rounded-lg px-3 py-2 text-[13px]">
          <span>⭐ {t("playerOfWeek")}</span>
          <span className="text-slate-400 truncate">{best.fullName}</span>
          <span className="ml-auto font-display font-bold text-lg text-gold-300">{best.points}</span>
        </div>
      )}
    </Card>
  );
}
