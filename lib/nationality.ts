/**
 * Nacionalnost igrača: dvoslovna oznaka države (players.nationality, migracija 021).
 * Uvozi se iz SofaScore-a (scripts/sofascore-drzave-konzola.js → Admin). Čista
 * logika, bez baze — verify-drzave.ts je proverava.
 */
import { findPlayer, type SquadPlayer } from "@/lib/sofascore-events";
import { teamNamesMatch } from "@/lib/team-names";
import { normalizeCountryCode } from "@/lib/country";

export { countryName, flagUrl, normalizeCountryCode } from "@/lib/country";

// ---------------------------------------------------------------------------
// Fajl iz konzolne skripte
// ---------------------------------------------------------------------------

export type NationalitiesFile = {
  fetchedAt: string | null;
  teams: { team: string; players: { name: string; country: string | null; countryName: string | null }[] }[];
};

/** Tolerantno: ime i država mogu biti u `player` ili direktno; država kao objekat ili kao tekst. */
export function parseNationalitiesFile(json: unknown): NationalitiesFile {
  const j = json as any;
  const teams: NationalitiesFile["teams"] = [];
  for (const t of Array.isArray(j?.teams) ? j.teams : []) {
    if (typeof t?.team !== "string" || !t.team) continue;
    const players: NationalitiesFile["teams"][number]["players"] = [];
    for (const p of Array.isArray(t?.players) ? t.players : []) {
      const src = p?.player ?? p;
      const name = src?.name;
      if (typeof name !== "string" || !name.trim()) continue;
      const c = src?.country;
      const code = normalizeCountryCode(typeof c === "string" ? c : c?.alpha2 ?? c?.code ?? src?.countryCode);
      players.push({
        name: name.trim(),
        country: code,
        countryName: typeof c?.name === "string" ? c.name : typeof src?.countryName === "string" ? src.countryName : null,
      });
    }
    teams.push({ team: t.team, players });
  }
  return { fetchedAt: typeof j?.fetchedAt === "string" ? j.fetchedAt : null, teams };
}

export type NationalityRow = {
  team: string;
  sofaName: string;
  country: string;
  countryName: string | null;
  playerId: string | null;
  /** Naše ime igrača za prikaz. */
  playerName: string | null;
  /** Upareno tačnim imenom (true) ili samo po prezimenu (false). */
  exact: boolean;
  current: string | null;
};

export type NationalitiesPreview = {
  fetchedAt: string | null;
  rows: NationalityRow[];
  /** Svi naši igrači, za ručno uparivanje kad ime nije pogođeno. */
  squadPlayers: { id: string; name: string; club: string }[];
  /** Igrači iz fajla bez države (SofaScore je ne vodi) — samo broj, za proveru formata. */
  withoutCountry: number;
  /** Naši igrači koje nijedan red iz fajla nije pokrio (ostaju bez promene). */
  unmatchedOurs: { name: string; club: string; current: string | null }[];
  /** Redovi bez izmene (već ima istu državu). */
  unchanged: number;
  warnings: string[];
};

/**
 * Poredi spisak igrača iz SofaScore-a sa našima. Predlaže SAMO ono što se menja
 * (nova ili drugačija država); ništa ne upisuje — admin potvrđuje.
 */
export function buildNationalitiesPreview(
  file: NationalitiesFile,
  clubList: { id: string; name: string }[],
  playerList: { id: string; first_name: string; last_name: string; club_id: string; nationality?: string | null }[]
): NationalitiesPreview {
  const warnings: string[] = [];
  const rows: NationalityRow[] = [];
  const squadPlayers: NationalitiesPreview["squadPlayers"] = [];
  const unmatchedOurs: NationalitiesPreview["unmatchedOurs"] = [];
  let withoutCountry = 0;
  let unchanged = 0;

  for (const t of file.teams) {
    const club = clubList.find((c) => teamNamesMatch(c.name, t.team));
    if (!club) {
      warnings.push(`Klub „${t.team}” nije nađen u našoj bazi — preskačem.`);
      continue;
    }
    const squad = playerList
      .filter((p) => p.club_id === club.id)
      .map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`.trim(), clubId: club.id, raw: p }));
    for (const p of squad) squadPlayers.push({ id: p.id, name: p.name, club: club.name });

    const handled = new Set<string>();
    for (const sp of t.players) {
      if (!sp.country) {
        withoutCountry++;
        continue;
      }
      const found = findPlayer(sp.name, squad as (SquadPlayer & { raw: unknown })[]);
      const id = found?.player.id ?? null;
      const raw = squad.find((s) => s.id === id)?.raw;
      if (id) handled.add(id);
      if (raw && (raw.nationality ?? null) === sp.country) {
        unchanged++;
        continue;
      }
      rows.push({
        team: club.name,
        sofaName: sp.name,
        country: sp.country,
        countryName: sp.countryName,
        playerId: id,
        playerName: found?.player.name ?? null,
        exact: found?.exact ?? false,
        current: raw?.nationality ?? null,
      });
    }
    for (const p of squad) {
      if (!handled.has(p.id)) unmatchedOurs.push({ name: p.name, club: club.name, current: p.raw.nationality ?? null });
    }
  }

  if (file.teams.length > 0 && file.teams.every((t) => t.players.every((p) => !p.country))) {
    warnings.push("Nijedan igrač u fajlu nema državu — skripta ili SofaScore odgovor nije u očekivanom obliku.");
  }
  return { fetchedAt: file.fetchedAt, rows, squadPlayers, withoutCountry, unmatchedOurs, unchanged, warnings };
}
