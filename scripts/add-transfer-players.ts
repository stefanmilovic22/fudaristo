/**
 * Dodaje igrače iz prelaznog roka koji još nisu u bazi.
 *
 * NE koristi se `npm run import-roster` za ovo: ta skripta posle upisa
 * PONOVO IZRAČUNA CENE SVIM IGRAČIMA u toj poziciji (videti napomenu u
 * migrations/data-novi-igraci.sql) — usred sezone bi to pomerilo cenu svakom
 * golmanu/beku/veznom/napadaču u ligi. Ova skripta radi isto što je ranije
 * rađeno ručno kroz jednokratne SQL fajlove (data-novi-igraci.sql,
 * data-kolo3-dopuna.sql), samo kao skripta koja se može ponovo pokrenuti sa
 * novom listom kad god dođe novi talas transfera.
 *
 * PREPOZNAVANJE VEĆ POSTOJEĆIH IGRAČA NIJE 1-1 STRING PROREĐIVANJE:
 * imena stižu iz različitih izvora (worldfootball parser, ručni unos,
 * API-Football) i ne pišu se uvek identično — dijakritici (Jakić / Jakic),
 * srednja imena (Juan José / Juan), razmaci. Zato se svaki novi igrač
 * upoređuje sa svima iz ISTOG kluba preko normalizovanog imena (bez
 * dijakritika, malim slovima) i Levenshtein sličnosti — tačno poklapanje ili
 * visoka sličnost (>= 0.82) se PRIJAVLJUJE i PRESKAČE, ne upisuje se ćutke
 * kao duplikat niti se ćutke ignoriše kao "sigurno isti".
 *
 * Cena novog igrača računa se ISTOM formulom kao u
 * migrations/data-novi-igraci.sql (GDD sekcija 17, percentil³), u odnosu na
 * POSTOJEĆU raspodelu te pozicije — igrači dodati ranije u istom pokretanju
 * ulaze u tu raspodelu za sledeće, ali nijedan POSTOJEĆI igrač se ne dira.
 *
 * Pokretanje:
 *   npm run add-transfer-players            # probni prolaz, ništa se ne upisuje
 *   npm run add-transfer-players -- --apply # stvarno upiše
 */

import { cliClient } from "./_cli";

type Position = "GK" | "DEF" | "MID" | "FWD";

type NewPlayer = {
  firstName: string;
  lastName: string;
  clubName: string;
  position: Position;
  marketValueRaw: string;
};

// Lista iz prelaznog roka — dopuni ovde kad stigne sledeći talas.
const NEW_PLAYERS: NewPlayer[] = [
  { firstName: "Juan", lastName: "Perea", clubName: "Atromitos", position: "FWD", marketValueRaw: "€1.20m" },
  { firstName: "Aliou", lastName: "Badji", clubName: "Levadiakos", position: "FWD", marketValueRaw: "€500k" },
  { firstName: "Mamadou", lastName: "Soumahoro", clubName: "Kalamata", position: "MID", marketValueRaw: "€100k" },
  { firstName: "Kristijan", lastName: "Jakić", clubName: "PAOK", position: "MID", marketValueRaw: "€6.00m" },
  { firstName: "Dženis", lastName: "Burnić", clubName: "Volos NFC", position: "MID", marketValueRaw: "€1.20m" },
  { firstName: "Anastasios", lastName: "Chatzigiovanis", clubName: "OFI Crete", position: "FWD", marketValueRaw: "€750k" },
  { firstName: "Bruma", lastName: "Bruma", clubName: "Aris Thessaloniki", position: "FWD", marketValueRaw: "3.2m" },
  { firstName: "Octavian", lastName: "Popescu", clubName: "Levadiakos", position: "FWD", marketValueRaw: "€600k" },
  { firstName: "Anass", lastName: "Salah-Eddine", clubName: "Panathinaikos", position: "DEF", marketValueRaw: "€12.00m" },
  { firstName: "Simon", lastName: "Banza", clubName: "PAOK", position: "FWD", marketValueRaw: "€10.00m" },
  { firstName: "Jonathan", lastName: "Panzo", clubName: "Levadiakos", position: "DEF", marketValueRaw: "€1.50m" },
  { firstName: "Xande", lastName: "Silva", clubName: "Iraklis", position: "FWD", marketValueRaw: "€600k" },
  { firstName: "Adam", lastName: "Žulevič", clubName: "Iraklis", position: "FWD", marketValueRaw: "€300k" },
  { firstName: "Marius", lastName: "Mouandilmadji", clubName: "Olympiacos", position: "FWD", marketValueRaw: "€7.00m" },
];

