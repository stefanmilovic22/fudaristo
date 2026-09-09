/**
 * EXPLORER — pokreni ovo JEDNOM ručno da vidimo šta TheSportsDB stvarno
 * vraća za grčku Super League, PRE nego što gradimo punu ingestion pipeline.
 *
 * Razlog: već smo dva puta zaredom naišli na skrivena ograničenja kad smo
 * gradili protiv API dokumentacije bez testiranja (API-Football sezona,
 * SofaScore ToS). Ovog puta prvo gledamo stvaran odgovor.
 *
 * Šta ova skripta radi:
 * 1. Traži grčku Super League ligu (da nađemo tačan idLeague)
 * 2. Traži jedan klub (npr. Olympiacos) da nađemo idTeam
 * 3. Povlači njegov poslednji odigran meč (eventresults / eventslast)
 * 4. Za taj meč, pokušava lineup + timeline + statistics pozive
 * 5. Ispisuje SIROV JSON iz svakog poziva u konzolu i u fajl
 *    scripts/thesportsdb-explore-output.json
 *
 * Pogledaj taj fajl (ili ispis u konzoli) i pošalji mi ključne delove —
 * konkretno da li lineup/timeline pozivi uopšte vraćaju podatke (ili su
 * prazni na free tier-u), i da li goalscorer/karton podaci postoje za
 * grčku ligu.
 *
 * Pokretanje: npm run explore-thesportsdb -- TVOJ_API_KLJUC
 * (za potpuno free probaj i bez ključa — koristiće default test ključ "123")
 */

import { writeFileSync } from "fs";

const API_KEY = process.argv[2] || "123"; // "123" je javni free test ključ
const BASE = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function call(label: string, path: string) {
  console.log(`\n--- ${label} ---`);
  console.log(`GET ${BASE}${path}`);
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  console.log(`Status: ${res.status}`);

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    console.log("Odgovor nije validan JSON:", text.slice(0, 300));
    return null;
  }

  console.log(JSON.stringify(json, null, 2).slice(0, 1500));
  await sleep(2000); // pristojan razmak, free tier je 30 req/min
  return json;
}

async function main() {
  const results: Record<string, unknown> = {};

  // 1) Nađi grčku Super League
  const leagues = await call(
    "1) Traži grčku Super League",
    `/search_all_leagues.php?c=Greece&s=Soccer`
  );
  results.leagues = leagues;

  // 2) Nađi Olympiacos kao test klub
  const team = await call("2) Traži Olympiacos", `/searchteams.php?t=Olympiacos`);
  results.team = team;
  const teamId = team?.teams?.[0]?.idTeam;

  if (!teamId) {
    console.log("\n⚠️ Nisam našao idTeam za Olympiacos — prekidam ovde, pošalji mi ispis iznad.");
    writeFileSync("scripts/thesportsdb-explore-output.json", JSON.stringify(results, null, 2));
    return;
  }
  console.log(`\n✓ Nađen idTeam=${teamId}`);

  // 3) Poslednji odigran meč tog kluba
  const lastEvents = await call(
    "3) Poslednji mečevi Olympiacos-a",
    `/eventslast.php?id=${teamId}`
  );
  results.lastEvents = lastEvents;
  const eventId = lastEvents?.results?.[0]?.idEvent;

  if (!eventId) {
    console.log("\n⚠️ Nisam našao idEvent — prekidam ovde, pošalji mi ispis iznad.");
    writeFileSync("scripts/thesportsdb-explore-output.json", JSON.stringify(results, null, 2));
    return;
  }
  console.log(`\n✓ Nađen idEvent=${eventId}, probam detalje...`);

  // 4) Detalji tog meča: lineup, timeline, statistics
  results.eventDetail = await call("4a) Detalji meča", `/lookupevent.php?id=${eventId}`);
  results.lineup = await call("4b) Lineup (sastavi)", `/lookuplineup.php?id=${eventId}`);
  results.timeline = await call("4c) Timeline (golovi/kartoni)", `/lookuptimeline.php?id=${eventId}`);
  results.statistics = await call("4d) Statistika meča", `/lookupeventstats.php?id=${eventId}`);

  writeFileSync("scripts/thesportsdb-explore-output.json", JSON.stringify(results, null, 2), "utf-8");
  console.log(
    "\n🎉 Gotovo. Ceo odgovor sačuvan u scripts/thesportsdb-explore-output.json — pošalji mi taj fajl (ili ključne delove) da vidimo da li ima dovoljno podataka za scoring."
  );
}

main().catch((err) => {
  console.error("\n❌ GREŠKA:", err.message ?? err);
  process.exit(1);
});
