"use client";

import { useTranslations } from "next-intl";
import { ClubBadge } from "@/components/ClubBadge";
import { JerseyIcon } from "@/components/JerseyIcon";
import { LocalTime } from "@/components/LocalTime";
import { playerFullName, type Position } from "@/lib/fantasy-rules";
import { useInjuryReason } from "@/lib/use-injury-reason";

export type InjuredPlayer = {
  id: string;
  first_name: string;
  last_name: string;
  position: Position;
  price: number;
  status: string;
  total_points: number;
  note: string | null;
  until: string | null;
  clubId: string;
  clubName: string;
  clubShort: string;
  clubColor: string;
  jerseyPhoto: string | null;
};

export type InjuriesData = {
  /** Kada je spisak poslednji put potvrđen u adminu; null = još nikad. */
  updatedAt: string | null;
  round: number | null;
  players: InjuredPlayer[];
};

const SEVERITY: Record<string, number> = { injured: 0, suspended: 1, doubtful: 2, unavailable: 3 };
const STATUS_STYLE: Record<string, string> = {
  injured: "bg-danger-400/15 text-danger-400",
  suspended: "bg-danger-400/15 text-danger-400",
  unavailable: "bg-danger-400/15 text-danger-400",
  doubtful: "bg-gold-400/15 text-gold-300",
};

const WHEN = { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" } as const;
const DAY = { day: "numeric", month: "numeric" } as const;

/** Tab „Povređeni”: spisak odsutnih igrača po klubu, sa vremenom poslednjeg ažuriranja. */
export function InjuriesTab({ data }: { data: InjuriesData | null }) {
  const t = useTranslations("stats");
  const tPlayers = useTranslations("players");
  const tPos = useTranslations("positions");
  const reason = useInjuryReason();

  if (!data) return <p className="text-sm text-slate-400">{t("injuriesUnavailable")}</p>;

  // Grupisanje po klubu (abecedno), u klubu po težini pa po ceni.
  const byClub = new Map<string, { name: string; short: string; color: string; photo: string | null; list: InjuredPlayer[] }>();
  for (const p of data.players) {
    const g = byClub.get(p.clubId) ?? { name: p.clubName, short: p.clubShort, color: p.clubColor, photo: p.jerseyPhoto, list: [] };
    g.list.push(p);
    byClub.set(p.clubId, g);
  }
  const groups = [...byClub.entries()]
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([id, g]) => ({
      id,
      ...g,
      list: g.list.sort((a, b) => (SEVERITY[a.status] ?? 9) - (SEVERITY[b.status] ?? 9) || b.price - a.price),
    }));

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-slate-300 mb-1">
        {data.updatedAt ? (
          <>
            {t("injuriesUpdated")}: <LocalTime iso={data.updatedAt} options={WHEN} className="font-semibold text-chalk-50" />
            {data.round !== null && <> · {t("injuriesBeforeRound", { number: data.round })}</>}
          </>
        ) : (
          t("injuriesNever")
        )}
      </p>
      <p className="text-xs text-slate-500 mb-4">{t("injuriesHint")}</p>

      {groups.length === 0 ? (
        <p className="text-sm text-slate-400 bg-navy-800 border border-navy-700 rounded-xl p-4">{t("injuriesEmpty")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <section key={g.id} className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
              <h3 className="flex items-center gap-3 px-4 py-3 font-display text-lg border-b border-navy-700">
                <ClubBadge short={g.short} color={g.color} size={28} />
                <span className="flex-1 min-w-0 truncate">{g.name}</span>
                <span className="text-xs text-slate-400 font-sans">{g.list.length}</span>
              </h3>
              <ul className="divide-y divide-navy-700">
                {g.list.map((p) => (
                  <li key={p.id} className="px-4 py-2.5 flex items-start gap-2 sm:gap-3 text-sm">
                    <span className="shrink-0 w-9 text-center text-[10px] font-bold tracking-wide text-navy-950 bg-slate-300 rounded-full px-1 py-0.5 mt-0.5">
                      {tPos(`short${p.position}`)}
                    </span>
                    <span className="shrink-0 w-[30px] grid place-items-center">
                      <JerseyIcon color={g.color} photoUrl={g.photo} isGoalkeeper={p.position === "GK"} size={28} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-semibold truncate max-w-full">{playerFullName(p)}</span>
                        <span
                          className={`shrink-0 text-[10px] font-bold rounded-full px-1.5 py-0.5 ${STATUS_STYLE[p.status] ?? "bg-navy-700 text-slate-300"}`}
                        >
                          {tPlayers(`status_${p.status}` as "status_injured")}
                        </span>
                      </span>
                      {(p.note || p.until) && (
                        <span className="block text-xs text-slate-400 mt-0.5">
                          {reason(p.note)}
                          {p.until && (
                            <>
                              {p.note ? " · " : ""}
                              {t("injuriesUntil")} <LocalTime iso={p.until} options={DAY} />
                            </>
                          )}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 w-14 text-right tabular-nums text-slate-300">{p.price.toFixed(1)}M</span>
                    <span className="shrink-0 w-9 text-right tabular-nums font-bold text-gold-300">{p.total_points}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
