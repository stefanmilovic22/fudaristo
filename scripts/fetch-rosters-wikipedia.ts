/**
 * Pomoćna skripta: povlači "Current squad" liste igrača sa Wikipedia-e za
 * svih 14 klubova, kao POLAZNU TAČKU za roster CSV — kolona market_value_eur
 * ostaje prazna, ti je ručno popunjavaš sa Transfermarkt-a (i tom prilikom
 * proveravaš da li se imena/pozicije poklapaju sa onim što je Wikipedia dala).
 *
 * ZAŠTO WIKIPEDIA (ne Transfermarkt direktno): Wikipedia eksplicitno dozvoljava
 * automatizovan pristup preko svog action API-ja (to mu je i namena — vidi
 * https://www.mediawiki.org/wiki/API:Etiquette), za razliku od Transfermarkt-a
 * čiji ToS to zabranjuje. Sadržaj koji izvlačimo (ime, pozicija, broj) su
 * činjenice, ne kreativni izraz — ne kosi se sa autorskim pravima (ista
 * logika kao za igračka imena/statistike, GDD sekcija 12).
 *
 * ⚠️ NIJE TESTIRANO protiv pravog Wikipedia odgovora (sandbox u kom je pisano
 * nema mrežni pristup wikipedia.org). Format "Current squad" tabele ume malo
 * da varira između članaka (različiti urednici) — TRETIRAJ IZLAZ KAO PRVI
 * NACRT, ne kao konačan izvor. Upravo zato ionako planiraš ručnu proveru.
 *
 * Pokretanje: npm run fetch-rosters
 * Izlaz: scripts/rosters-draft.csv (isti format kao roster-template.csv,
 * market_value_eur kolona prazna — popuni je pre `npm run import-roster`)
 */

import { writeFileSync } from "fs";
import * as cheerio from "cheerio";

// Levi string = tačan naziv Wikipedia članka, desni = naziv kluba KAKO VEĆ
// POSTOJI u našoj bazi (faza1-run-in-supabase.sql) — mora se poklapati da bi
// import-roster-csv.ts kasnije uspešno našao klub.
const CLUBS: { wiki: string; canonical: string }[] = [
  { wiki: "AEK Athens F.C.", canonical: "AEK Athens" },
  { wiki: "Olympiacos F.C.", canonical: "Olympiacos" },
  { wiki: "PAOK FC", canonical: "PAOK" },
  { wiki: "Panathinaikos F.C.", canonical: "Panathinaikos" },
  { wiki: "Levadiakos F.C.", canonical: "Levadiakos" },
  { wiki: "OFI Crete F.C.", canonical: "OFI Crete" },
  { wiki: "Volos N.F.C.", canonical: "Volos NFC" },
  { wiki: "Aris Thessaloniki F.C.", canonical: "Aris Thessaloniki" },
  { wiki: "Atromitos F.C.", canonical: "Atromitos" },
  { wiki: "AE Kifisias F.C.", canonical: "AE Kifisia" },
  { wiki: "Panetolikos F.C.", canonical: "Panetolikos" },
  { wiki: "Asteras Tripolis F.C.", canonical: "Asteras Tripolis" },
  { wiki: "Iraklis F.C.", canonical: "Iraklis" },
  { wiki: "Kalamata F.C.", canonical: "Kalamata" },
];
// Ako neki "wiki" naziv ne pogodi tačan članak (Wikipedia ume da ima
// disambiguation stranice ili malo drugačije formalne nazive), skripta će
// to prijaviti u konzoli — ispravi ručno ovde i pokreni ponovo za taj klub.

