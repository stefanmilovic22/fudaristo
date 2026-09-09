/**
 * check-sources — provera izvora podataka za Fazu 5
 *
 * Odgovara na jedno pitanje: ODAKLE ćemo vaditi igračku statistiku
 * (minuti, golovi, asistencije, kartoni, odbrane) za grčku Super ligu.
 * Ništa ne upisuje u bazu — samo čita, ispisuje nalaz i snima sirove
 * odgovore u `tmp/` da se posle njih može pisati parser bez ponovnog
 * pozivanja API-ja.
 *
 * Pokretanje:
 *   npm run check-sources
 *   npm run check-sources -- --event 2154321     (konkretan TheSportsDB meč)
 *   npm run check-sources -- --skip-worldfootball
 *
 * Šta se proverava:
 *   1. TheSportsDB — ima li lineup / timeline / event stats za OVU ligu.
 *      Testira se besplatnim ključem 123. Ako podaci postoje, premium je
 *      $9/mesec i usput donosi livescores.
 *   2. API-Football — polje `coverage.statistics_players` po sezoni.
 *      Ako je false, Pro tier ($19/mesec) nema šta da ponudi i otpada.
 *      Zahteva API_FOOTBALL_KEY u .env.local; bez njega se preskače.
 *   3. worldfootball.net — potvrda da izveštaj sa meča sadrži postavu,
 *      minute izmena, golove, asistencije i kartone.
 *
 * ⚠️ O worldfootball-u: stranica je © Heimspiel Medien GmbH & Co. KG i ima
 * objavljene opšte uslove. Ova skripta povlači DVE stranice, jednom, sa
 * pauzom između — to je dijagnostika, ne struganje. Pre nego što se od toga
 * napravi cron koji radi svake nedelje, pročitaj njihove uslove.
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// ----------------------------------------------------------------------------
// Konstante
// ----------------------------------------------------------------------------

const TSDB_KEY = process.env.THESPORTSDB_KEY ?? "123"; // 123 = besplatni ključ
const TSDB_BASE = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}`;
const TSDB_LEAGUE_ID = "4336"; // Greek Super League (potvrđeno u Fazi 4)
const TSDB_SEASON = "2026-2027";

const AF_KEY = process.env.API_FOOTBALL_KEY;
const AF_BASE = "https://v3.football.api-sports.io";

const WF_MATCH_REPORT =
  "https://www.worldfootball.net/match-report/co122/greece-super-league/ma12319807/aek-athen_aep-iraklis-fc/";
const WF_LINEUP = `${WF_MATCH_REPORT}lineup/`;

const TMP_DIR = "tmp";

// ----------------------------------------------------------------------------
// Ispis
// ----------------------------------------------------------------------------

const findings: string[] = [];

function section(title: string) {
  console.log(`\n${"=".repeat(70)}\n${title}\n${"=".repeat(70)}`);
}
const ok = (m: string) => console.log(`  ✓ ${m}`);
const warn = (m: string) => console.log(`  ⚠ ${m}`);
const fail = (m: string) => console.log(`  ✗ ${m}`);
const info = (m: string) => console.log(`    ${m}`);
const note = (m: string) => findings.push(m);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function save(name: string, content: string) {
  mkdirSync(TMP_DIR, { recursive: true });
  const path = join(TMP_DIR, name);
  writeFileSync(path, content);
  info(`sirov odgovor snimljen u ${path}`);
}

async function getJson(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
  }
  try {
    return { json: JSON.parse(text), raw: text, res };
  } catch {
    throw new Error(`Odgovor nije JSON (prvih 200 znakova): ${text.slice(0, 200)}`);
  }
}

// ----------------------------------------------------------------------------
// 1. TheSportsDB
// ----------------------------------------------------------------------------

/** Nađi jedan ODIGRAN meč grčke lige da bismo imali na čemu da testiramo. */
async function findFinishedEvent(explicitId?: string): Promise<any | null> {
  if (explicitId) {
    info(`koristim prosleđen idEvent=${explicitId}`);
    const { json } = await getJson(`${TSDB_BASE}/lookupevent.php?id=${explicitId}`);
    return json?.events?.[0] ?? null;
  }

  // Kola 1-3 su odigrana, pa tražimo unazad dok ne nađemo meč sa rezultatom.
  for (const round of [1, 2, 3]) {
    const url = `${TSDB_BASE}/eventsround.php?id=${TSDB_LEAGUE_ID}&r=${round}&s=${TSDB_SEASON}`;
    const { json } = await getJson(url);
    const events: any[] = json?.events ?? [];
    info(`kolo ${round}: vraćeno ${events.length} mečeva`);
    const played = events.find(
      (e) => e.intHomeScore !== null && e.intHomeScore !== undefined && e.intHomeScore !== ""
    );
    if (played) return played;
    await sleep(2500);
  }
  return null;
}

