import { MAX_PLAYERS_PER_CLUB, type SelectablePlayer } from "@/lib/fantasy-rules";

/**
 * Planer transfera — čista logika, bez baze i bez prikaza (verify-planer.ts je
 * proverava). Pravila su ista kao u bazi (migracije 008 i 015) i na /pravila:
 *   - svako kolo +1 slobodan transfer, neiskorišćeni se gomilaju do 5;
 *   - svaki transfer preko slobodnih košta 4 poena;
 *   - igrač se prodaje po ceni po kojoj je kupljen, kupuje po današnjoj ceni;
 *   - zamena je uvek igrač ISTE pozicije, najviše 3 iz istog kluba, kasa ≥ 0.
 * ⚠️ Ovo je samo prikaz. Stvarni transferi (i stvarna cena) se odlučuju u bazi
 * kroz make_transfer(); ako se pravilo promeni, menja se i ovde.
 */
export const FREE_TRANSFERS_MAX = 5;
export const EXTRA_TRANSFER_COST = 4;

export type SquadMember = { player: SelectablePlayer; sellPrice: number };
export type PlannedTransfer = { outId: string; inId: string };
/** Po jedan spisak transfera za svako planirano kolo. */
export type Plan = PlannedTransfer[][];

export type GwResult = {
  startSquad: SquadMember[];
  endSquad: SquadMember[];
  transfers: { out: SquadMember; in: SelectablePlayer }[];
  /** Slobodnih transfera na raspolaganju u ovom kolu. */
  freeAvailable: number;
  used: number;
  /** Poeni koji se skidaju (≥ 0). */
  cost: number;
  budgetBefore: number;
  budgetAfter: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function simulatePlan(input: {
  squad: SquadMember[];
  budget: number;
  freeNow: number;
  plan: Plan;
  players: Map<string, SelectablePlayer>;
  gwCount: number;
}): { gws: GwResult[]; plan: Plan } {
  const { players, gwCount } = input;
  let squad = input.squad;
  let budget = round1(input.budget);
  let free = Math.min(FREE_TRANSFERS_MAX, Math.max(0, input.freeNow));
  const gws: GwResult[] = [];
  const kept: Plan = [];

  for (let k = 0; k < gwCount; k++) {
    const startSquad = squad;
    const startIds = new Set(startSquad.map((m) => m.player.id));
    const budgetBefore = budget;
    const transfers: GwResult["transfers"] = [];
    const keptHere: PlannedTransfer[] = [];

    for (const t of input.plan[k] ?? []) {
      const out = squad.find((m) => m.player.id === t.outId);
      const inn = players.get(t.inId);
      // Samo igrač koji je bio u sastavu NA POČETKU kola može da izađe (nema
      // lanca „kupi pa odmah prodaj" u istom kolu).
      if (!out || !inn || !startIds.has(t.outId)) continue;
      if (squad.some((m) => m.player.id === inn.id)) continue;
      if (inn.position !== out.player.position) continue;
      const clubCount = squad.filter((m) => m.player.id !== out.player.id && m.player.club_id === inn.club_id).length;
      if (clubCount >= MAX_PLAYERS_PER_CLUB) continue;
      const nextBudget = round1(budget + out.sellPrice - inn.price);
      if (nextBudget < -1e-9) continue;

      budget = nextBudget;
      squad = squad.map((m) => (m.player.id === out.player.id ? { player: inn, sellPrice: inn.price } : m));
      transfers.push({ out, in: inn });
      keptHere.push({ outId: t.outId, inId: t.inId });
    }

    const used = transfers.length;
    gws.push({
      startSquad,
      endSquad: squad,
      transfers,
      freeAvailable: free,
      used,
      cost: EXTRA_TRANSFER_COST * Math.max(0, used - free),
      budgetBefore,
      budgetAfter: budget,
    });
    kept.push(keptHere);
    // Sledeće kolo: ostatak + 1 novi, najviše 5.
    free = Math.min(FREE_TRANSFERS_MAX, Math.max(0, free - used) + 1);
  }
  return { gws, plan: kept };
}