const PRICE_BOUNDS: Record<Position, { floor: number; ceiling: number }> = {
  GK: { floor: 4.0, ceiling: 5.5 },
  DEF: { floor: 4.0, ceiling: 7.0 },
  MID: { floor: 4.5, ceiling: 13.5 },
  FWD: { floor: 4.5, ceiling: 14.0 },
};

const SIMILARITY_THRESHOLD = 0.82;

// Opseg kombinujućih dijakritičkih znakova (U+0300–U+036F) — grade se preko
// String.fromCharCode umesto \uXXXX literala u regex-u, jer alati za
// izmenu fajlova umeju da tu escape sekvencu tiho dekodiraju u sam znak.
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, "g");

/** Bez dijakritika, malim slovima, bez viška razmaka — osnova za poređenje. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/** 1 = identično, 0 = potpuno različito. */
export function similarity(a: string, b: string): number {
  const dist = levenshtein(a, b);
  const longest = Math.max(a.length, b.length, 1);
  return 1 - dist / longest;
}

/** "€1.20m" / "€500k" / "3.2m" → broj evra. */
export function parseMarketValue(raw: string): number {
  const cleaned = raw.replace(/[€\s]/g, "").toLowerCase();
  const match = /^([\d.,]+)(m|k)?$/.exec(cleaned);
  if (!match) throw new Error(`Ne mogu da parsiram tržišnu vrednost: "${raw}"`);
  const num = parseFloat(match[1].replace(",", "."));
  if (match[2] === "m") return Math.round(num * 1_000_000);
  if (match[2] === "k") return Math.round(num * 1_000);
  return Math.round(num);
}