/**
 * Free tier vraća najviše 5 zapisa za lineup/timeline (premium 100). Zato
 * tačno 5 redova NIJE dokaz da podataka nema — to je verovatno tavanica
 * besplatnog ključa i tad premium ima smisla.
 */
function interpretCount(n: number, label: string) {
  if (n === 0) {
    fail(`${label}: prazno — TheSportsDB nema ovaj podatak za ovu ligu`);
    return "prazno";
  }
  if (n === 5 && TSDB_KEY === "123") {
    warn(`${label}: tačno 5 zapisa — to je limit besplatnog ključa, ne kraj podataka`);
    return "limit-free-kljuca";
  }
  ok(`${label}: ${n} zapisa`);
  return "ima";
}

async function checkTheSportsDB(explicitId?: string) {
  section("1. TheSportsDB — ima li igračke podatke za grčku Super ligu?");
  info(`ključ: ${TSDB_KEY === "123" ? "besplatni (123)" : "premium"}`);

  let event: any;
  try {
    event = await findFinishedEvent(explicitId);
  } catch (err) {
    fail(`ne mogu da dođem do mečeva: ${(err as Error).message}`);
    note("TheSportsDB: provera nije završena (greška pri traženju meča)");
    return;
  }

  if (!event) {
    fail("nijedan odigran meč nije nađen — proveri idLeague i sezonu");
    note("TheSportsDB: nije nađen odigran meč za test");
    return;
  }

  const id = event.idEvent;
  ok(`test meč: ${event.strHomeTeam} ${event.intHomeScore}-${event.intAwayScore} ${event.strAwayTeam} (idEvent=${id})`);

  // --- Postava -------------------------------------------------------------
  await sleep(2500);
  let lineupVerdict = "greška";
  try {
    const { json, raw } = await getJson(`${TSDB_BASE}/lookuplineup.php?id=${id}`);
    const rows: any[] = json?.lineup ?? [];
    save(`tsdb-lineup-${id}.json`, raw);
    lineupVerdict = interpretCount(rows.length, "postava (lookuplineup)");
    if (rows.length > 0) {
      info(`polja: ${Object.keys(rows[0]).join(", ")}`);
      const sample = rows[0];
      info(`primer: ${sample.strPlayer ?? "?"} | pozicija=${sample.strPosition ?? "-"} | rezerva=${sample.strSubstitute ?? "-"}`);
      const hasSub = rows.some((r) => String(r.strSubstitute).toLowerCase() === "yes");
      if (hasSub) ok("razlikuje startere od rezervi (strSubstitute)");
      else warn("nema oznake rezerve — minuti se neće moći tačno izračunati odavde");
    }
  } catch (err) {
    fail(`postava: ${(err as Error).message}`);
  }

  // --- Timeline ------------------------------------------------------------
  await sleep(2500);
  let timelineVerdict = "greška";
  try {
    const { json, raw } = await getJson(`${TSDB_BASE}/lookuptimeline.php?id=${id}`);
    const rows: any[] = json?.timeline ?? [];
    save(`tsdb-timeline-${id}.json`, raw);
    timelineVerdict = interpretCount(rows.length, "događaji (lookuptimeline)");
    if (rows.length > 0) {
      info(`polja: ${Object.keys(rows[0]).join(", ")}`);
      const types = [...new Set(rows.map((r) => r.strTimeline))].filter(Boolean);
      info(`tipovi događaja: ${types.join(", ") || "—"}`);
      const wanted = ["goal", "card", "subst"];
      for (const w of wanted) {
        const found = types.some((t) => String(t).toLowerCase().includes(w));
        (found ? ok : warn)(`${w}: ${found ? "postoji" : "nije viđen u ovom meču"}`);
      }
      const hasAssist = rows.some((r) => r.strAssist);
      (hasAssist ? ok : warn)(`asistencije: ${hasAssist ? "polje strAssist popunjeno" : "nema"}`);
    }
  } catch (err) {
    fail(`timeline: ${(err as Error).message}`);
  }

  // --- Statistika meča (tražimo odbrane golmana) ---------------------------
  await sleep(2500);
  try {
    const { json, raw } = await getJson(`${TSDB_BASE}/lookupeventstats.php?id=${id}`);
    const rows: any[] = json?.eventstats ?? [];
    save(`tsdb-eventstats-${id}.json`, raw);
    if (rows.length === 0) {
      warn("statistika meča: prazno");
    } else {
      const names = rows.map((r) => r.strStat).filter(Boolean);
      ok(`statistika meča: ${rows.length} stavki`);
      info(`stavke: ${names.join(", ")}`);
      const saves = names.some((n: string) => /save/i.test(n));
      (saves ? ok : warn)(`odbrane golmana: ${saves ? "ima" : "NEMA — to je rupa za GK bodovanje"}`);
    }
  } catch (err) {
    warn(`statistika meča: ${(err as Error).message}`);
  }

  if (lineupVerdict === "ima" || timelineVerdict === "ima") {
    note("TheSportsDB: IMA podatke → premium ($9/mes) je najjeftiniji automatski put, i rešava live rezultate");
  } else if (lineupVerdict === "limit-free-kljuca" || timelineVerdict === "limit-free-kljuca") {
    note("TheSportsDB: podaci postoje ali besplatni ključ seče na 5 zapisa → uzmi premium probno ($9) i pokreni ovu skriptu ponovo sa THESPORTSDB_KEY");
  } else {
    note("TheSportsDB: NEMA igračke podatke za ovu ligu → premium ne rešava statistiku (ali bi i dalje rešio live rezultate)");
  }
}

