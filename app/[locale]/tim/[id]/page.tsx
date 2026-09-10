import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Pitch, Bench } from "@/components/Pitch";
import { Jersey } from "@/components/Jersey";

/**
 * Javni pregled tuđeg tima. Middleware ovu rutu od početka tretira kao javnu
 * (GDD sekcija 9), a rang lista sad prirodno traži da se na tim klikne.
 *
 * ⚠️ Prikazuje se SAMO sastav iz poslednjeg ZAKLJUČANOG kola, nikad tekućeg.
 * Sastav za kolo čiji rok nije prošao je tajna do roka — inače bi se tuđi tim
 * mogao prepisati pre deadline-a. RLS na `squads` je `select_all` (javno
 * čitanje), pa filtriranje MORA da uradi ova stranica; baza ga ne radi za nas.
 */
export default async function TimPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("publicTeam");
  const tPitch = await getTranslations("pitch");
  const supabase = await createClient();

  const { data: owner } = await supabase
    .from("users")
    .select("id, team_name, team_color, total_points, clubs(name)")
    .eq("id", id)
    .maybeSingle();

  if (!owner) notFound();

  const { data: lastFinalized } = await supabase
    .from("gameweeks")
    .select("id, number")
    .eq("status", "finalized")
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: standing } = await supabase
    .from("v_global_league_standings")
    .select("rank")
    .eq("user_id", id)
    .maybeSingle();

  if (!lastFinalized) {
    return (
      <Shell owner={owner} rank={standing?.rank ?? null} gameweekNumber={null}>
        <p className="text-slate-400">{t("noFinalized")}</p>
      </Shell>
    );
  }

  const { data: squadRows } = await supabase
    .from("squads")
    .select(
      "player_id, is_starting, squad_order, is_captain, is_vice_captain, auto_subbed_in, " +
        "players(id, first_name, last_name, position, price, club_id, clubs(short_name, primary_color))"
    )
    .eq("user_id", id)
    .eq("gameweek_id", lastFinalized.id);

  const { data: gwPoints } = await supabase
    .from("user_gameweek_points")
    .select("raw_points, transfer_cost, chip_type_used, total_points")
    .eq("user_id", id)
    .eq("gameweek_id", lastFinalized.id)
    .maybeSingle();

  // Poeni po igraču za to kolo — duplo kolo se sabira, isto kao u scoring engine-u.
  const playerIds = (squadRows ?? []).map((r: any) => r.player_id);
  const pointsByPlayer = new Map<string, number>();
  if (playerIds.length > 0) {
    const { data: statRows } = await supabase
      .from("player_gameweek_stats")
      .select("player_id, fantasy_points")
      .eq("gameweek_id", lastFinalized.id)
      .in("player_id", playerIds);
    for (const r of statRows ?? []) {
      pointsByPlayer.set(r.player_id, (pointsByPlayer.get(r.player_id) ?? 0) + (r.fantasy_points ?? 0));
    }
  }

  if (!squadRows || squadRows.length === 0) {
    return (
      <Shell owner={owner} rank={standing?.rank ?? null} gameweekNumber={lastFinalized.number}>
        <p className="text-slate-400">{t("noSquad", { number: lastFinalized.number })}</p>
      </Shell>
    );
  }

  const entries = (squadRows as any[]).map((r) => ({
    id: r.player_id,
    lastName: r.players?.last_name ?? "?",
    position: r.players?.position ?? "MID",
    short: r.players?.clubs?.short_name ?? "?",
    color: r.players?.clubs?.primary_color ?? "#8494AC",
    isStarting: r.is_starting,
    squadOrder: r.squad_order,
    isCaptain: r.is_captain,
    isViceCaptain: r.is_vice_captain,
    autoSubbedIn: r.auto_subbed_in,
    points: pointsByPlayer.get(r.player_id) ?? 0,
  }));

  const starters = entries.filter((e) => e.isStarting);
  const benchAll = entries
    .filter((e) => !e.isStarting)
    .sort((a, b) => a.squadOrder - b.squadOrder);
  // Golman odvojeno — squad_order mu je najniži na klupi, pa je stajao prvi i
  // izgledao kao „prvi na redu za ulazak”. Njega može zameniti samo drugi
  // golman, tako da uopšte ne učestvuje u tom redosledu.
  const benchGk = benchAll.find((e) => e.position === "GK") ?? null;
  const bench = benchAll.filter((e) => e.position !== "GK");

  const rows = (["GK", "DEF", "MID", "FWD"] as const).map((pos) =>
    starters.filter((e) => e.position === pos)
  );

  return (
    <Shell
      owner={owner}
      rank={standing?.rank ?? null}
      gameweekNumber={lastFinalized.number}
      gameweekPoints={gwPoints?.total_points ?? null}
      chip={gwPoints?.chip_type_used ?? null}
      transferCost={gwPoints?.transfer_cost ?? 0}
    >
      <Pitch>
        <div className="flex flex-col justify-between h-full py-2">
          {rows.map((line, i) => (
            <div key={i} className="flex justify-center gap-2 sm:gap-4 flex-wrap">
              {line.map((e) => (
                <PlayerCard key={e.id} entry={e} autoSubLabel={tPitch("autoSubbedIn")} />
              ))}
            </div>
          ))}
        </div>
      </Pitch>

      <Bench
        goalkeeper={
          benchGk ? (
            <PlayerCard entry={benchGk} muted autoSubLabel={tPitch("autoSubbedIn")} />
          ) : undefined
        }
      >
        {bench.map((e) => (
          <PlayerCard key={e.id} entry={e} muted autoSubLabel={tPitch("autoSubbedIn")} />
        ))}
      </Bench>
    </Shell>
  );
}

