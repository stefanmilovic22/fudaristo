/**
 * Pravila predloga cena (admin „Cene igrača“). Čista logika, bez baze — da se
 * može proveriti bez Supabase-a (verify-cene.ts).
 *
 * Predlog nikad ne gura cenu van [PRICE_MIN, PRICE_MAX]: igrač koji je već na
 * dnu ne pojeftinjuje dalje, a onaj na vrhu ne poskupljuje. Ručni unos admina je
 * slobodniji (baza dozvoljava 1.0–20.0).
 */
export const PRICE_MIN = 4.0;
export const PRICE_MAX = 15.0;
export const DEFAULT_THRESHOLD = 5;
export const DEFAULT_STEP = 0.1;

const round1 = (n: number) => Math.round(n * 10) / 10;

export type PriceSuggestion = { delta: number; newPrice: number } | null;

/** Neto transferi ≥ prag → poskupljenje, ≤ −prag → pojeftinjenje, inače bez promene. */
export function suggestPrice(price: number, net: number, threshold: number, step: number): PriceSuggestion {
  let delta = 0;
  if (net >= threshold) delta = step;
  else if (net <= -threshold) delta = -step;
  if (delta === 0) return null;

  const newPrice = round1(price + delta);
  if (newPrice < PRICE_MIN && delta < 0) return null;
  if (newPrice > PRICE_MAX && delta > 0) return null;
  return { delta: round1(delta), newPrice };
}

/** Broji ulaske i izlaske po igraču iz niza transfera. */
export function countTransfers(rows: { player_in_id: string; player_out_id: string }[]) {
  const ins = new Map<string, number>();
  const outs = new Map<string, number>();
  for (const r of rows) {
    ins.set(r.player_in_id, (ins.get(r.player_in_id) ?? 0) + 1);
    outs.set(r.player_out_id, (outs.get(r.player_out_id) ?? 0) + 1);
  }
  return { ins, outs };
}
