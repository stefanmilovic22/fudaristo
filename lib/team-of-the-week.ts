import { POSITIONS, STARTING_XI_BOUNDS, type Position } from "./fantasy-rules";

export type TeamOfWeekCandidate = {
  playerId: string;
  position: Position;
  points: number;
};

/**
 * "Tim kola" — po uzoru na FPL: najbolji sastav (formacija) od SVIH igrača
 * lige za jedno kolo, po fantasy poenima, ne sastav nijednog konkretnog
 * korisnika. Isti greedy princip kao autoPickSquad u fantasy-rules.ts
 * (minimum po poziciji, pa najbolji preostali do 11) — samo bez cene/budžeta,
 * jer ovde nema transfer-window ograničenja, samo maksimizacija poena u
 * granicama formacije (STARTING_XI_BOUNDS).
 *
 * Vraća ID-jeve 11 izabranih igrača. Pozivalac dodaje ime/klub/poene za
 * prikaz — ova funkcija samo bira KO ulazi.
 */
export function selectTeamOfTheWeek(candidates: TeamOfWeekCandidate[]): Set<string> {
  const byPosition = new Map<Position, TeamOfWeekCandidate[]>();
  for (const pos of POSITIONS) byPosition.set(pos, []);
  for (const c of candidates) byPosition.get(c.position)?.push(c);
  for (const list of byPosition.values()) list.sort((a, b) => b.points - a.points);

  const selected = new Set<string>();

  // Minimum po poziciji prvo (1 GK, donji limiti DEF/MID/FWD) — garantuje
  // validnu formaciju bez obzira na to kako ispadne popuna ostatka.
  for (const pos of POSITIONS) {
    const [min] = STARTING_XI_BOUNDS[pos];
    byPosition.get(pos)!.slice(0, min).forEach((c) => selected.add(c.playerId));
  }

  // Preostala mesta (do 11 ukupno) najboljima po poenima iz CELE lige,
  // poštujući gornji limit po poziciji.
  const remaining: TeamOfWeekCandidate[] = [];
  for (const pos of POSITIONS) {
    const [, max] = STARTING_XI_BOUNDS[pos];
    const list = byPosition.get(pos)!;
    const alreadyTaken = list.filter((c) => selected.has(c.playerId)).length;
    remaining.push(...list.slice(alreadyTaken, max));
  }
  remaining.sort((a, b) => b.points - a.points);

  let slotsLeft = 11 - selected.size;
  for (const c of remaining) {
    if (slotsLeft <= 0) break;
    if (selected.has(c.playerId)) continue;
    selected.add(c.playerId);
    slotsLeft--;
  }

  return selected;
}
