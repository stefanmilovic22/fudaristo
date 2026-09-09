/**
 * Popunjava `fixtures.api_thesportsdb_id` za mečeve unete preko CSV kalendara.
 *
 * Logika je u lib/maintenance.ts (deli je sa dugmetom u admin panelu); ovde je
 * samo pokretanje.
 *
 *   npm run backfill-fixture-ids            # probni prolaz, ništa se ne upisuje
 *   npm run backfill-fixture-ids -- --apply # stvarno upiše
 */

import { backfillFixtureIds } from "../lib/maintenance";
import { runCli } from "./_cli";

const APPLY = process.argv.includes("--apply");

runCli(async (supabase) => {
  const result = await backfillFixtureIds(supabase, { apply: APPLY });
  if (!APPLY) result.lines.push("\nProbni prolaz — pokreni sa `-- --apply` da se sačuva.");
  return result;
});