type Entry = {
  id: string;
  position: string;
  lastName: string;
  short: string;
  color: string;
  isCaptain: boolean;
  isViceCaptain: boolean;
  autoSubbedIn: boolean;
  points: number;
};

/**
 * Isti `Jersey` koji koristi i squad builder, samo bez ijednog handlera —
 * pregled tuđeg tima ništa ne menja. `flag` je iskorišćen za oznaku igrača
 * koga je auto-sub uveo u postavu.
 */
function PlayerCard({
  entry,
  muted,
  autoSubLabel,
}: {
  entry: Entry;
  muted?: boolean;
  autoSubLabel: string;
}) {
  return (
    <Jersey
      color={entry.color}
      name={entry.lastName}
      detail={`${entry.points}`}
      initials={entry.short}
      isCaptain={entry.isCaptain}
      isViceCaptain={entry.isViceCaptain}
      flag={entry.autoSubbedIn ? autoSubLabel : null}
      dimmed={muted}
    />
  );
}

async function Shell({
  owner,
  rank,
  gameweekNumber,
  gameweekPoints,
  chip,
  transferCost,
  children,
}: {
  owner: any;
  rank: number | null;
  gameweekNumber: number | null;
  gameweekPoints?: number | null;
  chip?: string | null;
  transferCost?: number;
  children: React.ReactNode;
}) {
  const t = await getTranslations("publicTeam");
  const tChips = await getTranslations("chips");

  const CHIP_NAME_KEY: Record<string, string> = {
    triple_captain: "tripleCaptainName",
    favorite_club_x2: "favoriteClubName",
    joker_1: "joker1Name",
    joker_2: "joker2Name",
  };

  return (
    <div>
      <Link href="/liga" className="text-slate-400 text-sm hover:text-chalk-50">
        ← {t("backToLeague")}
      </Link>

      <div className="flex items-center gap-4 mt-3 mb-6">
        <div
          className="w-14 h-14 shrink-0 rounded-full flex items-center justify-center font-display font-bold text-navy-950 text-lg"
          style={{ backgroundColor: owner.team_color ?? "#E8B33D" }}
        >
          {(owner.team_name ?? "??").slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-2xl truncate">{owner.team_name}</h2>
          <p className="text-slate-400 text-sm">
            {rank !== null
              ? t("rankAndPoints", { rank, points: owner.total_points ?? 0 })
              : t("points", { points: owner.total_points ?? 0 })}
            {owner.clubs?.name && <> · {t("supports", { club: owner.clubs.name })}</>}
          </p>
        </div>
      </div>

      {gameweekNumber !== null && (
        <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
          <span className="font-display">{t("squadFrom", { number: gameweekNumber })}</span>
          {gameweekPoints !== null && gameweekPoints !== undefined && (
            <span className="bg-navy-800 border border-navy-600 rounded-full px-3 py-1">
              {t("points", { points: gameweekPoints })}
            </span>
          )}
          {chip && (
            <span className="bg-gold-400 text-navy-950 font-bold rounded-full px-3 py-1 text-xs">
              {tChips((CHIP_NAME_KEY[chip] ?? "tripleCaptainName") as never)}
            </span>
          )}
          {transferCost ? (
            <span className="text-danger-400">{t("transferCost", { cost: transferCost })}</span>
          ) : null}
        </div>
      )}

      {children}
    </div>
  );
}
