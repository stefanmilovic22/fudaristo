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
import { readableInk } from "@/lib/color";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { GameweekNav } from "@/components/GameweekNav";
import { TeamSideCards } from "@/components/TeamSideCards";

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
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<{ kolo?: string }>;
}) {
  const { id, locale } = await params;
  const { kolo } = await searchParams;
  setRequestLocale(locale);
  // Sve što ne zavisi jedno od drugog ide ISTOVREMENO. Ranije je ovo bilo
  // osam upita jedan za drugim, pa je svaka promena kola čekala zbir svih
  // odgovora baze.
  const [t, tPitch, tScoring, supabase, viewer] = await Promise.all([
    getTranslations("publicTeam"),
    getTranslations("pitch"),
    getTranslations("scoring"),
    createClient(),
    getCurrentUser(),
  ]);

  const [{ data: owner }, { data: finalizedGws }, { data: allGwPoints }, { data: standing }, { count: managerCount }] =
    await Promise.all([
      supabase
        .from("users")
        .select("id, team_name, team_color, total_points, clubs(name, short_name, primary_color)")
        .eq("id", id)
        .maybeSingle(),
      // Sva zaključana kola (najnovije prvo). Samo ZAKLJUČANA kola su javna:
      // sastav za kolo čiji rok nije prošao ostaje tajna (napomena na vrhu).
      supabase
        .from("gameweeks")
        .select("id, number")
        .eq("status", "finalized")
        .order("number", { ascending: false }),
      // Poeni tima po zaključanim kolima — za izbor kola i za zaglavlje. Filter
      // po statusu ide kroz vezu, da ne mora da se čeka lista kola.
      supabase
        .from("user_gameweek_points")
        .select("gameweek_id, raw_points, transfer_cost, chip_type_used, total_points, gameweeks!inner(status)")
        .eq("user_id", id)
        .eq("gameweeks.status", "finalized"),
      supabase.from("v_global_league_standings").select("rank").eq("user_id", id).maybeSingle(),
      supabase.from("v_global_league_standings").select("user_id", { count: "exact", head: true }),
    ]);

  if (!owner) notFound();

  // Bira se jedno kolo iz ?kolo=N, a bez toga ili uz nepoznat broj — poslednje.
  const lastFinalized =
    (finalizedGws ?? []).find((g) => String(g.number) === kolo) ?? (finalizedGws ?? [])[0] ?? null;

  const pointsByGameweekId = new Map<string, any>((allGwPoints ?? []).map((r: any) => [r.gameweek_id, r]));

  const isOwnTeam = viewer?.id === id;
  // Kolo u kom tim nije imao sastav nema red u user_gameweek_points (obračun
  // piše samo za korisnike sa sastavom) — takvo kolo se u izboru isključuje.
  const picker = lastFinalized ? (
    <GameweekNav
      basePath={`/tim/${id}`}
      current={lastFinalized.number}
      items={(finalizedGws ?? [])
        .map((g) => ({ number: g.number, hasSquad: Boolean(pointsByGameweekId.get(g.id)) }))
        .sort((a, b) => a.number - b.number)}
    />
  ) : null;

  // Leva kolona kartica (samo web) — vidi components/TeamSideCards.tsx.
  const side = lastFinalized ? (
    <TeamSideCards
      basePath={`/tim/${id}`}
      current={lastFinalized.number}
      history={(finalizedGws ?? [])
        .map((g) => {
          const pts = pointsByGameweekId.get(g.id);
          return { number: g.number, points: (pts?.total_points ?? null) as number | null, hasSquad: Boolean(pts) };
        })
        .sort((a, b) => a.number - b.number)}
      overallPoints={owner.total_points ?? 0}
      rank={standing?.rank ?? null}
      managers={managerCount ?? null}
      gameweekPoints={pointsByGameweekId.get(lastFinalized.id)?.total_points ?? null}
      teamName={owner.team_name ?? ""}
      teamColor={owner.team_color ?? "#E8B33D"}
      club={(owner as any).clubs ?? null}
    />
  ) : null;

  if (!lastFinalized) {
    return (
      <Shell owner={owner} rank={standing?.rank ?? null} gameweekNumber={null} isOwnTeam={isOwnTeam}>
        <p className="text-slate-400">{t("noFinalized")}</p>
      </Shell>
    );
  }

  // Sastav i statistika kola istovremeno. Statistika se vuče za CELO kolo (do
  // par stotina redova) umesto za igrače iz sastava — tako ne mora da se čeka
  // sastav da bi se znali njihovi id-jevi; višak se odbacuje ispod.
  const [{ data: squadRows }, { data: gwStatRows }] = await Promise.all([
    supabase
      .from("squads")
      .select(
        "player_id, is_starting, squad_order, is_captain, is_vice_captain, auto_subbed_in, " +
          "players(id, first_name, last_name, position, price, club_id, clubs(name, short_name, primary_color, jersey_photo_url))"
      )
      .eq("user_id", id)
      .eq("gameweek_id", lastFinalized.id),
    supabase
      .from("player_gameweek_stats")
      .select(
        "player_id, fixture_id, minutes_played, goals, assists, clean_sheet, goals_conceded, saves, " +
          "penalties_saved, penalties_missed, yellow_cards, red_cards, own_goals, bonus_points, fantasy_points, " +
          "sofascore_rating"
      )
      .eq("gameweek_id", lastFinalized.id),
  ]);

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

    const squadPlayerIds = new Set<string>(playerIds);
    const statRows = ((gwStatRows ?? []) as any[]).filter((r) => squadPlayerIds.has(r.player_id));

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
        matchLabel: prows.length > 1 ? tScoring("match", { number: i + 1 }) : undefined,
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
        rating: r.sofascore_rating !== null && r.sofascore_rating !== undefined ? Number(r.sofascore_rating) : null,
      }));
      breakdownByPlayer.set(playerId, groups);
    }
  }

  const gwPoints = pointsByGameweekId.get(lastFinalized.id) ?? null;

  if (!squadRows || squadRows.length === 0) {
    return (
      <Shell
        owner={owner}
        rank={standing?.rank ?? null}
        gameweekNumber={lastFinalized.number}
        isOwnTeam={isOwnTeam}
        picker={picker}
        gameweekPoints={gwPoints?.total_points ?? null}
      rawPoints={gwPoints?.raw_points ?? null}
      >
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
    jerseyPhotoUrl: r.players?.clubs?.jersey_photo_url ?? null,
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
      { items: [{ label: "Bez odigranih minuta", key: "noMinutes", value: 0 }], subtotal: 0 },
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
      isOwnTeam={isOwnTeam}
      picker={picker}
      side={side}
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
  rawPoints,
  chip,
  transferCost,
  isOwnTeam = false,
  picker = null,
  side = null,
  children,
}: {
  owner: any;
  rank: number | null;
  gameweekNumber: number | null;
  gameweekPoints?: number | null;
  rawPoints?: number | null;
  chip?: string | null;
  transferCost?: number;
  isOwnTeam?: boolean;
  picker?: React.ReactNode;
  side?: React.ReactNode;
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
  const chipName = chip ? tChips((CHIP_NAME_KEY[chip] ?? "tripleCaptainName") as never) : null;
  const dash = "–";

  return (
    <div
      className={`mx-auto max-w-[680px] ${
        side ? "lg:max-w-[1020px] lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-7" : ""
      }`}
    >
      <div className="lg:col-start-1 lg:row-start-1 flex items-start justify-between gap-3 mb-3 lg:flex-col-reverse lg:items-start lg:justify-end lg:gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-full flex items-center justify-center font-display font-bold text-lg"
            style={{ backgroundColor: owner.team_color ?? "#E8B33D", color: readableInk(owner.team_color ?? "#E8B33D") }}
          >
            {(owner.team_name ?? "??").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xl sm:text-2xl truncate">{owner.team_name}</h2>
            <p className="text-slate-400 text-sm">
              {rank !== null
                ? t("rankAndPoints", { rank, points: owner.total_points ?? 0 })
                : t("points", { points: owner.total_points ?? 0 })}
            </p>
          </div>
        </div>
        {isOwnTeam ? (
          <Link href="/moj-tim" className="shrink-0 text-slate-400 text-sm hover:text-chalk-50 whitespace-nowrap">
            ← {t("backToMyTeam")}
          </Link>
        ) : (
          <Link href="/liga" className="shrink-0 text-slate-400 text-sm hover:text-chalk-50 whitespace-nowrap">
            ← {t("backToLeague")}
          </Link>
        )}
      </div>

      {/* Leva kolona kartica — samo web (lg+). Unutrašnji sadržaj je apsolutno
          pozicioniran, pa kolona NE utiče na visinu reda: visinu daje desna
          strana (traka + teren + klupa), a istorija kola popunjava ostatak i
          skroluje se. Tako leva kolona završava u ravni sa klupom. */}
      {side && (
        <div className="hidden lg:block relative lg:col-start-1 lg:row-start-2">
          <div className="absolute inset-0 flex flex-col gap-3">{side}</div>
        </div>
      )}

      <div className={side ? "lg:col-start-2 lg:row-start-1 lg:row-span-2 min-w-0" : ""}>
      {/* Traka kao na FPL-u: naslov kola sa strelicama, ispod brojevi — poeni
          kola u sredini, veliki. Sve što je ranije bilo u padajućoj listi i
          pločicama oko terena je ovde, u jednom redu. */}
      {gameweekNumber !== null && (
        <section className="bg-navy-800 border border-gold-400/50 rounded-xl px-2 sm:px-4 pt-2.5 pb-2.5 mb-3">
          {picker}
          {chipName && (
            <div className="flex justify-center mt-2">
              <span className="bg-gold-400 text-navy-950 font-bold rounded-full px-3 py-0.5 text-xs">{chipName}</span>
            </div>
          )}
          <div className="grid grid-cols-5 items-center gap-1 mt-2 text-center">
            <Stat value={rawPoints ?? dash} label={t("rawPoints")} />
            <Stat value={transferCost ? transferCost : 0} label={t("transferCostLabel")} danger={Boolean(transferCost)} />
            <div className="bg-gradient-to-br from-gold-400 to-[#3E86F0] rounded-lg py-1.5 px-1 text-navy-950">
              <div className="font-display text-2xl sm:text-3xl font-bold leading-none tabular-nums">
                {gameweekPoints ?? dash}
              </div>
              <div className="text-[10px] sm:text-xs font-semibold mt-1 leading-tight">{t("gwPointsLabel")}</div>
            </div>
            <Stat value={owner.total_points ?? 0} label={t("totalLabel")} />
            <Stat value={rank ?? dash} label={t("rankLabel")} />
          </div>
        </section>
      )}

      <div>{children}</div>
      </div>
    </div>
  );
}

function Stat({ value, label, danger = false }: { value: number | string; label: string; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={`font-display text-xl sm:text-2xl font-bold tabular-nums ${danger ? "text-danger-400" : ""}`}>
        {value}
      </div>
      <div className="text-slate-400 text-[10px] sm:text-xs leading-tight mt-0.5">{label}</div>
    </div>
  );
}
