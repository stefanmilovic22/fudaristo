/**
 * Ručni CSV import kalendara — PRIMARNI put za pun raspored sezone (26 kola).
 *
 * ZAŠTO OVO POSTOJI: scripts/import-fixtures-thesportsdb.ts (Faza 4) koristi
 * TheSportsDB eventsseason.php, koji na besplatnom tier-u vraća najviše 15
 * događaja po pozivu (zvanično potvrđeno u dokumentaciji — Premium limit je
 * 3000). Za ligu od 14 klubova (7 mečeva po kolu) to je otprilike 2 kola, ne
 * cela sezona. Pun raspored bez ograničenja postoji samo u TheSportsDB v2
 * API-ju, koji je premium-only (9 EUR/mesec).
 *
 * SofaScore NIJE alternativa — GDD sekcija 15 ga je već eksplicitno odbacio
 * jer ToS zabranjuje automatizovano prikupljanje. Isti princip kao kod
 * Transfermarkt rostera (Faza 2): kad automatizacija nije ToS-bezbedna ili
 * dostupna na besplatnom tier-u, unos je ručan.
 *
 * PRE POKRETANJA:
 * 1. Otvori zvaničan raspored (npr. sajt Super League, ili bilo koji izvor
 *    koji smeš ručno da pogledaš u browseru) i ručno prepiši preostala kola
 *    u CSV — videti scripts/fixtures-template.csv za format
 * 2. Vremena unosi u UTC (grčko vreme je UTC+3 leti / UTC+2 zimi — oduzmi
 *    razliku ručno pri prepisivanju). Format "2026-09-12 15:00" ili
 *    "2026-09-12T15:00:00"; ako dodaš "Z" ili offset, i to se ispravno čita.
 *
 * Pokretanje:
 *   npm run import-fixtures-csv -- putanja/do/kalendar.csv
 *
 * Bezbedno je pokrenuti više puta:
 * - kolo (gameweek): ako već postoji i status mu je "upcoming", termin
 *   (deadline/start/end) se AŽURIRA prema novom CSV-u (korisno kad prvi put
 *   uneseš placeholder vreme, pa kasnije zvaničan termin bude objavljen) —
 *   ako je kolo već zaključano/odigrano, termin se ne dira
 * - meč (fixture): proverava postojeći red (po gameweek_id + home_club_id +
 *   away_club_id) pre nego što upiše novi, i samo update-uje kickoff_at ako
 *   se promeni (ne dira status/rezultat ako je meč već odigran preko drugog
 *   puta unosa)
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { WebSocket } from "ws";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { parseUtcTimestamp } from "../lib/api-parsing";

dotenv.config({ path: ".env.local" });
if (!globalThis.WebSocket) {
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nisu podešeni u .env.local");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Ista poznata odstupanja u imenima kao u scripts/import-fixtures-thesportsdb.ts
// — drži ih usklađene ako dodaješ novi alias na jednom mestu, dodaj i na drugom.
const CLUB_ALIASES: Record<string, string> = {
  "Iraklis 1908": "Iraklis",
};

type CsvRow = {
  round: string;
  home_club: string;
  away_club: string;
  kickoff_at_utc: string;
};

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Upotreba: npm run import-fixtures-csv -- putanja/do/kalendar.csv");
    process.exit(1);
  }

  const raw = readFileSync(csvPath, "utf-8");
  const rows: CsvRow[] = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  console.log(`Učitano ${rows.length} redova iz ${csvPath}.`);

  const { data: allClubs } = await supabase.from("clubs").select("id, name");
  const clubsList = allClubs ?? [];

  function resolveClubId(name: string): string | undefined {
    const normalized = CLUB_ALIASES[name] ?? name;
    const exact = clubsList.find((c) => c.name === normalized);
    if (exact) return exact.id;
    const fuzzy = clubsList.find((c) => c.name.includes(normalized) || normalized.includes(c.name));
    return fuzzy?.id;
  }

  console.log("\n1) Pravim/nalazim kola (gameweeks) po broju runde...");
  const byRound = new Map<string, CsvRow[]>();
  for (const row of rows) {
    if (!byRound.has(row.round)) byRound.set(row.round, []);
    byRound.get(row.round)!.push(row);
  }

  const gameweekIdByRound = new Map<string, string>();
  for (const [round, roundRows] of byRound) {
    const kickoffs = roundRows
      .map((r) => parseUtcTimestamp(r.kickoff_at_utc))
      .filter((t): t is string => t !== null)
      .map((t) => new Date(t).getTime())
      .sort((a, b) => a - b);

    if (kickoffs.length !== roundRows.length) {
      console.warn(
        `   ⚠️ Kolo ${round}: ${roundRows.length - kickoffs.length} red(ova) ima neispravan kickoff_at_utc — preskačem kolo`
      );
      continue;
    }

    const deadlineAt = new Date(kickoffs[0] - 60 * 60 * 1000);
    const startsAt = new Date(kickoffs[0]);
    const endsAt = new Date(kickoffs[kickoffs.length - 1] + 2 * 60 * 60 * 1000);

    const { data: existing } = await supabase
      .from("gameweeks")
      .select("id, status")
      .eq("number", Number(round))
      .maybeSingle();

    if (existing) {
      // AŽURIRAJ termin SAMO ako je kolo još "upcoming" — ne diraj kolo koje
      // je već zaključano/odigrano/obračunato (isti princip kao za mečeve).
      if (existing.status === "upcoming") {
        const { error } = await supabase
          .from("gameweeks")
          .update({
            deadline_at: deadlineAt.toISOString(),
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
          })
          .eq("id", existing.id);
        if (error) {
          console.warn(`   ⚠️ Greška pri ažuriranju kola ${round}: ${error.message}`);
        } else {
          console.log(`   ~ kolo ${round} ažurirano (deadline ${deadlineAt.toISOString()})`);
        }
      } else {
        console.log(`   = kolo ${round} već ${existing.status} — termin nije dirat`);
      }
      gameweekIdByRound.set(round, existing.id);
      continue;
    }

    const { data: inserted, error } = await supabase
      .from("gameweeks")
      .insert({
        number: Number(round),
        deadline_at: deadlineAt.toISOString(),
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "upcoming",
      })
      .select("id")
      .single();

    if (error) {
      console.warn(`   ⚠️ Greška pri kreiranju kola ${round}: ${error.message}`);
      continue;
    }
    if (inserted) gameweekIdByRound.set(round, inserted.id);
    console.log(`   + kolo ${round} kreirano (deadline ${deadlineAt.toISOString()})`);
  }

  console.log("\n2) Upisujem/ažuriram mečeve...");
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const gameweekId = gameweekIdByRound.get(row.round);
    if (!gameweekId) {
      console.warn(`   ⚠️ Nema kola ${row.round} — preskačem ${row.home_club} vs ${row.away_club}`);
      skipped++;
      continue;
    }

    const homeClubId = resolveClubId(row.home_club);
    const awayClubId = resolveClubId(row.away_club);
    if (!homeClubId || !awayClubId) {
      console.warn(`   ⚠️ Nisam našao klub(ove) za "${row.home_club}" vs "${row.away_club}" — preskačem`);
      skipped++;
      continue;
    }

    const kickoffAt = parseUtcTimestamp(row.kickoff_at_utc);
    if (!kickoffAt) {
      console.warn(`   ⚠️ Neispravan datum "${row.kickoff_at_utc}" za ${row.home_club} vs ${row.away_club} — preskačem`);
      skipped++;
      continue;
    }

    const { data: existingFixture } = await supabase
      .from("fixtures")
      .select("id, status")
      .eq("gameweek_id", gameweekId)
      .eq("home_club_id", homeClubId)
      .eq("away_club_id", awayClubId)
      .maybeSingle();

    if (existingFixture) {
      // Termin se osvežava SAMO dok je meč još zakazan. Ako je u međuvremenu
      // odigran, odložen ili je u toku, novi placeholder termin iz CSV-a bi
      // pregazio stvaran podatak — ranije se kickoff_at ažurirao bez obzira
      // na status.
      if (existingFixture.status !== "scheduled") {
        console.log(`   = "${row.home_club} vs ${row.away_club}" je ${existingFixture.status} — termin nije diran`);
        skipped++;
        continue;
      }
      const { error } = await supabase
        .from("fixtures")
        .update({ kickoff_at: kickoffAt })
        .eq("id", existingFixture.id);
      if (error) {
        console.warn(`   ⚠️ Greška pri ažuriranju "${row.home_club} vs ${row.away_club}": ${error.message}`);
        skipped++;
        continue;
      }
      updated++;
      continue;
    }

    const { error } = await supabase.from("fixtures").insert({
      gameweek_id: gameweekId,
      home_club_id: homeClubId,
      away_club_id: awayClubId,
      kickoff_at: kickoffAt,
      status: "scheduled",
    });
    if (error) {
      console.warn(`   ⚠️ Greška za "${row.home_club} vs ${row.away_club}": ${error.message}`);
      skipped++;
      continue;
    }
    inserted++;
  }

  console.log(`\n🎉 Gotovo. Novih: ${inserted}, ažuriranih: ${updated}, preskočenih: ${skipped}.`);
}

main().catch((err) => {
  console.error("\n❌ GREŠKA:", err.message ?? err);
  process.exit(1);
});
