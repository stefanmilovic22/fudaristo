/**
 * Faza 2 (PRIMARNI put): učitava ručno popunjen CSV (videti
 * scripts/roster-template.csv za format) sa rosterima 14 klubova i
 * Transfermarkt tržišnim vrednostima, upisuje igrače u bazu, i računa
 * fantasy cene po formuli iz GDD sekcije 17 — samo što umesto value score-a
 * iz golova/asistencija (nedostupno na API-Football free tier za tekuću
 * sezonu), koristimo tržišnu vrednost direktno kao ulazni signal.
 *
 * PRE POKRETANJA:
 * 1. Proveri da je schema.sql pokrenut — on već sadrži i market_value_eur
 *    kolonu i UNIQUE (club_id, first_name, last_name) constraint potreban za
 *    upsert. (Raniji komentar je upućivao na faza2-schema-update.sql, fajl
 *    koji je u međuvremenu ugrađen u schema.sql i više ne postoji zasebno.)
 * 2. Popuni CSV po uzoru na scripts/roster-template.csv — ručno prepiši
 *    sa Transfermarkt.com (klub, ime, prezime, pozicija, tržišna vrednost)
 *    NE piši skriptu koja to sama skreipuje — Transfermarkt ima strog ToS
 *    protiv automatizovanog izvlačenja podataka
 *
 * Pokretanje:
 *   npm run import-roster -- putanja/do/tvog/rostera.csv
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { WebSocket } from "ws";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";

dotenv.config({ path: ".env.local" });

// Isti WebSocket polyfill razlog kao u ostalim skriptama (Node < 22)
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

type Position = "GK" | "DEF" | "MID" | "FWD";

const PRICE_BOUNDS: Record<Position, { floor: number; ceiling: number }> = {
  GK: { floor: 4.0, ceiling: 5.5 },
  DEF: { floor: 4.0, ceiling: 7.0 },
  MID: { floor: 4.5, ceiling: 13.5 },
  FWD: { floor: 4.5, ceiling: 14.0 },
};

type CsvRow = {
  club_name: string;
  first_name: string;
  last_name: string;
  position: string;
  market_value_eur: string;
};

// Čista funkcija — testirana zasebno bez mreže (videti napomenu u chat-u)
export function priceFromPercentile(percentile: number, floor: number, ceiling: number): number {
  const raw = floor + (ceiling - floor) * percentile ** 3;
  return Math.round(raw * 10) / 10;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Upotreba: npm run import-roster -- putanja/do/rostera.csv");
    process.exit(1);
  }

  const raw = readFileSync(csvPath, "utf-8");
  const rows: CsvRow[] = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  console.log(`Učitano ${rows.length} redova iz ${csvPath}.`);

  console.log("\n1) Upisujem/ažuriram igrače (privremena cena = pozicioni floor)...");
  const clubCache = new Map<string, string>();
  let ok = 0;
  let skipped = 0;

  for (const row of rows) {
    const position = row.position.toUpperCase() as Position;
    if (!PRICE_BOUNDS[position]) {
      console.warn(`   ⚠️ Nepoznata pozicija "${row.position}" za ${row.first_name} ${row.last_name} — preskačem (očekivano: GK/DEF/MID/FWD)`);
      skipped++;
      continue;
    }

    let clubId = clubCache.get(row.club_name);
    if (!clubId) {
      const { data: club } = await supabase
        .from("clubs")
        .select("id")
        .ilike("name", `%${row.club_name}%`)
        .maybeSingle();

      if (!club) {
        console.warn(`   ⚠️ Klub "${row.club_name}" nije nađen u bazi — preskačem ${row.first_name} ${row.last_name}`);
        skipped++;
        continue;
      }
      clubId = club.id as string;
      clubCache.set(row.club_name, clubId);
    }

    const marketValue = Number(row.market_value_eur) || 0;

    const { error } = await supabase.from("players").upsert(
      {
        club_id: clubId,
        first_name: row.first_name,
        last_name: row.last_name,
        position,
        price: PRICE_BOUNDS[position].floor,
        market_value_eur: marketValue,
      },
      { onConflict: "club_id,first_name,last_name" }
    );

    if (error) {
      console.warn(`   ⚠️ Greška za ${row.first_name} ${row.last_name}: ${error.message}`);
      skipped++;
      continue;
    }
    ok++;
  }
  console.log(`   ✓ Upisano/ažurirano: ${ok}, preskočeno: ${skipped}`);

  console.log("\n2) Računam finalne cene po pozicijama (percentil tržišne vrednosti → kubna kriva)...");
  const positions: Position[] = ["GK", "DEF", "MID", "FWD"];
  for (const position of positions) {
    const { data: playersInPosition } = await supabase
      .from("players")
      .select("id, market_value_eur")
      .eq("position", position);

    if (!playersInPosition || playersInPosition.length === 0) {
      console.log(`   ${position}: nema igrača, preskačem`);
      continue;
    }

    const scored = [...playersInPosition].sort(
      (a, b) => (a.market_value_eur ?? 0) - (b.market_value_eur ?? 0)
    );
    const bounds = PRICE_BOUNDS[position];

    for (let i = 0; i < scored.length; i++) {
      const percentile = scored.length === 1 ? 1 : i / (scored.length - 1);
      const price = priceFromPercentile(percentile, bounds.floor, bounds.ceiling);
      await supabase.from("players").update({ price }).eq("id", scored[i].id);
    }
    console.log(`   ✓ ${position}: ${scored.length} igrača, cene ${bounds.floor}M–${bounds.ceiling}M`);
  }

  const { count } = await supabase.from("players").select("*", { count: "exact", head: true });
  console.log(`\n🎉 Gotovo. Ukupno igrača u bazi: ${count}`);
}

main().catch((err) => {
  console.error("\n❌ GREŠKA:", err.message ?? err);
  process.exit(1);
});
