/**
 * ⚠️ OPCIONO — samo ako imaš API-Football PRO tier (ili viši).
 *
 * Free tier API-Football NE dozvoljava pristup tekućoj sezoni (2026) niti
 * prošloj (2025) — samo istorijske sezone 2022-2024 (potvrđeno stvarnom
 * greškom sa API-ja: "Free plans do not have access to this season, try
 * from 2022 to 2024"). Zato je PRIMARNI put za seed podataka sad
 * `scripts/import-roster-csv.ts` (ručni CSV unos sa Transfermarkt vrednostima),
 * ne ova skripta.
 *
 * Ostavljeno ovde za slučaj da kasnije nadogradiš na Pro tier ($19/mesec,
 * uklanja ograničenje sezone) — tad ova skripta ponovo postaje relevantna.
 *
 * Faza 2 (IMPLEMENTATION-PLAN.md): jednokratni seed 14 klubova i rostera
 * grčke Super League pre starta sezone. Pokreće se lokalno (`npm run seed`),
 * NE kao cron.
 *
 * ⚠️ NAPOMENA: ovaj kod NIJE testiran protiv pravog API-Football odgovora
 * (sandbox u kom je pisan nema mrežni pristup api-football.com). Endpoint
 * putanje i imena polja su po zvaničnoj v3 dokumentaciji, ali ako API vrati
 * nešto neočekivano, greška će biti jasno ispisana u konzoli — pošalji mi
 * tačan tekst pa ćemo ispraviti zajedno.
 *
 * Redosled:
 * 1. GET /leagues?country=Greece → nađi tačan league_id za Super League
 * 2. GET /teams?league={id}&season=2026 → upiši/ažuriraj 14 klubova
 * 3. GET /players?league={id}&season=2025 (paginirano) → prošlosezonska
 *    statistika SVIH igrača lige (golovi/asistencije/minuti) — koristi se
 *    samo za računanje cena, ne upisuje se direktno
 * 4. GET /players/squads?team={id} po klubu → TEKUĆI rosteri (2026/27)
 * 5. Izračunaj cene: value score → percentil unutar pozicije → kubna kriva
 *    (GDD sekcija 17)
 *
 * Rate limit: API-Football free tier = 10 poziva/min, 100/dan. Skripta čeka
 * ~6.5s između poziva ka API-Football (ne i između Supabase poziva).
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { WebSocket } from "ws";

// tsx (za razliku od Next.js dev servera) ne učitava .env.local automatski —
// to je Next.js-specifična funkcija. Ovo mora biti PRVO, pre bilo kakvog
// čitanja process.env ispod.
dotenv.config({ path: ".env.local" });

// @supabase/supabase-js interno pravi Realtime klijent u konstruktoru, koji
// zahteva global WebSocket konstruktor. Node 22+ ga ima nativno; na starijim
// verzijama (npr. Node 20) treba polyfill — čak i kad Realtime uopšte ne
// koristimo u ovoj skripti, konstruktor i dalje puca bez ovoga.
if (!globalThis.WebSocket) {
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
}

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const API_BASE = "https://v3.football.api-sports.io";
const CURRENT_SEASON = 2026; // 2026/27 — API-Football koristi početnu godinu sezone
const PREVIOUS_SEASON = 2025; // 2025/26 — koristi se samo za value score / cene
const RATE_LIMIT_DELAY_MS = 6500; // malo iznad 6s da ostanemo ispod 10 poziva/min

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nisu podešeni u .env.local");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

type Position = "GK" | "DEF" | "MID" | "FWD";

type PlayerStats = { goals: number; assists: number; minutes: number };

const PRICE_BOUNDS: Record<Position, { floor: number; ceiling: number }> = {
  GK: { floor: 4.0, ceiling: 5.5 },
  DEF: { floor: 4.0, ceiling: 7.0 },
  MID: { floor: 4.5, ceiling: 13.5 },
  FWD: { floor: 4.5, ceiling: 14.0 },
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiFootball(path: string, params: Record<string, string | number>) {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const res = await fetch(url.toString(), {
    headers: { "x-apisports-key": API_FOOTBALL_KEY! },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} za ${path}: ${await res.text()}`);
  }

  const json = await res.json();
  const errCount = Array.isArray(json.errors) ? json.errors.length : Object.keys(json.errors ?? {}).length;
  if (errCount > 0) {
    throw new Error(`API-Football greška za ${path}: ${JSON.stringify(json.errors)}`);
  }

  await sleep(RATE_LIMIT_DELAY_MS);
  return json;
}

// API-Football vraća "Goalkeeper"/"Defender"/"Midfielder"/"Attacker"
function mapPosition(apiPosition: string | undefined): Position {
  const map: Record<string, Position> = {
    Goalkeeper: "GK",
    Defender: "DEF",
    Midfielder: "MID",
    Attacker: "FWD",
  };
  return map[apiPosition ?? ""] ?? "MID";
}

// Value score iz GDD sekcije 17. Napomena: clean_sheets namerno izostavljeni
// iz v1 (nisu pouzdano dostupni per-player iz /players endpointa bez
// dodatnih poziva) — DEF/GK cene su zato malo grublja aproksimacija dok se
// Faza 5/6 (fixtures ingestion) ne uključi i ne omogući tačan clean-sheet
// račun iz sačuvanih rezultata.
function valueScore(position: Position, s: PlayerStats): number {
  const fullApps = Math.floor(s.minutes / 90); // gruba aproksimacija "punih" nastupa
  switch (position) {
    case "GK":
      return fullApps * 0.5;
    case "DEF":
      return s.goals * 6 + s.assists * 3 + fullApps * 0.3;
    case "MID":
      return s.goals * 5 + s.assists * 3 + fullApps * 0.2;
    case "FWD":
      return s.goals * 4 + s.assists * 3 + fullApps * 0.2;
  }
}

async function main() {
  if (!API_FOOTBALL_KEY) throw new Error("API_FOOTBALL_KEY nije podešen u .env.local");

  console.log("1) Nalazim league_id za grčku Super League...");
  const leaguesRes = await apiFootball("/leagues", { country: "Greece" });
  const superLeague = (leaguesRes.response as any[]).find(
    (l) => l.league.type === "League" && /super league/i.test(l.league.name)
  );
  if (!superLeague) {
    console.error("Puni odgovor /leagues?country=Greece:", JSON.stringify(leaguesRes.response, null, 2));
    throw new Error("Nisam automatski prepoznao Super League — pogledaj ispis iznad i nađi ručno tačan league.id");
  }
  const leagueId = superLeague.league.id;
  console.log(`   ✓ league_id=${leagueId} (${superLeague.league.name})`);

  console.log("\n2) Povlačim 14 klubova za sezonu 2026/27...");
  const teamsRes = await apiFootball("/teams", { league: leagueId, season: CURRENT_SEASON });
  const apiTeams: any[] = teamsRes.response;
  console.log(`   ✓ Nađeno ${apiTeams.length} klubova`);
  if (apiTeams.length !== 14) {
    console.warn(`   ⚠️ Očekivano 14 klubova, dobijeno ${apiTeams.length} — proveri sezonu/league_id pre nego što nastaviš`);
  }

  console.log("\n3) Ažuriram api_football_id na postojećim klubovima (uneti ručno u Fazi 1)...");
  const clubIdByApiId = new Map<number, string>();
  for (const t of apiTeams) {
    const apiId = t.team.id;
    const name = t.team.name as string;

    const { data: existing } = await supabase
      .from("clubs")
      .select("id")
      .ilike("name", `%${name.split(" ")[0]}%`)
      .maybeSingle();

    if (existing) {
      await supabase.from("clubs").update({ api_football_id: apiId }).eq("id", existing.id);
      clubIdByApiId.set(apiId, existing.id);
      console.log(`   ✓ ${name} → povezan sa postojećim redom`);
    } else {
      const { data: inserted } = await supabase
        .from("clubs")
        .insert({
          name,
          short_name: name.slice(0, 4).toUpperCase(),
          primary_color: "#8494AC",
          api_football_id: apiId,
        })
        .select("id")
        .single();
      if (inserted) {
        clubIdByApiId.set(apiId, inserted.id);
        console.log(`   + ${name} → nov red (nije prepoznat po imenu iz Faze 1 seed-a)`);
      }
    }
  }

  console.log("\n4) Povlačim prošlosezonsku (2025/26) statistiku svih igrača lige, za cene...");
  const statsByPlayerId = new Map<number, PlayerStats>();
  let page = 1;
  let totalPages = 1;
  do {
    const res = await apiFootball("/players", { league: leagueId, season: PREVIOUS_SEASON, page });
    totalPages = res.paging?.total ?? 1;
    for (const entry of res.response as any[]) {
      const stats = entry.statistics?.[0];
      if (!stats) continue;
      statsByPlayerId.set(entry.player.id, {
        goals: stats.goals?.total ?? 0,
        assists: stats.goals?.assists ?? 0,
        minutes: stats.games?.minutes ?? 0,
      });
    }
    console.log(`   strana ${page}/${totalPages} obrađena (${statsByPlayerId.size} igrača do sad)`);
    page++;
  } while (page <= totalPages);
  console.log(`   ✓ Sakupljena statistika za ${statsByPlayerId.size} igrača ukupno`);

  console.log("\n5) Povlačim TEKUĆE rostere (2026/27) po klubu...");
  for (const t of apiTeams) {
    const ourClubId = clubIdByApiId.get(t.team.id);
    if (!ourClubId) {
      console.warn(`   ⚠️ Preskačem ${t.team.name} — nema mapiranog club_id`);
      continue;
    }

    const squadRes = await apiFootball("/players/squads", { team: t.team.id });
    const squad: any[] = squadRes.response?.[0]?.players ?? [];
    console.log(`   ${t.team.name}: ${squad.length} igrača`);

    for (const p of squad) {
      const position = mapPosition(p.position);
      const nameParts = (p.name as string).split(" ");

      await supabase.from("players").upsert(
        {
          club_id: ourClubId,
          first_name: nameParts[0] ?? p.name,
          last_name: nameParts.slice(1).join(" ") || p.name,
          position,
          price: PRICE_BOUNDS[position].floor, // privremeno — prava cena se upisuje u koraku 6
          api_football_id: p.id,
        },
        { onConflict: "api_football_id" }
      );
    }
  }

  console.log("\n6) Računam percentile i finalne cene po poziciji (GDD sekcija 17)...");
  const positions: Position[] = ["GK", "DEF", "MID", "FWD"];
  for (const position of positions) {
    const { data: playersInPosition } = await supabase
      .from("players")
      .select("id, api_football_id")
      .eq("position", position);

    if (!playersInPosition || playersInPosition.length === 0) {
      console.log(`   ${position}: nema igrača, preskačem`);
      continue;
    }

    const scored = playersInPosition.map((pl) => ({
      id: pl.id,
      score: valueScore(position, statsByPlayerId.get(pl.api_football_id!) ?? { goals: 0, assists: 0, minutes: 0 }),
    }));
    scored.sort((a, b) => a.score - b.score);

    const bounds = PRICE_BOUNDS[position];
    for (let i = 0; i < scored.length; i++) {
      const percentile = scored.length === 1 ? 1 : i / (scored.length - 1);
      const price = Math.round((bounds.floor + (bounds.ceiling - bounds.floor) * percentile ** 3) * 10) / 10;
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
