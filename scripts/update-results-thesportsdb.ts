/**
 * Osvežava status/rezultat mečeva čiji je termin prošao, preko TheSportsDB.
 * NE upisuje igračku statistiku — ta ostaje ručna kroz admin panel.
 *
 * ⚠️ Za redovan rad postoji bolji put: `npm run` nije ni potreban, dugme
 * "Pokreni ingestion sada" u admin panelu (lib/ingestion.ts) radi po KOLU —
 * jedan poziv za 7 mečeva umesto sedam poziva — i ne traži api_thesportsdb_id.
 * Ova skripta ostaje kao rezerva.
 *
 * Pokretanje: npm run update-results
 */

import { refreshResults } from "../lib/maintenance";
import { runCli } from "./_cli";

runCli((supabase) => refreshResults(supabase));
