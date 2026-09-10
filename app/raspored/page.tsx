import { createClient } from "@/lib/supabase/server";
import { FixturesBoard, type GameweekFixtures } from "./fixtures-board";
import { DataLoadError } from "@/components/DataLoadError";

export const metadata = { title: "Raspored i rezultati — Fudaristo" };

export default async function RasporedPage() {
  const supabase = await createClient();

  const { data: gameweeks, error: gwError } = await supabase
    .from("gameweeks")
    .select("id, number, deadline_at, starts_at, status")
    .order("number", { ascending: true });

  const { data: fixtures, error: fxError } = await supabase
    .from("fixtures")
    .select(
      "id, gameweek_id, kickoff_at, status, home_score, away_score, " +
        "home:home_club_id(name, short_name, primary_color), " +
        "away:away_club_id(name, short_name, primary_color)"
    )
    .order("kickoff_at", { ascending: true });

  if (gwError || fxError) {
    // U Vercel log ide ceo objekat; na stranicu ide poruka. Bez ovoga se nije
    // videlo NIŠTA — ni koji od dva upita je pao, ni zašto.
    console.error("[/raspored] gameweeks:", gwError, "fixtures:", fxError);
    return (
      <Shell>
        <DataLoadError what="rasporeda" error={gwError ?? fxError} />
      </Shell>
    );
  }

  if (!gameweeks || gameweeks.length === 0) {
    return (
      <Shell>
        <p className="text-slate-400">
          Nijedno kolo još nije uvezeno. Pokreni{" "}
          <code className="text-slate-300">npm run import-fixtures-csv -- scripts/fixtures-template.csv</code>{" "}
          da popuniš raspored.
        </p>
      </Shell>
    );
  }

  const byGameweek: GameweekFixtures[] = gameweeks.map((gw) => ({
    id: gw.id,
    number: gw.number,
    status: gw.status,
    deadlineAt: gw.deadline_at,
    matches: (fixtures ?? [])
      .filter((f: any) => f.gameweek_id === gw.id)
      .map((f: any) => ({
        id: f.id,
        kickoffAt: f.kickoff_at,
        status: f.status,
        homeScore: f.home_score,
        awayScore: f.away_score,
        home: {
          name: f.home?.name ?? "?",
          short: f.home?.short_name ?? "?",
          color: f.home?.primary_color ?? "#8494AC",
        },
        away: {
          name: f.away?.name ?? "?",
          short: f.away?.short_name ?? "?",
          color: f.away?.primary_color ?? "#8494AC",
        },
      })),
  }));

  return (
    <Shell>
      <FixturesBoard gameweeks={byGameweek} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-2xl mb-1">Raspored i rezultati</h2>
      <p className="text-slate-400 text-sm mb-6">
        Sva kola grčke Super lige, od prvog do poslednjeg.
      </p>
      {children}
    </div>
  );
}
