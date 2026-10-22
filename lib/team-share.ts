import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveCaptainMultiplier,
  resolveEffectiveStartingXI,
  type ChipType,
  type SquadPlayerForScoring,
} from "@/lib/scoring";
import { playerShirtName, type Position } from "@/lib/fantasy-rules";
import { getTargetGameweek } from "@/lib/gameweek";
import { getGameweeksCached, getGameweekStatsCached, getManagerCountCached } from "@/lib/cached-data";

export type ShareDot = {
  id: string;
  /** Prezime, a za igrače sa jednim imenom (Taison) ime — isto kao pločica na terenu. */
  name: string;
  color: string;
  /** Skraćenica kluba na dresu (PAOK, OLY…). */
  short: string;
  /** Fotografija dresa kluba, ako je klub ima (clubs.jersey_photo_url). */
  photoUrl: string | null;
  points: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
  /** Tekst u donjoj pločici umesto poena (npr. protivnik „PAO (H)“) — za sastav koji još nema poene. */
  detail?: string;
};

export type TeamShareData = {
  teamName: string;
  teamColor: string;
  clubName: string | null;
  totalPoints: number;
  rank: number | null;
  managers: number | null;
  /** Poslednje ZAKLJUČANO kolo — tekuće je tajna do roka (isto pravilo kao na /tim/[id]). */
  gameweek: { number: number; points: number | null } | null;
  /** Postava iz tog kola po redovima GK / DEF / MID / FWD; prazno bez sastava. */
  rows: ShareDot[][];
};

/**
 * Podaci za sliku tima (pregled linka i „Podeli tim"). Isti izbor kola i ista
 * efektivna postava (auto-sub) kao na stranici /tim/[id], da se slika ne može
 * razminuti sa onim što posetilac vidi.
 *
 * Zahteva klijent koji sme da čita tuđe redove (service role) — pozivalac
 * odlučuje ko sme da dobije koji deo (pregled linka ne prikazuje imena igrača).
 */
