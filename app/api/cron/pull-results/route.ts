import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { runResultsIngestion } from "@/lib/ingestion";

// Vercel Hobby: cron sme najviše jednom dnevno po unosu, do 2 unosa po
// projektu — vercel.json već koristi oba (08:00 i 23:00 UTC). Ograničenje
// trajanja se razlikuje po izvoru; posao je projektovan da radi u malim
// koracima (po kolu, sa pauzom) i da bude bezbedan i ako bude presečen na
// pola — sledeći poziv (cron ili ručni) samo nastavlja gde je stalo.
export const maxDuration = 60;

// Poziva ga Vercel Cron (videti vercel.json). Zaštićeno CRON_SECRET headerom
// da niko spolja ne može ručno da pokrene ingestion. Admin ima svoj put
// preko /admin dugmeta "Pokreni sada" (Server Action, ne ova ruta).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const result = await runResultsIngestion(supabase, null);

  return NextResponse.json(result);
}
