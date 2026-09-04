/**
 * Faza 2 (IMPLEMENTATION-PLAN.md): jednokratni seed 14 klubova i rostera
 * grčke Super League pre starta sezone. Pokreće se lokalno (`npm run seed`),
 * NE kao cron.
 *
 * TODO:
 * 1. GET /leagues?country=Greece na API-Football → nađi tačan league_id
 * 2. GET /teams?league={id}&season=2025 → upiši 14 klubova u `clubs`
 * 3. Za svaki klub: GET /players?team={id}&season=2025 → upiši igrače u `players`
 * 4. Izračunaj inicijalne cene po formuli iz GDD sekcije 17 (value score →
 *    percentil → kubna kriva → cena po poziciji)
 */

import { createClient } from "@supabase/supabase-js";

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  if (!API_FOOTBALL_KEY) {
    throw new Error("API_FOOTBALL_KEY nije podešen u .env.local");
  }

  console.log("TODO: implementirati seed logiku — videti komentar na vrhu fajla.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
