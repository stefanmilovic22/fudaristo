// ============================================================================
// Fantasy pravila
//
// ⚠️ NAPOMENA: IMPLEMENTATION-PLAN.md / GDD nisu bili deo starter zip-a, pa su
// brojevi ispod pretpostavka po FPL-standardnim pravilima (uklopljeno sa onim
// što schema.sql i skripte već nagoveštavaju). Ako se tvoj GDD razlikuje, ovo
// su jedina mesta koja treba promeniti.
//
// ⚠️ Ova pravila se DUPLIRAJU u migrations/003-security-and-rpc.sql
// (funkcije save_squad / make_transfer). Klijentska verzija služi za trenutni
// fidbek u UI-ju; serverska je ta koja stvarno odlučuje. Ako menjaš broj
// igrača, formacije ili max-po-klubu — promeni na OBA mesta.
// ============================================================================

/**
 * Razlog blokade koji PlayerPicker ističe crvenom bojom (umesto obične sive) —
 * jedini od kojih korisnik može ostati "zaglavljen" bez rešenja bez skidanja
 * već izabranog igrača, pa mora biti upadljiviji od "Preskup" i sličnih.
 */
export const BUDGET_LOCK_REASON = "Ne bi ostalo za ostatak tima";

export type Position = "GK" | "DEF" | "MID" | "FWD";

export const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

export const POSITION_LABELS: Record<Position, string> = {
  GK: "Golman",
  DEF: "Odbrana",
  MID: "Vezni red",
  FWD: "Napad",
};

/** Skraćenice za mesta gde pun naziv ne staje — pločica dresa je široka 68px. */
export const POSITION_SHORT: Record<Position, string> = {
  GK: "GOL",
  DEF: "ODB",
  MID: "VEZ",
  FWD: "NAP",
};

// Pun sastav (15 igrača): 2 GK / 5 DEF / 5 MID / 3 FWD — FPL standard.
export const SQUAD_COMPOSITION: Record<Position, number> = {
  GK: 2,
  DEF: 5,
  MID: 5,
  FWD: 3,
};

export const SQUAD_SIZE = Object.values(SQUAD_COMPOSITION).reduce((a, b) => a + b, 0); // 15

export const STARTING_XI_SIZE = 11;
export const BENCH_SIZE = SQUAD_SIZE - STARTING_XI_SIZE; // 4

// Dozvoljeni raspon po poziciji ZA POČETNIH 11.
export const STARTING_XI_BOUNDS: Record<Position, [number, number]> = {
  GK: [1, 1],
  DEF: [3, 5],
  MID: [2, 5],
  FWD: [1, 3],
};

export const BUDGET_TOTAL = 100.0; // usklađeno sa users.budget_remaining DEFAULT 100.0

// Max 3 igrača iz istog realnog kluba u timu — potvrđeno GDD sekcija 3.
export const MAX_PLAYERS_PER_CLUB = 3;

export type SelectablePlayer = {
  id: string;
  first_name: string;
  last_name: string;
  position: Position;
  price: number;
  status: string;
  club_id: string;
  club_name: string;
  /**
   * Zvanična skraćenica iz clubs.short_name — NIKAD izvedena iz imena.
   * `club_name.slice(0, 3)` je i Panathinaikos i Panetolikos pretvarao u "PAN",
   * pa je na dresu i u prikazu protivnika stajao isti kod za dva kluba.
   */
  club_short: string;
  club_color: string;
  /** Prava fotografija kluba (clubs.jersey_photo_url) — null dok klub nema fotografiju. */
  club_jersey_photo_url: string | null;
  total_points: number;
  /** Prosečna SofaScore ocena (v_player_avg_rating) — null dok nema nijednu ocenu. */
  avg_rating: number | null;
};

/**
 * Validacija punog sastava od 15 igrača (sastav, budžet, max po klubu).
 * `budget` je raspoloživ novac — za prvi tim je to 100M, ali posle prenosa
 * sastava iz kola u kolo korisnik kreće od svog users.budget_remaining.
 */
