import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
  describeRowFantasyPoints,
  resolveCaptainMultiplier,
  resolveEffectiveStartingXI,
  type ChipType,
  type SquadPlayerForScoring,
} from "@/lib/scoring";
import type { Position } from "@/lib/fantasy-rules";
import { PublicSquadPitch, type PublicEntry } from "@/components/PublicSquadPitch";
import type { BreakdownGroup } from "@/components/PlayerPointsBreakdownPopover";

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
        "players(id, first_name, last_name, position, price, club_id, clubs(name, short_name, primary_color))"
    )
    .eq("user_id", id)
    .eq("gameweek_id", lastFinalized.id);

  // Poeni po igraču za to kolo — duplo kolo se sabira, isto kao u scoring engine-u.
  // Sad se vuku i SIROVE vrednosti (minuti, golovi...), ne samo fantasy_points,
  // da bi se mogao prikazati raspis "za šta je igrač dobio poene" na klik.
  const playerIds = (squadRows ?? []).map((r: any) => r.player_id);
  const pointsByPlayer = new Map<string, number>();
  const minutesByPlayer = new Map<string, number>();
  const breakdownByPlayer = new Map<string, BreakdownGroup[]>();

  if (playerIds.length > 0) {
    const positionByPlayer = new Map<string, Position>(
      (squadRows ?? []).map((r: any) => [r.player_id, (r.players?.position ?? "MID") as Position])
    );

    const { data: statRows } = await supabase
      .from("player_gameweek_stats")
      .select(
        "player_id, fixture_id, minutes_played, goals, assists, clean_sheet, goals_conceded, saves, " +
          "penalties_saved, penalties_missed, yellow_cards, red_cards, own_goals, bonus_points, fantasy_points"
      )
      .eq("gameweek_id", lastFinalized.id)
      .in("player_id", playerIds);

    const rowsByPlayer = new Map<string, any[]>();
    for (const r of (statRows ?? []) as any[]) {
      pointsByPlayer.set(r.player_id, (pointsByPlayer.get(r.player_id) ?? 0) + (r.fantasy_points ?? 0));
      minutesByPlayer.set(r.player_id, (minutesByPlayer.get(r.player_id) ?? 0) + (r.minutes_played ?? 0));
      if (!rowsByPlayer.has(r.player_id)) rowsByPlayer.set(r.player_id, []);
      rowsByPlayer.get(r.player_id)!.push(r);
    }

    for (const [playerId, prows] of rowsByPlayer) {
      const position = positionByPlayer.get(playerId) ?? "MID";
      const groups: BreakdownGroup[] = prows.map((r, i) => ({
        // Oznaka meča samo kod duplog kola (2+ redova za istog igrača) — inače
        // se izostavlja, videti PlayerPointsBreakdownPopover.
        matchLabel: prows.length > 1 ? `Meč ${i + 1}` : undefined,
        items: describeRowFantasyPoints({
          position,
          minutes_played: r.minutes_played,
          goals: r.goals,
          assists: r.assists,
          clean_sheet: r.clean_sheet,
          goals_conceded: r.goals_conceded,
          saves: r.saves,
          penalties_saved: r.penalties_saved,
          penalties_missed: r.penalties_missed,
          yellow_cards: r.yellow_cards,
          red_cards: r.red_cards,
          own_goals: r.own_goals,
          bonus_points: r.bonus_points,
        }),
        subtotal: r.fantasy_points ?? 0,
      }));
      breakdownByPlayer.set(playerId, groups);
    }
  }

  const { data: gwPoints } = await supabase
    .from("user_gameweek_points")
    .select("raw_points, transfer_cost, chip_type_used, total_points")
    .eq("user_id", id)
    .eq("gameweek_id", lastFinalized.id)
    .maybeSingle();

  if (!squadRows || squadRows.length === 0) {
    return (
      <Shell owner={owner} rank={standing?.rank ?? null} gameweekNumber={lastFinalized.number}>
        <p className="text-slate-400">{t("noSquad", { number: lastFinalized.number })}</p>
      </Shell>
    );
  }

  // Ko je STVARNO igrao — auto-sub (klupa ulazi umesto startera sa 0 minuta,
  // isti FPL princip kao u scoring engine-u). Ranije se ovde koristio samo
  // sačuvani izbor (squads.is_starting), pa je starter koji nije odigrao
  // nijedan minut i dalje bio prikazan na terenu, a onaj ko ga je stvarno
  // zamenio ostajao vizuelno na klupi — iako je real donosio poene.
  // resolveEffectiveStartingXI je IST funkcija koju je koristio i pravi
  // obračun, pa se prikaz ne može razminuti sa stvarnim poenima.
  const squadForScoring: SquadPlayerForScoring[] = (squadRows as any[]).map((r) => ({
    playerId: r.player_id,
    position: r.players?.position ?? "MID",
    isStarting: r.is_starting,
    squadOrder: r.squad_order,
    isCaptain: r.is_captain,
    isViceCaptain: r.is_vice_captain,
    clubId: r.players?.club_id ?? "",
    minutesPlayed: minutesByPlayer.get(r.player_id) ?? 0,
    fantasyPoints: pointsByPlayer.get(r.player_id) ?? 0,
  }));
  const { effectiveIds, autoSubbedInIds } = resolveEffectiveStartingXI(squadForScoring);

  // Kapiten (ili vice ako kapiten nije odigrao) nosi množilac — 2x, ili 3x uz
  // Triple Captain. Ovo je ISTA funkcija koju koristi pravi obračun poena, pa
  // se prikaz ne može razminuti sa stvarno upisanim total_points korisnika.
  // Raw fantasy_points po igraču (players.total_points, player_gameweek_stats)
  // ostaje nemnožen svuda drugde — ovde se množilac primenjuje SAMO za prikaz
  // na ovoj konkretnoj postavi, gde se tačno zna ko je nosio traku to kolo.
  const { captainId: multiplierPlayerId, multiplier: captainMultiplier } = resolveCaptainMultiplier(
    squadForScoring,
    (gwPoints?.chip_type_used ?? null) as ChipType,
    effectiveIds
  );

  const entries: PublicEntry[] = (squadRows as any[]).map((r) => ({
    id: r.player_id,
    position: r.players?.position ?? "MID",
    firstName: r.players?.first_name ?? "?",
    lastName: r.players?.last_name ?? "",
    clubName: r.players?.clubs?.name ?? "?",
    short: r.players?.clubs?.short_name ?? "?",
    color: r.players?.clubs?.primary_color ?? "#8494AC",
    isStarting: r.is_starting,
    squadOrder: r.squad_order,
    isCaptain: r.is_captain,
    isViceCaptain: r.is_vice_captain,
    autoSubbedIn: autoSubbedInIds.has(r.player_id),
    points: pointsByPlayer.get(r.player_id) ?? 0,
    multiplier: r.player_id === multiplierPlayerId ? captainMultiplier : 1,
    // Nema reda statistike uopšte (klub bez meča to kolo, ili podaci nikad
    // nisu uneti) — isti tekst koji describeRowFantasyPoints koristi za red
    // sa svim nulama, da se ne izmišlja drugačija poruka za isto stanje.
    breakdown: breakdownByPlayer.get(r.player_id) ?? [
      { items: [{ label: "Bez odigranih minuta", value: 0 }], subtotal: 0 },
    ],
  })) as any;

  // Postava/klupa na terenu prate EFEKTIVNI sastav (posle auto-sub-a), ne
  // sirov squads.is_starting — videti komentar iznad.
  const starters = entries.filter((e: any) => effectiveIds.has(e.id));
  const benchAll = entries
    .filter((e: any) => !effectiveIds.has(e.id))
    .sort((a: any, b: any) => {
      // Pravi klupski igrači (koji nisu ušli) pre bivših startera koji nisu
      // odigrali — oba dele "klupu" vizuelno, ali klupa ima svoj smislen
      // redosled (squad_order), dok bivši starteri nemaju šta da traže tu
      // po prioritetu ulaska.
      if (a.isStarting !== b.isStarting) return a.isStarting ? 1 : -1;
      return a.squadOrder - b.squadOrder;
    });
  // Golman odvojeno — squad_order mu je najniži na klupi, pa je stajao prvi i
  // izgledao kao „prvi na redu za ulazak”. Njega može zameniti samo drugi
  // golman, tako da uopšte ne učestvuje u tom redosledu.
  const benchGk = benchAll.find((e: any) => e.position === "GK") ?? null;
  const bench = benchAll.filter((e: any) => e.position !== "GK");

  const rows = (["GK", "DEF", "MID", "FWD"] as const).map((pos) =>
    starters.filter((e: any) => e.position === pos)
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
      <PublicSquadPitch
        rows={rows}
        benchGk={benchGk}
        bench={bench}
        autoSubLabel={tPitch("autoSubbedIn")}
      />
    </Shell>
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
            <span
              className={`rounded-full px-3 py-1 ${
                gameweekPoints > 0
                  ? "bg-pitch-500/10 border border-pitch-400/40 text-pitch-400 font-semibold"
                  : "bg-navy-800 border border-navy-600"
              }`}
            >
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
