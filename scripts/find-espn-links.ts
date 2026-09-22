/**
 * Nađi ESPN linkove za sve mečeve jednog kola — da se ne traži svaki meč
 * ručno na espn.com pre nego što ga nalepiš u "Popuni sa ESPN-a" (videti
 * lib/espn-parser.ts i admin panel meča).
 *
 * Ista logika kao dugme "Nađi ESPN linkove" u admin panelu — deljeno preko
 * lib/espn-fixtures.ts. Ovde postoji za slučaj da radije radiš iz terminala.
 *
 * Pokretanje: npm run find-espn-links -- 3   (broj kola)
 */

import { cliClient } from "./_cli";
import { findEspnLinksForFixtures } from "../lib/espn-fixtures";

async function main() {
  const gwArg = process.argv[2];
  if (!gwArg || Number.isNaN(Number(gwArg))) {
    console.error("Upotreba: npm run find-espn-links -- <broj kola>");
    process.exit(1);
  }
  const gwNumber = Number(gwArg);

  const supabase = cliClient();

  const { data: gameweek, error: gwError } = await supabase
    .from("gameweeks")
    .select("id, number")
    .eq("number", gwNumber)
    .maybeSingle();
  if (gwError) throw new Error(gwError.message);
  if (!gameweek) throw new Error(`Kolo ${gwNumber} nije nađeno.`);

  const { data: fixtures, error: fxError } = await supabase
    .from("fixtures")
    .select("id, kickoff_at, home:home_club_id(name), away:away_club_id(name)")
    .eq("gameweek_id", gameweek.id)
    .order("kickoff_at");
  if (fxError) throw new Error(fxError.message);
  if (!fixtures || fixtures.length === 0) {
    console.log(`Kolo ${gwNumber} nema mečeva u bazi.`);
    return;
  }

  console.log(`Kolo ${gwNumber}: ${fixtures.length} meč(eva), proveravam na ESPN-u...\n`);

  const mapped = (fixtures as any[]).map((f) => ({
    id: f.id,
    kickoff_at: f.kickoff_at,
    homeClubName: f.home?.name ?? "?",
    awayClubName: f.away?.name ?? "?",
    kickoffLabel: new Date(f.kickoff_at).toLocaleString("sr-RS"),
  }));

  const result = await findEspnLinksForFixtures(mapped);

  for (const row of result.rows) {
    const fixture = mapped.find((f) => f.id === row.fixtureId)!;
    if (row.url) {
      console.log(`✓ ${row.label} (${fixture.kickoffLabel})`);
      console.log(`  ${row.url}\n`);
    } else {
      console.log(`✗ ${row.label} (${fixture.kickoffLabel}) — NIJE NAĐEN na ESPN-u za proverene datume.`);
      console.log(`  Proveri ručno na espn.com (možda drugačiji naziv tima, ili meč pomeren van ± 1 dana).\n`);
    }
  }

  console.log(`Nađeno: ${result.foundCount}/${result.rows.length}`);
}

main().catch((err) => {
  console.error("\n❌ GREŠKA:", err instanceof Error ? err.message : err);
  process.exit(1);
});
