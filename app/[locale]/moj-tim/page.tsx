import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { localePath } from "@/lib/locale-path";
import { createClient } from "@/lib/supabase/server";
import {
  getActivePlayersCached,
  getAvgRatingsCached,
  getGameweekFixturesCached,
  getTableDataCached,
  getUpcomingFixturesCached,
} from "@/lib/cached-data";
import { computeDifficulty } from "@/lib/fdr";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { getTargetGameweek, isBuildingFirstSquad } from "@/lib/gameweek";
import { SquadBuilder } from "./squad-builder";
import { MyTeam, type SquadEntry } from "./my-team";
import { ChipsPanel, type ChipState, type ChipType } from "./chips-panel";
import { ResetSquadButton } from "@/components/ResetSquadButton";
import { ShareTeamButton } from "@/components/ShareTeamButton";
import { WelcomeGuide } from "@/components/WelcomeGuide";
import { ActionLink } from "@/components/ActionLink";
import { ChartIcon, SwapIcon } from "@/components/icons";
import { NewBadge } from "@/components/NewBadge";
import { PlannerTip } from "@/components/PlannerTip";
import { EmptyState } from "@/components/EmptyState";
import type { SelectablePlayer } from "@/lib/fantasy-rules";
import { LocalTime } from "@/components/LocalTime";
import { readableInk } from "@/lib/color";

/** Keširan javni upit koji ne sme da sruši stranicu — kao pre, prazna lista + log. */
async function safeCached<T extends unknown[]>(load: () => Promise<T>, label: string): Promise<T> {
  try {
    return await load();
  } catch (e) {
    console.error(`[/moj-tim] ${label}:`, e);
    return [] as unknown as T;
  }
}

