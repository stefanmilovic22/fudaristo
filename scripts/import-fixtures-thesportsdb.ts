/**
 * ⚠️ MENJA KALENDAR: pravi kola koja ne postoje i prepisuje termine
 * postojećim mečevima. Ako su termini sređivani ručno, ovo ih gazi. Za samo
 * popunjavanje ID-jeva koristi `npm run backfill-fixture-ids`.
 *
 * OGRANIČENJE: besplatan TheSportsDB tier vraća najviše 15 događaja po pozivu,
 * što je ~2 kola — ne cela sezona. Za pun raspored ide import-fixtures-csv.ts.
 *
 * Logika je u lib/maintenance.ts (deli je sa dugmetom u admin panelu).
 *
 * Pokretanje: npm run import-fixtures
 */

import { importFixtures } from "../lib/maintenance";
import { runCli } from "./_cli";

runCli((supabase) => importFixtures(supabase));
