/**
 * „Meč kola” na početnoj: veliki derbiji imaju prednost, a kad ih nema, bira
 * se meč u kome učestvuju najbolje plasirani klubovi sa prave tabele.
 * Poredi se po imenu kluba (bez velikih slova, „sadrži”), pa radi i sa
 * „Olympiacos” i sa „Olympiacos Piraeus”.
 */
const DERBIES: { a: string; b: string; weight: number }[] = [
  { a: "olympiacos", b: "panathinaikos", weight: 100 }, // „veliki derbi”
  { a: "aek", b: "panathinaikos", weight: 85 },
  { a: "aek", b: "olympiacos", weight: 80 },
  { a: "paok", b: "olympiacos", weight: 75 },
  { a: "paok", b: "panathinaikos", weight: 70 },
  { a: "paok", b: "aek", weight: 65 },
  { a: "paok", b: "aris", weight: 60 }, // derbi Soluna
];

const has = (name: string | undefined, key: string) => (name ?? "").toLowerCase().includes(key);

export function pickFeaturedMatch<
  M extends { status?: string; home?: { name?: string }; away?: { name?: string } },
>(matches: M[], tableRank: Map<string, number> = new Map()): M | null {
  const upcoming = matches.filter((m) => !m.status || m.status === "scheduled");
  const pool = upcoming.length > 0 ? upcoming : matches;
  if (pool.length === 0) return null;

  const score = (m: M) => {
    const h = m.home?.name;
    const a = m.away?.name;
    let best = 0;
    for (const d of DERBIES) {
      if ((has(h, d.a) && has(a, d.b)) || (has(h, d.b) && has(a, d.a))) best = Math.max(best, d.weight);
    }
    // Bez derbija: bolji zbir mesta na tabeli (manji broj) = veći rezultat (< 50).
    const rh = tableRank.get(h ?? "") ?? 99;
    const ra = tableRank.get(a ?? "") ?? 99;
    const tableScore = Math.max(0, 40 - (rh + ra));
    return best + tableScore;
  };

  // Stabilno: pri izjednačenju ostaje raniji meč (red u listi je po terminu).
  return pool.reduce((top, m) => (score(m) > score(top) ? m : top), pool[0]);
}
