import { findPlayer, type SquadPlayer } from "@/lib/sofascore-events";
import { mapMissingStatus, type InjuriesFile, type PlayerStatus } from "@/lib/sofascore-injuries";
import { teamNamesMatch } from "@/lib/team-names";

export type InjuryRow = {
  team: string;
  /** Ime kod SofaScore-a; null = igrač koji se vraća na "dostupan" (nema ga na novom spisku). */
  sofaName: string | null;
  playerId: string | null;
  /** Upareno tačnim imenom (true) ili samo po prezimenu (false). */
  exact: boolean;
  currentStatus: string;
  proposedStatus: PlayerStatus;
  note: string | null;
  until: string | null;
  /** Naše ime igrača za prikaz. */
  playerName: string | null;
  /**
   * Povratak predložen samo zato što je spisak kluba PRAZAN. Prazan spisak može
   * da znači „niko nije odsutan", ali i „SofaScore još nije objavio sastav" —
   * zato takav red nije unapred štikliran i admin ga potvrđuje ručno.
   */
  uncertain?: boolean;
};

export type InjuriesPreview = {
  round: number | null;
  fetchedAt: string | null;
  rows: InjuryRow[];
  squadPlayers: { id: string; name: string; club: string }[];
  warnings: string[];
};

/**
 * Poredi SofaScore spisak odsutnih sa našim igračima i predlaže izmene statusa
 * (čista funkcija — verify-povrede.ts je proverava). Ništa ne upisuje: admin
 * u pregledu potvrđuje šta se primenjuje.
 */
export function buildInjuriesPreview(
  file: InjuriesFile,
  clubList: { id: string; name: string }[],
  playerList: any[]
): InjuriesPreview {
  const warnings: string[] = [];
  const rows: InjuryRow[] = [];
  const squadPlayers: InjuriesPreview["squadPlayers"] = [];

  for (const t of file.teams) {
    const club = clubList.find((c) => teamNamesMatch(c.name, t.team));
    if (!club) {
      warnings.push(`Klub „${t.team}” nije nađen u našoj bazi — preskačem.`);
      continue;
    }
    const squad: (SquadPlayer & { raw: any })[] = playerList
      .filter((p) => p.club_id === club.id)
      .map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`.trim(), clubId: club.id, raw: p }));
    for (const p of squad) squadPlayers.push({ id: p.id, name: p.name, club: club.name });

    const handled = new Set<string>();
    for (const m of t.missing) {
      const found = findPlayer(m.name, squad);
      const raw = squad.find((s) => s.id === found?.player.id)?.raw;
      if (found) handled.add(found.player.id);
      const proposed = mapMissingStatus(m.type, m.reason, m.description);
      const sameUntil = (raw?.status_until ?? null) === m.until || (!raw?.status_until && !m.until);
      // Bez promene (isti status, napomena i datum) — nema šta da se prikaže.
      if (raw && raw.status === proposed && (raw.status_note ?? null) === (m.description ?? null) && sameUntil) continue;
      rows.push({
        team: club.name,
        sofaName: m.name,
        playerId: found?.player.id ?? null,
        exact: found?.exact ?? false,
        currentStatus: raw?.status ?? "available",
        proposedStatus: proposed,
        note: m.description,
        until: m.until,
        playerName: found?.player.name ?? null,
      });
    }

    // Označeni, a nema ih na novom spisku → vraćaju se.
    const listEmpty = t.missing.length === 0;
    let uncertainReturns = 0;
    for (const p of squad) {
      if (handled.has(p.id)) continue;
      if (p.raw.status && p.raw.status !== "available") {
        if (listEmpty) uncertainReturns++;
        rows.push({
          team: club.name,
          sofaName: null,
          playerId: p.id,
          exact: true,
          currentStatus: p.raw.status,
          proposedStatus: "available",
          note: null,
          until: null,
          playerName: p.name,
          uncertain: listEmpty,
        });
      }
    }
    if (uncertainReturns > 0) {
      warnings.push(
        `Klub „${club.name}” je u fajlu bez ijednog odsutnog igrača, a ${uncertainReturns} njegovih igrača je trenutno označeno. ` +
          `Ako SofaScore još nije objavio sastav za taj meč, spisak je samo prazan — povratak NIJE unapred štikliran, proveri ga ručno.`
      );
    }
  }

  // Star fajl = stari podaci: povratak i izmene bi se zasnivali na staroj slici stanja.
  if (file.fetchedAt) {
    const ageDays = (Date.now() - new Date(file.fetchedAt).getTime()) / 86_400_000;
    if (Number.isFinite(ageDays) && ageDays > 3) {
      warnings.push(`Fajl je skinut pre ${Math.floor(ageDays)} dana — spisak povreda je verovatno zastareo. Skini novi pre potvrde.`);
    }
  }

  return { round: file.round, fetchedAt: file.fetchedAt, rows, squadPlayers, warnings };
}