const POSITION_MAP: Record<string, string> = {
  GK: "GK",
  DF: "DEF",
  MF: "MID",
  FW: "FWD",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findHeadingContainer($: cheerio.CheerioAPI) {
  // Pokušaj oba formata: stariji MediaWiki (span.mw-headline unutar h2) i
  // noviji (div.mw-heading > h2 direktno, promena iz 2023/2024) — ne znamo
  // unapred koji će Wikipedia vratiti.
  let target = $('[id="Current_squad"]').first();
  if (target.length === 0) {
    target = $("h2, h3, span.mw-headline")
      .filter((_, el) => $(el).text().trim().toLowerCase() === "current squad")
      .first();
  }
  if (target.length === 0) return null;

  const headingEl = target.is("h2, h3") ? target : target.closest("h2, h3");
  const effectiveHeading = headingEl.length > 0 ? headingEl : target;

  // Noviji format uvija heading u div.mw-heading — ako postoji, njega
  // koristimo kao tačku za pretragu sledećih sibling elemenata (tabela).
  const wrapper = effectiveHeading.closest("div.mw-heading");
  return wrapper.length > 0 ? wrapper : effectiveHeading;
}

async function fetchClubSquad(
  wikiTitle: string,
  saveDebugHtml: boolean
): Promise<{ position: string; name: string }[]> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", wikiTitle);
  url.searchParams.set("prop", "text");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  const res = await fetch(url.toString(), {
    // Wikipedia API etiketa traži identifikaciju preko User-Agent-a
    headers: { "User-Agent": "FudaristoRosterDraft/0.1 (jednokratna licna skripta, ne servis)" },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} za "${wikiTitle}"`);
  }

  const json: any = await res.json();
  if (json.error) {
    throw new Error(`Wikipedia greška za "${wikiTitle}": ${json.error.info}`);
  }

  const html: string = json.parse.text;
  const $ = cheerio.load(html);

  const headingContainer = findHeadingContainer($);

  if (!headingContainer || headingContainer.length === 0) {
    console.warn(`   ⚠️ Nisam našao "Current squad" sekciju — proveri ručno na Wikipediji`);
    if (saveDebugHtml) {
      writeFileSync("scripts/wikipedia-debug.html", html, "utf-8");
      console.warn(
        `   🔍 Sačuvao sam ceo HTML odgovor u scripts/wikipedia-debug.html — otvori ga i` +
          ` pretraži (Cmd/Ctrl+F) "quad" da nađeš tačan naziv/format heading-a, ili mi pošalji taj deo.`
      );
    }
    return [];
  }

  const rows: { position: string; name: string }[] = [];

  let node = headingContainer.next();
  while (node.length > 0 && !node.is("h2") && !node.is("div.mw-heading2")) {
    if (node.is("table")) {
      node.find("tr").each((_, tr) => {
        const cells = $(tr).find("td");
        if (cells.length >= 3) {
          const posRaw = $(cells[1]).text().trim();
          const name = $(cells[2]).text().trim();
          if (posRaw && name) rows.push({ position: posRaw, name });
        }
      });
    }
    node = node.next();
  }

  return rows;
}

async function main() {
  const outRows: string[] = ["club_name,first_name,last_name,position,market_value_eur"];
  let totalOk = 0;
  let clubIndex = 0;

  for (const club of CLUBS) {
    clubIndex++;
    console.log(`Povlačim ${club.wiki}...`);
    try {
      const squad = await fetchClubSquad(club.wiki, clubIndex === 1);
      console.log(`   ✓ ${squad.length} redova nađeno u tabeli`);

      for (const p of squad) {
        const position = POSITION_MAP[p.position.toUpperCase()];
        if (!position) {
          console.warn(`   ⚠️ Nepoznata pozicija "${p.position}" za ${p.name} — preskačem red`);
          continue;
        }
        const nameParts = p.name.split(" ").filter(Boolean);
        const firstName = nameParts[0] ?? p.name;
        const lastName = nameParts.slice(1).join(" ") || firstName;
        outRows.push(`${club.canonical},${firstName},${lastName},${position},`);
        totalOk++;
      }
    } catch (err: any) {
      console.error(`   ❌ ${err.message}`);
    }
    await sleep(1000); // pristojan razmak između poziva (Wikipedia API etiketa)
  }

  writeFileSync("scripts/rosters-draft.csv", outRows.join("\n"), "utf-8");
  console.log(
    `\n🎉 Gotovo. ${totalOk} igrača upisano u scripts/rosters-draft.csv.\n` +
      `Otvori fajl, uporedi imena/pozicije sa Transfermarkt-om, i popuni praznu\n` +
      `market_value_eur kolonu pre pokretanja: npm run import-roster -- scripts/rosters-draft.csv`
  );
}

main().catch((err) => {
  console.error("\n❌ GREŠKA:", err.message ?? err);
  process.exit(1);
});