export async function loadTeamShare(
  supabase: SupabaseClient,
  userId: string,
  opts: { current?: boolean } = {}
): Promise<TeamShareData | null> {
  // Poslednje zaključano kolo i broj menadžera su javni podaci iz keša, pa se
  // sve ostalo čita ODJEDNOM (ranije u dva uzastopna kruga do baze).
  const lastFinal = opts.current
    ? null
    : [...(await getGameweeksCached())].filter((g) => g.status === "finalized").sort((x, y) => y.number - x.number)[0] ??
      null;

  const [{ data: owner }, { data: standing }, managers, gwPointsRes, squadRes, allStats] = await Promise.all([
    supabase
      .from("users")
      .select("team_name, team_color, total_points, clubs(name)")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("v_global_league_standings").select("rank").eq("user_id", userId).maybeSingle(),
    getManagerCountCached().catch(() => null),
    lastFinal
      ? supabase
          .from("user_gameweek_points")
          .select("total_points, chip_type_used")
          .eq("user_id", userId)
          .eq("gameweek_id", lastFinal.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    lastFinal
      ? supabase
          .from("squads")
          .select(
            "player_id, is_starting, squad_order, is_captain, is_vice_captain, " +
              "players(first_name, last_name, position, club_id, clubs(primary_color, short_name, jersey_photo_url))"
          )
          .eq("user_id", userId)
          .eq("gameweek_id", lastFinal.id)
      : Promise.resolve({ data: null }),
    lastFinal ? getGameweekStatsCached(lastFinal.id).catch(() => [] as any[]) : Promise.resolve([] as any[]),
  ]);
  if (!owner) return null;

  const data: TeamShareData = {
    teamName: owner.team_name ?? "Fudaristo",
    teamColor: owner.team_color ?? "#5AB4FF",
    clubName: (owner as any).clubs?.name ?? null,
    totalPoints: owner.total_points ?? 0,
    rank: standing?.rank !== undefined && standing?.rank !== null ? Number(standing.rank) : null,
    managers: managers ?? null,
    gameweek: null,
    rows: [],
  };

  if (opts.current) return loadCurrentSquad(supabase, userId, data);

  const gw = lastFinal;
  if (!gw) return data;

  const gwPoints = gwPointsRes.data as { total_points: number | null; chip_type_used: string | null } | null;
  const squadRows = squadRes.data;
  const statRows = allStats;

  data.gameweek = { number: gw.number, points: gwPoints?.total_points ?? null };
  if (!squadRows || squadRows.length === 0) return data;

  const squadIds = new Set<string>((squadRows as any[]).map((r) => r.player_id));
  const minutes = new Map<string, number>();
  const points = new Map<string, number>();
  for (const r of (statRows ?? []) as any[]) {
    if (!squadIds.has(r.player_id)) continue;
    minutes.set(r.player_id, (minutes.get(r.player_id) ?? 0) + (r.minutes_played ?? 0));
    points.set(r.player_id, (points.get(r.player_id) ?? 0) + (r.fantasy_points ?? 0));
  }

  const forScoring: SquadPlayerForScoring[] = (squadRows as any[]).map((r) => ({
    playerId: r.player_id,
    position: (r.players?.position ?? "MID") as Position,
    isStarting: r.is_starting,
    squadOrder: r.squad_order,
    isCaptain: r.is_captain,
    isViceCaptain: r.is_vice_captain,
    clubId: r.players?.club_id ?? "",
    minutesPlayed: minutes.get(r.player_id) ?? 0,
    fantasyPoints: points.get(r.player_id) ?? 0,
  }));
  const { effectiveIds } = resolveEffectiveStartingXI(forScoring);
  const { captainId, multiplier } = resolveCaptainMultiplier(
    forScoring,
    (gwPoints?.chip_type_used ?? null) as ChipType,
    effectiveIds
  );

  data.rows = (["GK", "DEF", "MID", "FWD"] as const).map((pos) =>
    (squadRows as any[])
      .filter((r) => effectiveIds.has(r.player_id) && r.players?.position === pos)
      .map((r) => ({
        id: r.player_id,
        name: playerShirtName({ first_name: r.players?.first_name ?? "", last_name: r.players?.last_name ?? "" }) || "?",
        color: r.players?.clubs?.primary_color ?? "#8494AC",
        short: r.players?.clubs?.short_name ?? "",
        photoUrl: r.players?.clubs?.jersey_photo_url ?? null,
        points: points.get(r.player_id) ?? 0,
        isCaptain: r.is_captain,
        isViceCaptain: r.is_vice_captain,
        multiplier: r.player_id === captainId ? multiplier : 1,
      }))
  );
  return data;
}

/**
 * Sastav koji je SAČUVAN za naredno kolo (ono što se vidi na „Moj klub“), bez
 * poena — kolo još nije odigrano. Ispod igrača stoji protivnik, a ako ga nema
 * (slobodno kolo) cena. Nepotvrđeni transferi sa stranice nisu u bazi, pa nisu ni ovde.
 */
async function loadCurrentSquad(supabase: SupabaseClient, userId: string, data: TeamShareData): Promise<TeamShareData> {
  const gw = await getTargetGameweek(supabase);
  if (!gw) return data;

  const [{ data: squadRows }, { data: fixtures }] = await Promise.all([
    supabase
      .from("squads")
      .select(
        "player_id, is_starting, squad_order, is_captain, is_vice_captain, " +
          "players(first_name, last_name, position, price, club_id, clubs(primary_color, short_name, jersey_photo_url))"
      )
      .eq("user_id", userId)
      .eq("gameweek_id", gw.id),
    supabase
      .from("fixtures")
      .select("home_club_id, away_club_id, home:home_club_id(short_name), away:away_club_id(short_name)")
      .eq("gameweek_id", gw.id),
  ]);

  data.gameweek = { number: gw.number, points: null };

  const opponent = new Map<string, string>();
  for (const f of (fixtures ?? []) as any[]) {
    const push = (clubId: string, text: string) => {
      const prev = opponent.get(clubId);
      opponent.set(clubId, prev ? `${prev}, ${text}` : text);
    };
    push(f.home_club_id, `${f.away?.short_name ?? "?"} (H)`);
    push(f.away_club_id, `${f.home?.short_name ?? "?"} (A)`);
  }

  data.rows = (["GK", "DEF", "MID", "FWD"] as const).map((pos) =>
    ((squadRows ?? []) as any[])
      .filter((r) => r.is_starting && r.players?.position === pos)
      .sort((a, b) => a.squad_order - b.squad_order)
      .map((r) => ({
        id: r.player_id,
        name: playerShirtName({ first_name: r.players?.first_name ?? "", last_name: r.players?.last_name ?? "" }) || "?",
        color: r.players?.clubs?.primary_color ?? "#8494AC",
        short: r.players?.clubs?.short_name ?? "",
        photoUrl: r.players?.clubs?.jersey_photo_url ?? null,
        points: 0,
        isCaptain: r.is_captain,
        isViceCaptain: r.is_vice_captain,
        multiplier: 1,
        detail: opponent.get(r.players?.club_id) ?? `${Number(r.players?.price ?? 0).toFixed(1)}M`,
      }))
  );
  return data;
}
