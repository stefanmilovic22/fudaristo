import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { runResultsIngestion } from "@/lib/ingestion";
import { pruneEvents, reportEvent } from "@/lib/monitor";

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

  // Prenos sastava u sledeće kolo za SVE korisnike (migracija 015). Bez ovoga se
  // sastav prepisuje tek kad korisnik otvori /moj-tim, što je znalo da završi
  // praznim builder-om. Ide pre ingestion-a i odvojeno, da jedno ne ruši drugo.
  // Dira samo korisnike bez sastava za to kolo, pa je bezbedno za ponavljanje.
  try {
    const { data: next } = await supabase
      .from("gameweeks")
      .select("id")
      .gt("deadline_at", new Date().toISOString())
      .order("deadline_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next) {
      const { error } = await supabase.rpc("carry_over_all_squads", { p_gameweek_id: next.id });
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    await reportEvent({
      level: "error",
      source: "cron:carry-over",
      message: `Prenos sastava nije uspeo: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  let result;
  try {
    result = await runResultsIngestion(supabase, null);
  } catch (e) {
    // Alarm: cron je pukao. Bez ovoga bi se to primetilo tek kad neko vidi
    // da rezultati kasne (vidi i panel „Zdravlje sistema" na /admin).
    await reportEvent({
      level: "error",
      source: "cron:pull-results",
      message: `Cron je pao: ${e instanceof Error ? e.message : String(e)}`,
    });
    return NextResponse.json({ error: "ingestion failed" }, { status: 500 });
  }
  // Novi rezultati → odmah osveži keš javnih podataka (statistike, liga, raspored).
  revalidateTag("public-data", { expire: 0 });

  // Delimičan neuspeh (npr. izvor ne odgovara) takođe diže alarm.
  const errors = (result as { errors?: string[] }).errors ?? [];
  if (errors.length > 0) {
    await reportEvent({
      level: "error",
      source: "cron:pull-results",
      message: `Cron je završio sa ${errors.length} greška(e): ${errors[0]}`,
      details: { errors: errors.slice(0, 10) },
    });
  }
  await pruneEvents();

  return NextResponse.json(result);
}
