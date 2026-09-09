import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTargetGameweek, isBuildingFirstSquad } from "@/lib/gameweek";
import { SquadBuilder } from "./squad-builder";
import { MyTeam, type SquadEntry } from "./my-team";
import { ChipsPanel, type ChipState, type ChipType } from "./chips-panel";
import { ResetSquadButton } from "@/components/ResetSquadButton";
import type { SelectablePlayer } from "@/lib/fantasy-rules";

export default async function MojTimPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/moj-tim");
  }

  const targetGw = await getTargetGameweek(supabase);

  // Prenos sastava iz prethodnog kola. Bez ovoga bi korisnik posle svakog
  // deadline-a dobio prazan squad builder (i, ranije, resetovan budžet).
  // Funkcija sama ne radi ništa ako sastav za ovo kolo već postoji.
  // Mora PRE čitanja profila jer usput dodaje slobodan transfer za novo kolo.
  if (targetGw) {
    await supabase.rpc("carry_over_squad", { p_gameweek_id: targetGw.id });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("team_name, team_color, budget_remaining, free_transfers, favorite_club_id, clubs(name)")
    .eq("id", user.id)
    .single();

  if (!targetGw) {
    return (
      <div>
        <h2 className="font-display text-2xl mb-4">Moj klub</h2>
        <TeamBadge teamName={profile?.team_name} teamColor={profile?.team_color} />
        <p className="text-slate-400 mt-6">
          Trenutno nema otvorenog kola za sastavljanje tima (nijedan gameweek u
          bazi nema rok koji tek dolazi). Proveri da li je uvoz kalendara
          (Faza 4, <code>npm run import-fixtures</code>) pokrenut.
        </p>
      </div>
    );
  }

  const { data: squadRows } = await supabase
    .from("squads")
    .select(
      "player_id, is_starting, squad_order, is_captain, is_vice_captain, purchase_price, players(id, first_name, last_name, position, price, status, club_id, total_points, clubs(name, primary_color))"
    )
    .eq("user_id", user.id)
    .eq("gameweek_id", targetGw.id);

  const hasSquad = Boolean(squadRows && squadRows.length > 0);

  // Lista svih igrača treba i builderu i transferima na "Moj tim" ekranu.
  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, position, price, status, club_id, total_points, clubs(name, primary_color)")
    .eq("is_active", true)
    .order("position")
    .order("price", { ascending: false });

  const selectablePlayers: SelectablePlayer[] = (players ?? []).map((p: any) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    position: p.position,
    price: Number(p.price),
    status: p.status,
    club_id: p.club_id,
    club_name: p.clubs?.name ?? "?",
    club_color: p.clubs?.primary_color ?? "#8494AC",
    total_points: p.total_points ?? 0,
  }));

  if (!hasSquad) {
    return (
      <div>
        <h2 className="font-display text-2xl mb-2">Napravi svoj tim — kolo {targetGw.number}</h2>
        <p className="text-slate-400 text-sm mb-6">
          Rok za predaju tima: {new Date(targetGw.deadline_at).toLocaleString("sr-RS")} ·
          Budžet: {Number(profile?.budget_remaining ?? 100).toFixed(1)}M
        </p>
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
  const preSeason = await isBuildingFirstSquad(supabase, user.id, targetGw.number);

  // --- Čipovi za ovo kolo ---------------------------------------------------
  // chips_usage je privatan (RLS: samo vlasnik), pa ovaj upit vraća isključivo
  // sopstvene redove. Prozor za jokere stoji na samom kolu (gameweeks.joker_window,
  // migracija 008) — Triple Captain i Favorite Club x2 su slobodni uvek.
  const { data: chipRows } = await supabase
    .from("chips_usage")
    .select("chip_type, gameweeks(number)")
    .eq("user_id", user.id);

  const { data: gwWindow } = await supabase
    .from("gameweeks")
    .select("joker_window")
    .eq("id", targetGw.id)
    .single();

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
      club_color: r.players.clubs?.primary_color ?? "#8494AC",
      total_points: r.players.total_points ?? 0,
    },
    purchasePrice: Number(r.purchase_price),
    isStarting: r.is_starting,
    squadOrder: r.squad_order,
    isCaptain: r.is_captain,
    isViceCaptain: r.is_vice_captain,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-2xl">Moj klub</h2>
        {preSeason && <ResetSquadButton gameweekId={targetGw.id} />}
      </div>
      <TeamBadge teamName={profile?.team_name} teamColor={profile?.team_color} />
      <div className="mt-6">
        <ChipsPanel
          gameweekId={targetGw.id}
          gameweekNumber={targetGw.number}
          chips={chips}
          favoriteClubName={(profile as any)?.clubs?.name ?? null}
        />
      </div>
      <div className="mt-6">
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
        />
      </div>
    </div>
  );
}

function TeamBadge({
  teamName,
  teamColor,
}: {
  teamName?: string | null;
  teamColor?: string | null;
}) {
  return (
    <div className="bg-navy-800 rounded-xl p-5 max-w-sm flex items-center gap-4">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center font-display font-bold text-navy-950 text-lg"
        style={{ backgroundColor: teamColor ?? "#E8B33D" }}
      >
        {(teamName ?? "??").slice(0, 2).toUpperCase()}
      </div>
      <div>
        <div className="font-display text-lg">{teamName}</div>
        <Link href="/podesavanja" className="text-slate-400 text-sm hover:text-chalk-50">
          Moja podešavanja
        </Link>
      </div>
    </div>
  );
}