export default async function MojTimPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Prevodi, klijent i sesija su nezavisni — istovremeno.
  const [t, tSettings, tPlanner, tActions, supabase, user] = await Promise.all([
    getTranslations("team"),
    getTranslations("settings"),
    getTranslations("planner"),
    getTranslations("actions"),
    createClient(),
    getCurrentUser(),
  ]);

  if (!user) {
    redirect(await localePath("/login?redirect=/moj-tim"));
  }

  const targetGw = await getTargetGameweek(supabase);

  const readProfile = () =>
    supabase
      .from("users")
      .select("team_name, team_color, total_points, budget_remaining, free_transfers, favorite_club_id, clubs(name)")
      .eq("id", user.id)
      .single();
  const readSquad = () =>
    targetGw
      ? supabase
          .from("squads")
          .select(
            "player_id, is_starting, squad_order, is_captain, is_vice_captain, purchase_price, players(id, first_name, last_name, position, price, status, club_id, total_points, clubs(name, short_name, primary_color, jersey_photo_url))"
          )
          .eq("user_id", user.id)
          .eq("gameweek_id", targetGw.id)
      : Promise.resolve({ data: null });

  // Prenos sastava iz prethodnog kola. Bez ovoga bi korisnik posle svakog
  // deadline-a dobio prazan squad builder (i, ranije, resetovan budžet).
  // Funkcija sama ne radi ništa ako sastav za ovo kolo već postoji.
  //
  // Pokreće se ISTOVREMENO sa čitanjem (ranije je išla pre njega, pa je svako
  // otvaranje stranice čekalo jedan dodatan krug do baze). Menja samo dve stvari
  // — pravi sastav za ovo kolo i dodaje slobodan transfer — a to se dešava samo
  // kad sastav za ovo kolo još ne postoji; tada se oba reda čitaju ponovo ispod.
  const carryOver = targetGw
    ? supabase.rpc("carry_over_squad", { p_gameweek_id: targetGw.id })
    : Promise.resolve(null);

  // Sve što ne zavisi jedno od drugog ide istovremeno (ranije 9 upita jedan
  // za drugim). Javni podaci (igrači, ocene, mečevi) dolaze iz keša.
  const [
    ,
    profileRes,
    squadRes,
    players,
    avgRatings,
    gwFixtures,
    upcomingFixtures,
    tableData,
    { data: chipRows },
    { data: gwWindow },
    preSeason,
    { data: finalizedRows },
  ] = await Promise.all([
    carryOver,
    readProfile(),
    readSquad(),
    targetGw ? safeCached(getActivePlayersCached, "players") : Promise.resolve([] as any[]),
    targetGw
      ? safeCached(getAvgRatingsCached, "avg-ratings")
      : Promise.resolve([] as { player_id: string; avg_rating: number }[]),
    targetGw
      ? safeCached(() => getGameweekFixturesCached(targetGw.id), "gameweek-fixtures")
      : Promise.resolve([] as any[]),
    targetGw ? safeCached(getUpcomingFixturesCached, "upcoming-fixtures") : Promise.resolve([] as any[]),
    targetGw
      ? getTableDataCached().catch(() => ({ clubs: [] as any[], fixtures: [] as any[] }))
      : Promise.resolve({ clubs: [] as any[], fixtures: [] as any[] }),
    supabase.from("chips_usage").select("chip_type, gameweeks(number)").eq("user_id", user.id),
    targetGw
      ? supabase.from("gameweeks").select("joker_window").eq("id", targetGw.id).single()
      : Promise.resolve({ data: null }),
    targetGw ? isBuildingFirstSquad(supabase, user.id, targetGw.number) : Promise.resolve(false),
    supabase.from("gameweeks").select("id").eq("status", "finalized").limit(1),
  ]);

  let profile = profileRes.data;
  let squadRows = squadRes.data;
  if (targetGw && (!squadRows || squadRows.length === 0)) {
    // Sastava za ovo kolo nije bilo u trenutku čitanja — prenos ga je upravo
    // mogao napraviti (i dodati slobodan transfer), pa se oba čitaju ponovo.
    const [freshProfile, freshSquad] = await Promise.all([readProfile(), readSquad()]);
    profile = freshProfile.data;
    squadRows = freshSquad.data;
  }

  if (!targetGw) {
    const [tEmpty, tNav] = await Promise.all([getTranslations("empty"), getTranslations("nav")]);
    return (
      <div>
        <h2 className="font-display text-2xl mb-4">{tNav("myTeam")}</h2>
        <TeamBadge teamName={profile?.team_name} teamColor={profile?.team_color} />
        <EmptyState className="mt-6 max-w-xl" icon="calendar" title={tEmpty("noGwTitle")} body={tEmpty("noGwBody")} />
      </div>
    );
  }

  const hasSquad = Boolean(squadRows && squadRows.length > 0);

  const avgRatingByPlayer = new Map<string, number>(
    avgRatings.map((r) => [r.player_id, Number(r.avg_rating)])
  );

  const selectablePlayers: SelectablePlayer[] = players.map((p: any) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    position: p.position,
    price: Number(p.price),
    status: p.status,
    club_id: p.club_id,
    club_name: p.clubs?.name ?? "?",
    club_short: p.clubs?.short_name ?? "?",
    club_color: p.clubs?.primary_color ?? "#8494AC",
    club_jersey_photo_url: p.clubs?.jersey_photo_url ?? null,
    total_points: p.total_points ?? 0,
    avg_rating: avgRatingByPlayer.get(p.id) ?? null,
  }));

  if (!hasSquad) {
    return (
      <div>
        <h2 className="font-display text-2xl mb-2">{t("buildTitle", { number: targetGw.number })}</h2>
        <p className="text-slate-400 text-sm mb-6">
          {/* Rok je element sa lokalnim vremenom (LocalTime), pa se poruka seče
              na mestu zamene — t.rich() ne prima element kao obično polje. */}
          {(() => {
            const [before, after] = t("deadlineAndBudget", {
              deadline: "\u0001",
              budget: Number(profile?.budget_remaining ?? 100).toFixed(1),
            }).split("\u0001");
            return (
              <>
                {before}
                <LocalTime iso={targetGw.deadline_at} options={{ dateStyle: "short", timeStyle: "short" }} />
                {after}
              </>
            );
          })()}
        </p>
        <WelcomeGuide />
        <SquadBuilder
          gameweekId={targetGw.id}
          players={selectablePlayers}
          budgetAvailable={Number(profile?.budget_remaining ?? 100)}
        />
      </div>
    );
  }

  // Pre prvog roka tim se sme isprazniti i sastaviti ispočetka (isto pravilo
  // proverava i reset_squad u bazi). Posle toga izmene idu kroz transfere.
  /**
   * Protivnik po klubu za ovo kolo, kao u FPL-u: "PAO (H)" ispod igrača.
   * Ključ je klub, ne igrač — svi igrači istog kluba imaju isti meč.
   *
   * Duplo kolo (klub igra dvaput) daje više redova, pa se skraćenice spajaju
   * ("PAO (H), OFI (A)"). Klub bez meča (slobodno kolo) prosto neće imati unos
   * i ispod igrača ostaje cena, kao do sad.
   */
  const opponentByClub = new Map<string, string>();
  for (const f of gwFixtures) {
    const homeShort = f.home?.short_name ?? "?";
    const awayShort = f.away?.short_name ?? "?";
    const push = (clubId: string, text: string) => {
      const prev = opponentByClub.get(clubId);
      opponentByClub.set(clubId, prev ? `${prev}, ${text}` : text);
    };
    push(f.home_club_id, `${awayShort} (H)`);
    push(f.away_club_id, `${homeShort} (A)`);
  }

  /**
   * Naredna 3 meča po klubu — za prozorčić sa informacijama o igraču (klik na
   * dres u postavi). Isti "(H)"/"(A)" oblik kao opponentByClub iznad, samo za
   * SVE zakazane mečeve unapred, ne samo za ovo kolo. Kapirano na 3 po klubu
   * ovde, u JS-u — filtriranje u samom upitu bi tražilo poseban upit po klubu.
   */
  const difficulty = computeDifficulty(tableData.clubs, tableData.fixtures);
  const upcomingByClub = new Map<string, { label: string; kickoffAt: string; difficulty?: number }[]>();
  for (const f of upcomingFixtures) {
    const homeShort = f.home?.short_name ?? "?";
    const awayShort = f.away?.short_name ?? "?";
    const pushUpcoming = (clubId: string, label: string, opponentId: string) => {
      const list = upcomingByClub.get(clubId) ?? [];
      if (list.length < 3) {
        list.push({ label, kickoffAt: f.kickoff_at, difficulty: difficulty.get(opponentId) });
        upcomingByClub.set(clubId, list);
      }
    };
    pushUpcoming(f.home_club_id, `${awayShort} (H)`, f.away_club_id);
    pushUpcoming(f.away_club_id, `${homeShort} (A)`, f.home_club_id);
  }

  // --- Čipovi za ovo kolo ---------------------------------------------------
  // chips_usage je privatan (RLS: samo vlasnik), pa ovaj upit vraća isključivo
  // sopstvene redove. Prozor za jokere stoji na samom kolu (gameweeks.joker_window,
  // migracija 008) — Triple Captain i Favorite Club x2 su slobodni uvek.
  const usedByChip = new Map<string, { gameweekNumber: number }>();
  for (const row of (chipRows ?? []) as any[]) {
    usedByChip.set(row.chip_type, { gameweekNumber: row.gameweeks?.number ?? 0 });
  }

  const ALL_CHIPS: ChipType[] = ["triple_captain", "favorite_club_x2", "joker_1", "joker_2"];
  const chips: ChipState[] = ALL_CHIPS.map((type) => {
    const used = usedByChip.get(type) ?? null;
    const isJoker = type === "joker_1" || type === "joker_2";
    return {
      type,
      usedInGameweek: used?.gameweekNumber ?? null,
      activeNow: used?.gameweekNumber === targetGw.number,
      availableThisGameweek: isJoker ? gwWindow?.joker_window === type : true,
    };
  });

  const squad: SquadEntry[] = (squadRows ?? []).map((r: any) => ({
    player: {
      id: r.players.id,
      first_name: r.players.first_name,
      last_name: r.players.last_name,
      position: r.players.position,
      price: Number(r.players.price),
      status: r.players.status,
      club_id: r.players.club_id,
      club_name: r.players.clubs?.name ?? "?",
      club_short: r.players.clubs?.short_name ?? "?",
      club_color: r.players.clubs?.primary_color ?? "#8494AC",
      club_jersey_photo_url: r.players.clubs?.jersey_photo_url ?? null,
      total_points: r.players.total_points ?? 0,
      avg_rating: avgRatingByPlayer.get(r.players.id) ?? null,
    },
    purchasePrice: Number(r.purchase_price),
    isStarting: r.is_starting,
    squadOrder: r.squad_order,
    isCaptain: r.is_captain,
    isViceCaptain: r.is_vice_captain,
  }));

  return (
    <div>
      {/* Sažet zaglavni red umesto odvojenog naslova + velike TeamBadge
          kartice — po uzoru na FPL-ov "Pick Team" vrh, koji ime tima i
          identitet drži u jednoj tankoj traci da ostane mesta za teren. */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0 sm:flex-1">
          <div
            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center font-display font-bold text-sm"
            style={{ backgroundColor: profile?.team_color ?? "#E8B33D", color: readableInk(profile?.team_color ?? "#E8B33D") }}
          >
            {(profile?.team_name ?? "??").slice(0, 2).toUpperCase()}
          </div>
          <h2 className="font-display text-lg sm:text-xl truncate">{profile?.team_name}</h2>
        </div>
        {/* Na telefonu tri jednaka dugmeta u jednom redu (ikonica iznad oznake),
            od sm naviše u redu sa punim oznakama — vidi components/action-styles.ts. */}
        <div className="grid grid-cols-3 gap-1.5 w-full sm:w-auto sm:flex sm:items-center sm:gap-2">
          {(finalizedRows?.length ?? 0) > 0 && (
            <ActionLink
              href={`/tim/${user.id}`}
              icon={ChartIcon}
              label={t("pointsHistory")}
              shortLabel={tActions("pointsShort")}
            />
          )}
          {squad.length > 0 && !preSeason && (
            <ActionLink
              href="/planer"
              icon={SwapIcon}
              variant="plan"
              label={tPlanner("openPlanner")}
              shortLabel={tActions("plannerShort")}
              badge={<NewBadge />}
            />
          )}
          {squad.length > 0 && (
            <ShareTeamButton
              mode="current"
              userId={user.id}
              teamName={profile?.team_name ?? ""}
              totalPoints={Number(profile?.total_points ?? 0)}
            />
          )}
          {preSeason && <ResetSquadButton gameweekId={targetGw.id} />}
        </div>
      </div>
      {squad.length > 0 && !preSeason && (
        <div className="mt-3">
          <PlannerTip />
        </div>
      )}
      <div className="mt-3">
        <ChipsPanel
          gameweekId={targetGw.id}
          gameweekNumber={targetGw.number}
          chips={chips}
          favoriteClubName={(profile as any)?.clubs?.name ?? null}
        />
      </div>
      <div className="mt-3">
        <MyTeam
          key={squad
            .map((e) => e.player.id)
            .sort()
            .join(",")}
          gameweekId={targetGw.id}
          gameweekNumber={targetGw.number}
          deadlineAt={targetGw.deadline_at}
          squad={squad}
          allPlayers={selectablePlayers}
          budgetRemaining={Number(profile?.budget_remaining ?? 0)}
          freeTransfers={Number(profile?.free_transfers ?? 0)}
          preSeason={preSeason}
          opponentByClub={Object.fromEntries(opponentByClub)}
          upcomingByClub={Object.fromEntries(upcomingByClub)}
        />
      </div>
    </div>
  );
}

async function TeamBadge({
  teamName,
  teamColor,
}: {
  teamName?: string | null;
  teamColor?: string | null;
}) {
  const tSettings = await getTranslations("settings");

  return (
    <div className="bg-navy-800 rounded-xl p-5 max-w-sm flex items-center gap-4">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center font-display font-bold text-lg"
        style={{ backgroundColor: teamColor ?? "#E8B33D", color: readableInk(teamColor ?? "#E8B33D") }}
      >
        {(teamName ?? "??").slice(0, 2).toUpperCase()}
      </div>
      <div>
        <div className="font-display text-lg">{teamName}</div>
        <Link href="/podesavanja" className="text-slate-400 text-sm hover:text-chalk-50">
          {tSettings("title")}
        </Link>
      </div>
    </div>
  );
}