export function validateFullSquad(
  selected: SelectablePlayer[],
  budget: number = BUDGET_TOTAL
): string[] {
  const errors: string[] = [];

  if (selected.length !== SQUAD_SIZE) {
    errors.push(`Tim mora imati tačno ${SQUAD_SIZE} igrača (trenutno: ${selected.length}).`);
  }

  for (const pos of POSITIONS) {
    const count = selected.filter((p) => p.position === pos).length;
    const required = SQUAD_COMPOSITION[pos];
    if (count !== required) {
      errors.push(`${POSITION_LABELS[pos]}: potrebno ${required}, izabrano ${count}.`);
    }
  }

  const totalSpent = selected.reduce((sum, p) => sum + Number(p.price), 0);
  if (totalSpent > budget + 1e-9) {
    errors.push(`Budžet premašen: ${totalSpent.toFixed(1)}M od ${budget.toFixed(1)}M.`);
  }

  const perClub = new Map<string, number>();
  for (const p of selected) {
    perClub.set(p.club_id, (perClub.get(p.club_id) ?? 0) + 1);
  }
  for (const [clubId, count] of perClub) {
    if (count > MAX_PLAYERS_PER_CLUB) {
      const clubName = selected.find((p) => p.club_id === clubId)?.club_name ?? clubId;
      errors.push(`Najviše ${MAX_PLAYERS_PER_CLUB} igrača iz istog kluba — ${clubName}: ${count}.`);
    }
  }

  return errors;
}

/** Validacija formacije početnih 11 + kapiten/vice-kapiten. */
export function validateStartingXI(
  squad: SelectablePlayer[],
  startingIds: Set<string>,
  captainId: string | null,
  viceCaptainId: string | null
): string[] {
  const errors: string[] = [];
  const starting = squad.filter((p) => startingIds.has(p.id));

  if (starting.length !== STARTING_XI_SIZE) {
    errors.push(`Prvih ${STARTING_XI_SIZE} mora biti izabrano (trenutno: ${starting.length}).`);
  }

  for (const pos of POSITIONS) {
    const count = starting.filter((p) => p.position === pos).length;
    const [min, max] = STARTING_XI_BOUNDS[pos];
    if (count < min || count > max) {
      errors.push(`${POSITION_LABELS[pos]} u prvih 11: ${count} (dozvoljeno ${min}–${max}).`);
    }
  }

  if (!captainId) errors.push("Izaberi kapitena.");
  if (!viceCaptainId) errors.push("Izaberi vice-kapitena.");
  if (captainId && viceCaptainId && captainId === viceCaptainId) {
    errors.push("Kapiten i vice-kapiten ne mogu biti isti igrač.");
  }
  if (captainId && !startingIds.has(captainId)) {
    errors.push("Kapiten mora biti u prvih 11.");
  }
  if (viceCaptainId && !startingIds.has(viceCaptainId)) {
    errors.push("Vice-kapiten mora biti u prvih 11.");
  }

  return errors;
}

// ----------------------------------------------------------------------------
// AUTO-PICK
//
// GDD sekcija 3 traži "jednim klikom validan tim". Prva verzija je bila čist
// greedy po total_points/price, što je sistematski kupovalo najjeftinije: tim
// je bio validan, ali je u proseku trošio ~73M od 100M i nikad nije uzimao
// zvezdu. Sad ide u tri koraka:
//
//   1) SIDRO — najskuplji igrač kog budžet uopšte može da podnese (uz rezervu
//      za preostalih 14 mesta). Garantuje da tim ima bar jedno veliko ime.
//   2) POPUNA — ostatak sastava greedy po vrednosti-za-cenu, sa rezervom da se
//      uvek može popuniti svih 15 mesta.
//   3) NADOGRADNJA — dok god ima neiskorišćenog budžeta, traži zamenu (isti
//      položaj, poštuje max 3 po klubu) koja najviše podiže kvalitet tima.
//
// "Kvalitet" je normalizovana mešavina poena i cene: na startu sezone su svi
// total_points nule, pa cena nosi ceo signal (skuplji = bolji, jedini podatak
// koji tad postoji). Čim poeni počnu da se sabiraju (Faza 6), oni preuzimaju
// dominaciju i auto-pick sam prelazi na "ko stvarno donosi poene".
// ----------------------------------------------------------------------------

