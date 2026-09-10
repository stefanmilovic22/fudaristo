import { createClient } from "@/lib/supabase/server";
import { FixturesBoard, type GameweekFixtures } from "./fixtures-board";
import { DataLoadError } from "@/components/DataLoadError";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "fixtures" });
  return { title: `${t("title")} — Fudaristo` };
}

export default async function RasporedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

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
        <DataLoadError whatKey="whatFixtures" error={gwError ?? fxError} />
      </Shell>
    );
  }

  if (!gameweeks || gameweeks.length === 0) {
    return (
      <Shell>
        <EmptyGameweeks />
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

async function EmptyGameweeks() {
  const t = await getTranslations("fixtures");
  return <p className="text-slate-400">{t("noGameweeks")}</p>;
}

async function Shell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("fixtures");
  return (
    <div>
      <h2 className="font-display text-2xl mb-1">{t("title")}</h2>
      <p className="text-slate-400 text-sm mb-6">{t("subtitle")}</p>
      {children}
    </div>
  );
}
