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

// ---------------------------------------------------------------------------
// Automatski predlog po oceni (SofaScore) — „Izračunaj po oceni“ u adminu.
// ---------------------------------------------------------------------------

/** Minimum minuta da bi se ocena sa meča računala. */
export const DEFAULT_MIN_MINUTES = 60;
/** Razlika (nova prosečna ocena − osnova) od koje cena ide ±0.1. */
export const DEFAULT_RATING_T1 = 0.8;
/** Razlika od koje cena ide ±0.2 (najviše što automatika dozvoljava). */
export const DEFAULT_RATING_T2 = 1.5;
/** Najmanje mečeva (≥ min. minuta) od poslednje izmene da igrač uopšte uđe u obračun. */
export const DEFAULT_MIN_MATCHES = 1;
/** Za osnovu se koristi lična istorija samo ako ima bar toliko ranijih mečeva; inače prosek lige. */
export const MIN_PRIOR_APPEARANCES = 3;
/** Koliko ranijih mečeva ulazi u ličnu osnovu. */
export const PRIOR_WINDOW = 8;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export type RatingSuggestion = {
  delta: number;
  newPrice: number;
  recentAvg: number;
  baseline: number;
  ratingDelta: number;
  matches: number;
};

/**
 * Cena po kretanju ocene. `recent` = ocene (mečevi ≥ min. minuta) od poslednje
 * izmene cena, `prior` = ranije ocene istog igrača (najnovije prve). Osnova je
 * prosek ranijih mečeva, a ako ih je premalo — prosek lige. Pomak od +t1 daje
 * +0.1, od +t2 daje +0.2; isto u minus. Opseg 4.0–15.0 se poštuje.
 */
export function suggestPriceByRating(opts: {
  price: number;
  recent: number[];
  prior: number[];
  leagueMean: number;
  t1: number;
  t2: number;
  minMatches?: number;
  /** Najmanje ranijih mečeva za ličnu osnovu (podrazumevano MIN_PRIOR_APPEARANCES). */
  minPrior?: number;
}): RatingSuggestion | null {
  const { price, recent, prior, leagueMean, t1, t2 } = opts;
  if (recent.length === 0 || recent.length < (opts.minMatches ?? DEFAULT_MIN_MATCHES)) return null;

  const recentAvg = mean(recent);
  const hist = prior.slice(0, PRIOR_WINDOW);
  const baseline = hist.length >= (opts.minPrior ?? MIN_PRIOR_APPEARANCES) ? mean(hist) : leagueMean;
  const ratingDelta = recentAvg - baseline;

  const mag = Math.abs(ratingDelta);
  const step = mag >= t2 ? 0.2 : mag >= t1 ? 0.1 : 0;
  if (step === 0) return null;
  const delta = ratingDelta > 0 ? step : -step;

  const newPrice = round1(price + delta);
  if (newPrice < PRICE_MIN && delta < 0) return null;
  if (newPrice > PRICE_MAX && delta > 0) return null;
  return {
    delta: round1(delta),
    newPrice,
    recentAvg: Math.round(recentAvg * 100) / 100,
    baseline: Math.round(baseline * 100) / 100,
    ratingDelta: Math.round(ratingDelta * 100) / 100,
    matches: recent.length,
  };
}