// ----------------------------------------------------------------------------
// 2. API-Football
// ----------------------------------------------------------------------------

async function checkApiFootball() {
  section("2. API-Football — pokriva li `statistics_players` grčku Super ligu?");

  if (!AF_KEY) {
    warn("API_FOOTBALL_KEY nije podešen u .env.local — preskačem");
    note("API-Football: nije provereno (nema ključa)");
    return;
  }

  try {
    const { json, raw, res } = await getJson(`${AF_BASE}/leagues?country=Greece`, {
      "x-apisports-key": AF_KEY,
    });
    save("api-football-leagues-greece.json", raw);

    const remaining = res.headers.get("x-ratelimit-requests-remaining");
    if (remaining) info(`preostalo poziva danas: ${remaining}`);

    if (json.errors && Object.keys(json.errors).length > 0) {
      fail(`API vratio grešku: ${JSON.stringify(json.errors)}`);
      note("API-Football: greška pri pozivu, videti ispis");
      return;
    }

    const leagues: any[] = json.response ?? [];
    const superLeague = leagues.find(
      (l) => l.league?.type === "League" && /super\s*league/i.test(l.league?.name ?? "")
    );

    if (!superLeague) {
      fail("Super liga nije nađena među grčkim takmičenjima");
      info(`nađeno: ${leagues.map((l) => l.league?.name).join(", ")}`);
      note("API-Football: liga nije nađena");
      return;
    }

    ok(`nađeno: ${superLeague.league.name} (id=${superLeague.league.id})`);

    // Presudna je TEKUĆA sezona. Ranije sezone mogu imati pokrivenost a da je
    // ove nema — zaključak izveden iz njih bi bio pogrešan.
    const seasons = (superLeague.seasons ?? []).filter((s: any) => s.year >= 2024);
    let current: any = null;

    for (const s of seasons) {
      const f = s.coverage?.fixtures ?? {};
      const line = [
        `sezona ${s.year}${s.current ? " (TEKUĆA)" : ""}`,
        `events=${f.events}`,
        `lineups=${f.lineups}`,
        `stat_meca=${f.statistics_fixtures}`,
        `STAT_IGRACA=${f.statistics_players}`,
      ].join("  ");
      (f.statistics_players ? ok : fail)(line);
      if (s.current) current = s;
    }

    if (!current) {
      warn("nijedna sezona nije označena kao tekuća — gledaj red sa 2026 ručno");
      note("API-Football: tekuća sezona nije označena, zaključak izvedi iz ispisa");
    } else if (current.coverage?.fixtures?.statistics_players) {
      note(`API-Football: statistics_players = TRUE za tekuću sezonu (${current.year}) → Pro tier ($19/mes) je upotrebljiv`);
    } else {
      const older = seasons.some((s: any) => !s.current && s.coverage?.fixtures?.statistics_players);
      note(
        older
          ? `API-Football: statistics_players = FALSE za tekuću sezonu (${current.year}), iako je bio TRUE ranije → Pro tier NE rešava OVU sezonu, otpada`
          : "API-Football: statistics_players = FALSE → Pro tier NE rešava statistiku, otpada"
      );
    }
    warn("podsetnik: coverage=true ne garantuje 100% popunjenost, samo da je liga u toj kategoriji");
  } catch (err) {
    fail((err as Error).message);
    note("API-Football: provera nije uspela");
  }
}

