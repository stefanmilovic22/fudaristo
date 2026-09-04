import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Vercel Hobby default je 10s — eksplicitno podignuto na max (60s) jer
// ingestion radi 7-15 sekvencijalnih API-Football poziva (videti
// IMPLEMENTATION-PLAN.md Faza 5).
export const maxDuration = 60;


// Poziva ga Vercel Cron (videti vercel.json). Zaštićeno CRON_SECRET headerom
// da niko spolja ne može ručno da pokrene ingestion.
//
// TODO Faza 5:
// 1. Nađi fixtures sa statusom scheduled/live čiji je kickoff_at prošao
// 2. Pozovi API-Football /fixtures?id={id} → ažuriraj status/rezultat
// 3. Pozovi /fixtures/players?fixture={id} → upiši player_gameweek_stats
//    (uključi club_id snapshot, ne oslanjaj se na trenutni players.club_id)
// 4. Obradi postponed status → premesti gameweek_id, upiši original_gameweek_id
// 5. Kad je kolo gotovo, pozovi scoring engine (Faza 6)

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  // Placeholder — zameni stvarnom ingestion logikom u Fazi 5
  const { count } = await supabase
    .from("fixtures")
    .select("*", { count: "exact", head: true })
    .eq("status", "scheduled");

  return NextResponse.json({
    ok: true,
    message: "Cron stub radi — implementiraj ingestion logiku (Faza 5)",
    scheduled_fixtures_pending: count ?? 0,
  });
}