export function priceFromPercentile(percentile: number, floor: number, ceiling: number): number {
  return Math.round((floor + (ceiling - floor) * percentile ** 3) * 10) / 10;
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  const supabase = cliClient();

  const { data: clubs, error: clubError } = await supabase.from("clubs").select("id, name");
  if (clubError) throw new Error(clubError.message);

  const { data: existingPlayers, error: playerError } = await supabase
    .from("players")
    .select("id, first_name, last_name, club_id, position, market_value_eur");
  if (playerError) throw new Error(playerError.message);

  // Radni skup po poziciji — postojeći igrači + oni upravo "dodati" u ovom
  // pokretanju, da sledeći u listi vidi ispravnu raspodelu (ista logika kao
  // migrations/data-novi-igraci.sql, koja isto radi red-po-red u petlji).
  const pool = new Map<Position, { marketValue: number }[]>();
  for (const p of existingPlayers ?? []) {
    const pos = p.position as Position;
    if (!pool.has(pos)) pool.set(pos, []);
    pool.get(pos)!.push({ marketValue: p.market_value_eur ?? 0 });
  }

  let added = 0;
  let skippedDuplicate = 0;
  let skippedNoClub = 0;
  const toInsert: {
    club_id: string;
    first_name: string;
    last_name: string;
    position: Position;
    price: number;
    market_value_eur: number;
  }[] = [];

  for (const np of NEW_PLAYERS) {
    const club = (clubs ?? []).find(
      (c) => normalizeName(c.name) === normalizeName(np.clubName)
    );
    if (!club) {
      console.warn(`⚠️  Klub "${np.clubName}" nije nađen u bazi — preskačem ${np.firstName} ${np.lastName}.`);
      skippedNoClub++;
      continue;
    }

    const normFull = normalizeName(`${np.firstName} ${np.lastName}`);
    const normLast = normalizeName(np.lastName);
    const candidates = (existingPlayers ?? []).filter((p) => p.club_id === club.id);

    // Puna sličnost hvata dijakritike/kucanje (Jakić/Jakic), ali NE hvata
    // "Juan José Perea" vs "Juan Perea" — različit broj reči u imenu vuče
    // score ispod praga iako je isti igrač. Isto prezime u istom klubu je
    // zato zaseban, jači signal: retko je slučajnost da dva različita
    // igrača u istom klubu nose identično prezime.
    let bestMatch: { name: string; score: number; reason: "sličnost" | "prezime" } | null = null;
    for (const c of candidates) {
      const score = similarity(normFull, normalizeName(`${c.first_name} ${c.last_name}`));
      const sameLast = normLast.length > 0 && normalizeName(c.last_name) === normLast;
      const reason: "sličnost" | "prezime" = score >= SIMILARITY_THRESHOLD ? "sličnost" : "prezime";
      const effectiveScore = score >= SIMILARITY_THRESHOLD ? score : sameLast ? SIMILARITY_THRESHOLD : score;
      if (sameLast || score >= SIMILARITY_THRESHOLD) {
        if (!bestMatch || effectiveScore > bestMatch.score) {
          bestMatch = { name: `${c.first_name} ${c.last_name}`, score: effectiveScore, reason };
        }
      }
    }

    if (bestMatch) {
      const detail =
        bestMatch.reason === "sličnost"
          ? `sličnost ${(bestMatch.score * 100).toFixed(0)}%`
          : `isto prezime u istom klubu, različito ime — PROVERI RUČNO da li je stvarno isti igrač`;
      console.log(
        `⏭️  Preskačem ${np.firstName} ${np.lastName} (${club.name}) — već postoji kao "${bestMatch.name}" (${detail}).`
      );
      skippedDuplicate++;
      continue;
    }

    const marketValue = parseMarketValue(np.marketValueRaw);
    const posPool = pool.get(np.position) ?? [];
    const below = posPool.filter((p) => p.marketValue < marketValue).length;
    const percentile = posPool.length === 0 ? 1 : below / posPool.length;
    const bounds = PRICE_BOUNDS[np.position];
    const price = priceFromPercentile(percentile, bounds.floor, bounds.ceiling);

    // Nije proglašeno duplikatom, ali korisno je videti šta je bilo najbliže
    // — laka provera da li je prag postavljen razumno.
    let closest: { name: string; score: number } | null = null;
    for (const c of candidates) {
      const score = similarity(normFull, normalizeName(`${c.first_name} ${c.last_name}`));
      if (!closest || score > closest.score) closest = { name: `${c.first_name} ${c.last_name}`, score };
    }
    if (closest) {
      console.log(
        `   (najbliži postojeći u tom klubu je "${closest.name}", sličnost samo ${(closest.score * 100).toFixed(0)}% — tretiram kao različitog igrača)`
      );
    }
    console.log(
      `✓ Nov: ${np.firstName} ${np.lastName} (${np.position}) → ${club.name} · ` +
        `percentil ${percentile.toFixed(2)}, cena ${price}M`
    );

    toInsert.push({
      club_id: club.id,
      first_name: np.firstName,
      last_name: np.lastName,
      position: np.position,
      price,
      market_value_eur: marketValue,
    });
    if (!pool.has(np.position)) pool.set(np.position, []);
    pool.get(np.position)!.push({ marketValue });
    added++;
  }

  console.log(
    `\nUkupno: ${added} novih, ${skippedDuplicate} preskočeno (već postoje), ${skippedNoClub} preskočeno (klub nije nađen).`
  );

  if (!APPLY) {
    console.log("\nProbni prolaz — ništa nije upisano. Pokreni sa `-- --apply` da se sačuva.");
    return;
  }

  let written = 0;
  for (const row of toInsert) {
    const { error } = await supabase.from("players").insert(row);
    if (error) {
      console.warn(`⚠️  Upis nije uspeo za ${row.first_name} ${row.last_name}: ${error.message}`);
      continue;
    }
    written++;
  }
  console.log(`\n🎉 Upisano ${written}/${toInsert.length} igrača.`);
}

main().catch((err) => {
  console.error(`\n❌ GREŠKA: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