const POINTS_WEIGHT = 2.0; // koliko poeni nadjačaju cenu kad ih ima

function buildQualityFn(pool: SelectablePlayer[]): (p: SelectablePlayer) => number {
  const maxPoints = Math.max(0, ...pool.map((p) => p.total_points));
  const prices = pool.map((p) => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceSpan = Math.max(0.1, maxPrice - minPrice);

  return (p) => {
    const pointsPart = maxPoints > 0 ? (p.total_points / maxPoints) * POINTS_WEIGHT : 0;
    const pricePart = (p.price - minPrice) / priceSpan;
    return pointsPart + pricePart;
  };
}

/** Vrednost-za-cenu — koristi se samo u koraku popune. */
function valueScore(p: SelectablePlayer): number {
  return (p.total_points + 1) / p.price;
}

/** Zbir N najjeftinijih cena iz liste (rezerva budžeta za preostala mesta). */
function cheapestSum(pool: SelectablePlayer[], n: number): number {
  if (n <= 0) return 0;
  const sorted = [...pool].sort((a, b) => a.price - b.price);
  if (sorted.length < n) return Number.POSITIVE_INFINITY;
  return sorted.slice(0, n).reduce((sum, p) => sum + p.price, 0);
}

/**
 * Sve formacije dozvoljene pravilima (1 GK + 10 iz polja, uz granice iz
 * STARTING_XI_BOUNDS). Izvedeno iz granica, ne prekucano — ako se granice
 * promene, lista se menja sa njima.
 */
export const FORMATIONS: { def: number; mid: number; fwd: number; label: string }[] = (() => {
  const out: { def: number; mid: number; fwd: number; label: string }[] = [];
  const [dMin, dMax] = STARTING_XI_BOUNDS.DEF;
  const [mMin, mMax] = STARTING_XI_BOUNDS.MID;
  const [fMin, fMax] = STARTING_XI_BOUNDS.FWD;
  const outfield = STARTING_XI_SIZE - STARTING_XI_BOUNDS.GK[0];
  for (let def = dMin; def <= dMax; def++) {
    for (let mid = mMin; mid <= mMax; mid++) {
      const fwd = outfield - def - mid;
      if (fwd < fMin || fwd > fMax) continue;
      out.push({ def, mid, fwd, label: `${def}-${mid}-${fwd}` });
    }
  }
  return out;
})();

export type AutoPickResult = {
  squad: SelectablePlayer[];
  startingIds: Set<string>;
  captainId: string;
  viceCaptainId: string;
};

/**
 * Greedy auto-pick pun tim (15 igrača) + formacija + kapiten/vice-kapiten.
 * Vraća `null` ako sa dostupnim igračima i budžetom nije moguće sastaviti
 * validan tim — poziv treba da prikaže grešku i uputi na ručan izbor.
 */
export function autoPickSquad(
  allPlayers: SelectablePlayer[],
  budget: number = BUDGET_TOTAL
): AutoPickResult | null {
  const quality = buildQualityFn(allPlayers);

  const selected: SelectablePlayer[] = [];
  const selectedIds = new Set<string>();
  const clubCounts = new Map<string, number>();
  let spent = 0;

  const positionOrder: Position[] = ["GK", "DEF", "MID", "FWD"];

  function stillNeeded(pos: Position): number {
    return SQUAD_COMPOSITION[pos] - selected.filter((p) => p.position === pos).length;
  }

  function poolFor(pos: Position, exceptId?: string): SelectablePlayer[] {
    return allPlayers.filter(
      (p) => p.position === pos && !selectedIds.has(p.id) && p.id !== exceptId
    );
  }

  /** Najmanji mogući trošak da se popune SVA preostala mesta (bez kandidata). */
  function reserveForAllRemaining(exceptId?: string, extraPos?: Position): number {
    return positionOrder.reduce((sum, pos) => {
      const need = stillNeeded(pos) - (extraPos === pos ? 1 : 0);
      return sum + cheapestSum(poolFor(pos, exceptId), need);
    }, 0);
  }

  function take(p: SelectablePlayer) {
    selected.push(p);
    selectedIds.add(p.id);
    clubCounts.set(p.club_id, (clubCounts.get(p.club_id) ?? 0) + 1);
    spent += p.price;
  }

  // --- 1) SIDRO: najskuplji igrač koji staje u budžet ------------------------
  const anchorCandidates = [...allPlayers].sort(
    (a, b) => b.price - a.price || b.total_points - a.total_points
  );
  for (const candidate of anchorCandidates) {
    const reserve = reserveForAllRemaining(candidate.id, candidate.position);
    if (candidate.price + reserve <= budget + 1e-9) {
      take(candidate);
      break;
    }
  }

  // --- 2) POPUNA: ostatak po vrednosti-za-cenu -------------------------------
  for (let posIdx = 0; posIdx < positionOrder.length; posIdx++) {
    const pos = positionOrder[posIdx];
    let needed = stillNeeded(pos);
    if (needed <= 0) continue;

    const candidates = poolFor(pos).sort((a, b) => valueScore(b) - valueScore(a));

    for (const candidate of candidates) {
      if (needed <= 0) break;
      if ((clubCounts.get(candidate.club_id) ?? 0) >= MAX_PLAYERS_PER_CLUB) continue;

      const reserve = reserveForAllRemaining(candidate.id, pos);
      if (spent + candidate.price + reserve > budget + 1e-9) continue;

      take(candidate);
      needed--;
    }

    // Fallback kad "bezbedna" petlja ne uspe da popuni kvotu (vrlo oskudni
    // podaci) — najjeftiniji preostali koji ne krši max-po-klubu.
    if (needed > 0) {
      const cheapLeftover = poolFor(pos).sort((a, b) => a.price - b.price);
      for (const candidate of cheapLeftover) {
        if (needed <= 0) break;
        if ((clubCounts.get(candidate.club_id) ?? 0) >= MAX_PLAYERS_PER_CLUB) continue;
        take(candidate);
        needed--;
      }
    }

    if (needed > 0) return null; // stvarno nema dovoljno igrača
  }

  if (spent > budget + 1e-9) return null;

  // --- 3) NADOGRADNJA: potroši ostatak budžeta -------------------------------
  // Svaki prolaz traži JEDNU zamenu koja najviše podiže kvalitet i staje u
  // preostali budžet. Ponavlja se dok ima poboljšanja (guard sprečava petlju
  // ako bi zbog zaokruživanja došlo do oscilacije).
  const byPositionPool = new Map<Position, SelectablePlayer[]>();
  for (const pos of positionOrder) {
    byPositionPool.set(pos, allPlayers.filter((p) => p.position === pos));
  }

  for (let guard = 0; guard < 400; guard++) {
    let best: { outIdx: number; cand: SelectablePlayer; gain: number; delta: number } | null = null;

    for (let i = 0; i < selected.length; i++) {
      const out = selected[i];
      const outQuality = quality(out);

      for (const cand of byPositionPool.get(out.position)!) {
        if (selectedIds.has(cand.id)) continue;

        const delta = cand.price - out.price;
        if (spent + delta > budget + 1e-9) continue;

        const clubAfterRemoval =
          (clubCounts.get(cand.club_id) ?? 0) - (cand.club_id === out.club_id ? 1 : 0);
        if (clubAfterRemoval >= MAX_PLAYERS_PER_CLUB) continue;

        const gain = quality(cand) - outQuality;
        if (gain <= 1e-9) continue;

        if (!best || gain > best.gain + 1e-9 || (Math.abs(gain - best.gain) <= 1e-9 && delta > best.delta)) {
          best = { outIdx: i, cand, gain, delta };
        }
      }
    }

    if (!best) break;

    const out = selected[best.outIdx];
    selectedIds.delete(out.id);
    clubCounts.set(out.club_id, (clubCounts.get(out.club_id) ?? 1) - 1);
    spent -= out.price;

    selected[best.outIdx] = best.cand;
    selectedIds.add(best.cand.id);
    clubCounts.set(best.cand.club_id, (clubCounts.get(best.cand.club_id) ?? 0) + 1);
    spent += best.cand.price;
  }

  if (validateFullSquad(selected, budget).length > 0) return null;

  // --- Formacija + kapiten --------------------------------------------------
  // Minimum po poziciji (1 GK / 3 DEF / 2 MID / 1 FWD = 7), pa preostala 4
  // mesta najboljima po kvalitetu (rezervni golman nikad ne ulazi).
  const byPosition = (pos: Position) =>
    selected.filter((p) => p.position === pos).sort((a, b) => quality(b) - quality(a));

  const gk = byPosition("GK");
  const def = byPosition("DEF");
  const mid = byPosition("MID");
  const fwd = byPosition("FWD");

  const startingIds = new Set<string>();
  startingIds.add(gk[0].id);
  def.slice(0, 3).forEach((p) => startingIds.add(p.id));
  mid.slice(0, 2).forEach((p) => startingIds.add(p.id));
  fwd.slice(0, 1).forEach((p) => startingIds.add(p.id));

  const extraCandidates = [...def.slice(3), ...mid.slice(2), ...fwd.slice(1)].sort(
    (a, b) => quality(b) - quality(a)
  );
  extraCandidates
    .slice(0, STARTING_XI_SIZE - startingIds.size)
    .forEach((p) => startingIds.add(p.id));

  // Kapiten = najbolji igrač u postavi, ali ne golman (golman skoro nikad nije
  // pravi izbor za kapitensku dupliranu ocenu).
  const starters = selected
    .filter((p) => startingIds.has(p.id))
    .sort((a, b) => quality(b) - quality(a));
  const outfieldStarters = starters.filter((p) => p.position !== "GK");
  const captainPool = outfieldStarters.length >= 2 ? outfieldStarters : starters;

  return {
    squad: selected,
    startingIds,
    captainId: captainPool[0].id,
    viceCaptainId: captainPool[1].id,
  };
}

// ----------------------------------------------------------------------------
// Pomoćno: redosled u bazi (squads.squad_order)
// ----------------------------------------------------------------------------

/**
 * Postava dobija squad_order 1..11 (po liniji, golman prvi), klupa 1..4 —
 * redosled klupe je ono što će auto-sub logika u Fazi 6 koristiti.
 */
export function buildSquadOrder(
  selected: SelectablePlayer[],
  startingIds: Set<string>
): Map<string, number> {
  const order = new Map<string, number>();
  const posRank: Record<Position, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

  const starters = selected
    .filter((p) => startingIds.has(p.id))
    .sort((a, b) => posRank[a.position] - posRank[b.position] || b.price - a.price);
  starters.forEach((p, i) => order.set(p.id, i + 1));

  // Klupa: rezervni golman poslednji (najređe ulazi), ostali po ceni opadajuće.
  const bench = selected
    .filter((p) => !startingIds.has(p.id))
    .sort((a, b) => {
      if (a.position === "GK" && b.position !== "GK") return 1;
      if (b.position === "GK" && a.position !== "GK") return -1;
      return b.price - a.price;
    });
  bench.forEach((p, i) => order.set(p.id, i + 1));

  return order;
}

export function formatEUR(millions: number): string {
  return `${millions.toFixed(1)}M`;
}

export function playerFullName(p: { first_name: string; last_name: string }): string {
  return p.last_name ? `${p.first_name} ${p.last_name}` : p.first_name;
}

/**
 * Prezime za pločicu na dresu. Igrači koji nastupaju pod jednim imenom (npr.
 * Taison) imaju prazan last_name — bez ovoga bi im pločica ostala prazna.
 */
export function playerShirtName(p: { first_name: string; last_name: string }): string {
  return p.last_name || p.first_name;
}
