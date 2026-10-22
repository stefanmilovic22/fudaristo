import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { localePath } from "@/lib/locale-path";
import { readableInk } from "@/lib/color";
import { UUID_RE } from "@/lib/share";
import { loadTeamShare, type ShareDot, type TeamShareData } from "@/lib/team-share";
import { EmptyState } from "@/components/EmptyState";

const POS_KEYS = ["GK", "DEF", "MID", "FWD"] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "compare" });
  return { title: `${t("title")} — Fudaristo` };
}

/**
 * Poređenje tvog tima sa drugim timom iz lige: poeni po zaključanim kolima i
 * sastav iz poslednjeg zaključanog kola. Isti podaci koji su već javni na
 * /tim/[id] — sastav tekućeg kola ostaje tajna do roka.
 */
export default async function PoredjenjePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id: otherId } = await params;
  setRequestLocale(locale);
  if (!UUID_RE.test(otherId)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(await localePath(`/login?redirect=/poredi/${otherId}`));
  if (user.id === otherId) redirect(await localePath("/liga"));

  const [t, tPos, supabase] = await Promise.all([
    getTranslations("compare"),
    getTranslations("positions"),
    createClient(),
  ]);

  const [a, b, { data: gwRows }] = await Promise.all([
    loadTeamShare(supabase, user.id),
    loadTeamShare(supabase, otherId),
    supabase
      .from("user_gameweek_points")
      .select("user_id, total_points, gameweeks!inner(number, status)")
      .in("user_id", [user.id, otherId])
      .eq("gameweeks.status", "finalized"),
  ]);
  if (!a || !b) notFound();

  // Poeni po kolu za oba tima; kolo bez reda znači da tim tada nije imao sastav.
  const pts = { a: new Map<number, number>(), b: new Map<number, number>() };
  for (const r of (gwRows ?? []) as any[]) {
    (r.user_id === user.id ? pts.a : pts.b).set(r.gameweeks.number, Number(r.total_points ?? 0));
  }
  const numbers = [...new Set([...pts.a.keys(), ...pts.b.keys()])].sort((x, y) => x - y);
  let winsA = 0;
  let winsB = 0;
  for (const n of numbers) {
    const pa = pts.a.get(n);
    const pb = pts.b.get(n);
    if (pa === undefined || pb === undefined) continue;
    if (pa > pb) winsA++;
    else if (pb > pa) winsB++;
  }

  // Sastav iz poslednjeg zaključanog kola: ko je samo kod jednog, ko kod oba.
  const flat = (d: TeamShareData) =>
    d.rows.flatMap((row, i) => row.map((dot) => ({ ...dot, pos: POS_KEYS[i] })));
  const squadA = flat(a);
  const squadB = flat(b);
  const idsB = new Set(squadB.map((p) => p.id));
  const idsA = new Set(squadA.map((p) => p.id));
  const onlyA = squadA.filter((p) => !idsB.has(p.id));
  const onlyB = squadB.filter((p) => !idsA.has(p.id));
  const common = squadA.filter((p) => idsB.has(p.id));
  const bById = new Map(squadB.map((p) => [p.id, p]));
  const squadGw = a.gameweek?.number ?? b.gameweek?.number ?? null;

  return (
    <div className="mx-auto max-w-[1020px]">
      <Link href="/liga" className="text-slate-400 text-sm hover:text-chalk-50">
        ← {t("back")}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 mt-3 items-start">
        <section className="bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden">
          <Band title={t("title")} />
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 sm:px-4 py-4 text-center">
            <TeamHead id={user.id} data={a} t={t} />
            <span className="font-display font-bold text-sm text-slate-500">{t("vs")}</span>
            <TeamHead id={otherId} data={b} t={t} />
          </div>

          {numbers.length === 0 ? (
            <div className="px-4 pb-4"><EmptyState icon="chart" title={t("noFinalized")} className="border-0 bg-transparent py-4" /></div>
          ) : (
            <ul>
              <Row left={winsA} right={winsB} label={t("roundsWon")} head />
              {numbers.map((n) => (
                <Row
                  key={n}
                  left={pts.a.get(n)}
                  right={pts.b.get(n)}
                  label={t("gameweekLabel", { number: n })}
                  fallback={t("noGwData")}
                />
              ))}
            </ul>
          )}
        </section>

        {squadGw !== null && (
          <section className="bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden">
            <Band title={t("squadTitle", { number: squadGw })} />
            <div className="grid grid-cols-1 sm:grid-cols-2">
              <SquadColumn title={t("onlyIn", { team: a.teamName })} players={onlyA} tPos={tPos} empty={t("noSquad")} />
              <SquadColumn
                title={t("onlyIn", { team: b.teamName })}
                players={onlyB}
                tPos={tPos}
                empty={t("noSquad")}
                border
              />
            </div>
            {common.length > 0 && (
              <div className="border-t border-navy-700">
                <div className="flex items-center gap-2 px-4 pt-3 text-xs text-slate-400">
                  <span className="flex-1">{t("common", { count: common.length })}</span>
                  <span className="w-8 text-right truncate" title={a.teamName}>{a.teamName.slice(0, 3)}</span>
                  <span className="w-8 text-right truncate" title={b.teamName}>{b.teamName.slice(0, 3)}</span>
                </div>
                <ul>
                  {common.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 px-4 py-1.5 text-sm border-t border-navy-700/60 first:border-t-0">
                      <PosPill label={tPos(`short${p.pos}`)} />
                      <span className="flex-1 min-w-0 truncate font-semibold">{p.name}</span>
                      <Badges dot={p} />
                      <span className="w-8 text-right tabular-nums text-slate-300">{p.points * p.multiplier}</span>
                      <span className="w-8 text-right tabular-nums text-slate-300">
                        {(bById.get(p.id)?.points ?? 0) * (bById.get(p.id)?.multiplier ?? 1)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-slate-500 px-4 py-2">{t("commonNote")}</p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Band({ title }: { title: string }) {
  return (
    <div className="bg-navy-700 border-b border-gold-400/30 px-4 py-2.5">
      <h3 className="font-display text-sm uppercase tracking-wider text-gold-300">{title}</h3>
    </div>
  );
}

function TeamHead({ id, data, t }: { id: string; data: TeamShareData; t: Awaited<ReturnType<typeof getTranslations>> }) {
  return (
    <div className="min-w-0">
      <div
        className="w-11 h-11 rounded-full mx-auto mb-1.5 flex items-center justify-center font-display font-bold"
        style={{ backgroundColor: data.teamColor, color: readableInk(data.teamColor) }}
      >
        {data.teamName.slice(0, 2).toUpperCase()}
      </div>
      <Link href={`/tim/${id}`} className="block font-display text-lg leading-tight truncate hover:underline">
        {data.teamName}
      </Link>
      <p className="text-slate-400 text-xs mt-0.5">
        {data.rank !== null
          ? t("rankPoints", { rank: data.rank, points: data.totalPoints })
          : t("noRank", { points: data.totalPoints })}
      </p>
    </div>
  );
}

function Row({
  left,
  right,
  label,
  fallback = "–",
  head = false,
}: {
  left: number | undefined;
  right: number | undefined;
  label: string;
  fallback?: string;
  head?: boolean;
}) {
  const win = (x?: number, y?: number) => x !== undefined && y !== undefined && x > y;
  return (
    <li
      className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2 border-t border-navy-700 ${
        head ? "bg-navy-900/50" : ""
      }`}
    >
      <span
        className={`text-right font-display font-bold text-lg tabular-nums ${
          win(left, right) ? "text-gold-300" : "text-slate-400"
        }`}
      >
        {left ?? fallback}
      </span>
      <span className="w-24 text-center text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <span
        className={`font-display font-bold text-lg tabular-nums ${win(right, left) ? "text-gold-300" : "text-slate-400"}`}
      >
        {right ?? fallback}
      </span>
    </li>
  );
}

function PosPill({ label }: { label: string }) {
  return (
    <span className="shrink-0 w-9 text-center text-[10px] font-bold tracking-wide text-navy-950 bg-slate-300 rounded-full px-1 py-0.5">
      {label}
    </span>
  );
}

function Badges({ dot }: { dot: ShareDot }) {
  if (dot.isCaptain)
    return <span className="shrink-0 w-4 h-4 rounded-full bg-gold-400 text-navy-950 text-[9px] font-bold grid place-items-center">C</span>;
  if (dot.isViceCaptain)
    return <span className="shrink-0 w-4 h-4 rounded-full bg-chalk-50 text-navy-950 text-[9px] font-bold grid place-items-center">V</span>;
  return null;
}

function SquadColumn({
  title,
  players,
  tPos,
  empty,
  border = false,
}: {
  title: string;
  players: (ShareDot & { pos: (typeof POS_KEYS)[number] })[];
  tPos: Awaited<ReturnType<typeof getTranslations>>;
  empty: string;
  border?: boolean;
}) {
  return (
    <div className={border ? "sm:border-l border-t sm:border-t-0 border-navy-700" : ""}>
      <p className="text-xs text-slate-400 px-4 pt-3 pb-1 truncate">{title}</p>
      {players.length === 0 ? (
        <p className="text-slate-500 text-sm px-4 pb-3">{empty}</p>
      ) : (
        <ul>
          {players.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-4 py-1.5 text-sm border-t border-navy-700/60 first:border-t-0">
              <PosPill label={tPos(`short${p.pos}`)} />
              <span className="flex-1 min-w-0 truncate font-semibold">{p.name}</span>
              <Badges dot={p} />
              <span className="w-8 text-right tabular-nums font-bold text-gold-300">{p.points * p.multiplier}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
