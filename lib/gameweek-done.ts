/**
 * Koji mečevi još drže kolo otvorenim.
 *
 * Status meča dolazi iz spoljnog izvora i zna da pogreši: odložen meč se
 * vrati na "live"/"scheduled" pri sledećoj sinhronizaciji, pa jedan takav meč
 * može da blokira obračun celog kola. Zato se status dopunjava vremenom
 * početka.
 *
 * PRAVILO: meč koji je "zakazan" ili "uživo" a posle čijeg početka je prošlo
 * bar SLOT_GAP_MS pa je neki DRUGI meč istog kola, koji je počeo tek posle
 * njega, već ZAVRŠEN — taj termin je očigledno prošao, a meč nikad nije
 * odigran. Smatra se odloženim i ne blokira kolo. (Kolo je gotovo kad je
 * završena poslednja utakmica u rasporedu.)
 *
 * Odloženi i otkazani mečevi ne blokiraju nikad.
 */
export const SLOT_GAP_MS = 3 * 60 * 60 * 1000;

type FixtureLike = { status: string; kickoff_at?: string | null };

function kickoffMs(f: FixtureLike): number {
  return f.kickoff_at ? new Date(f.kickoff_at).getTime() : Number.NaN;
}

/** Mečevi kola koji još nisu odigrani, odloženi ni otkazani. */
export function openFixtures<T extends FixtureLike>(fixtures: T[]): T[] {
  const lastFinished = fixtures
    .filter((f) => f.status === "finished")
    .map(kickoffMs)
    .filter((k) => Number.isFinite(k))
    .reduce((max, k) => Math.max(max, k), Number.NEGATIVE_INFINITY);

  return fixtures.filter((f) => {
    if (f.status !== "scheduled" && f.status !== "live") return false;
    const k = kickoffMs(f);
    // Termin je prošao: neki kasniji meč je već završen.
    if (Number.isFinite(k) && lastFinished >= k + SLOT_GAP_MS) return false;
    return true;
  });
}

/**
 * Mečevi koje treba tretirati kao odložene iako im status kaže drugačije
 * (scheduled/live), po pravilu iznad.
 */
export function staleFixtures<T extends FixtureLike>(fixtures: T[]): T[] {
  const open = new Set(openFixtures(fixtures));
  return fixtures.filter((f) => (f.status === "scheduled" || f.status === "live") && !open.has(f));
}