// ----------------------------------------------------------------------------
// 3. worldfootball.net
// ----------------------------------------------------------------------------

async function checkWorldfootball() {
  section("3. worldfootball.net — sadrži li izveštaj sa meča sve što nam treba?");
  warn("povlačim 2 stranice, jednom, sa pauzom — dijagnostika, ne struganje");
  warn("pre nego što ovo postane cron, pročitaj https://www.worldfootball.net/terms/");

  try {
    const res = await fetch(WF_LINEUP, {
      headers: { "User-Agent": "Fudaristo-source-check/1.0 (jednokratna provera)" },
    });
    if (!res.ok) {
      fail(`HTTP ${res.status} — moguće da blokiraju automatske zahteve`);
      note("worldfootball: stranica nije dostupna automatski (HTTP " + res.status + ")");
      return;
    }
    const html = await res.text();
    save("worldfootball-lineup.html", html);

    const persons = html.match(/\/person\/pe\d+\//g) ?? [];
    const uniquePersons = new Set(persons);
    ok(`linkova ka igračima: ${persons.length} (${uniquePersons.size} različitih)`);
    if (uniquePersons.size >= 22) {
      ok("dovoljno igrača za obe postave + klupe");
    } else {
      warn("manje igrača nego što se očekuje za pun izveštaj");
    }

    // Numerički ID igrača je bolji ključ za uparivanje od imena.
    const firstId = persons[0]?.match(/pe(\d+)/)?.[1];
    if (firstId) ok(`stabilan ID igrača, npr. pe${firstId} — bolji ključ nego ime`);

    const checks: [string, RegExp][] = [
      ["minuti izmena", /\b\d{1,2}\.\s*<\/|>\s*\d{1,2}\.\s*</],
      ["kartoni (ikone/klase)", /card|karte|gelb|yellow|red_card/i],
      ["golovi", /goal|tor\b|scorer/i],
      ["asistencije", /assist/i],
      ["formacija", /formation|aufstellung/i],
    ];
    for (const [label, re] of checks) {
      const found = re.test(html);
      (found ? ok : warn)(`${label}: ${found ? "pronađeno u HTML-u" : "nije prepoznato ovim obrascem"}`);
    }

    await sleep(3000);

    const statsRes = await fetch(`${WF_MATCH_REPORT}team-statistics/`, {
      headers: { "User-Agent": "Fudaristo-source-check/1.0 (jednokratna provera)" },
    });
    if (statsRes.ok) {
      const statsHtml = await statsRes.text();
      save("worldfootball-team-statistics.html", statsHtml);
      const hasSaves = /save|parade|abwehr/i.test(statsHtml);
      (hasSaves ? ok : warn)(
        `odbrane golmana na "Team Statistics": ${hasSaves ? "moguće da ima — proveri snimljeni HTML" : "nije nađeno"}`
      );
      note("worldfootball: izveštaj sa meča ima postavu, izmene, golove i asistencije");
      note(
        hasSaves
          ? "worldfootball: odbrane golmana možda postoje na Team Statistics — proveri snimljeni HTML"
          : "worldfootball: odbrane golmana NISU dostupne → ili ručno (14 brojeva po kolu) ili izbaci iz formule za GK"
      );
    } else {
      warn(`Team Statistics stranica: HTTP ${statsRes.status}`);
      note("worldfootball: izveštaj sa meča ima postavu, izmene, golove i asistencije; odbrane nisu proverene");
    }
  } catch (err) {
    fail((err as Error).message);
    note("worldfootball: provera nije uspela — " + (err as Error).message);
  }
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const eventArgIdx = args.indexOf("--event");
  const explicitId = eventArgIdx >= 0 ? args[eventArgIdx + 1] : undefined;
  const skipWf = args.includes("--skip-worldfootball");

  console.log("Fudaristo — provera izvora podataka za Fazu 5");
  console.log(`Vreme: ${new Date().toISOString()}`);

  await checkTheSportsDB(explicitId);
  await checkApiFootball();
  if (!skipWf) await checkWorldfootball();
  else console.log("\n(worldfootball provera preskočena)");

  section("ZAKLJUČAK");
  if (findings.length === 0) {
    console.log("  Nijedna provera nije dala rezultat — videti greške iznad.");
  } else {
    findings.forEach((f) => console.log(`  • ${f}`));
  }
  console.log(`\nSirovi odgovori su u ./${TMP_DIR}/ — parser se piše iz njih, bez novih poziva.\n`);
}

main().catch((err) => {
  console.error("\nSkripta je pukla:", err);
  process.exit(1);
});
