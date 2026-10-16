/**
 * Povrede / suspenzije iz SofaScore-a. Spisak odsutnih igrača dolazi uz sastave
 * mečeva koji tek slede (lineups → home/away → missingPlayers); skripta
 * scripts/sofascore-povrede-konzola.js ga skuplja u jedan fajl.
 *
 * Stvarni oblik jednog zapisa (proveren na pravom odgovoru):
 *   { player: { name, ... }, type: "missing" | "doubtful", reason: 1,
 *     description: "Knock Injury", expectedEndDate: "2026-10-24T00:00:00+00:00" }
 */

export type PlayerStatus = "available" | "injured" | "suspended" | "doubtful" | "unavailable";

export type MissingEntry = {
  name: string;
  type: string;
  reason: number | null;
  description: string | null;
  /** ISO datum ili null. */
  until: string | null;
};

export type InjuriesFile = {
  round: number | null;
  fetchedAt: string | null;
  teams: { team: string; missing: MissingEntry[] }[];
};

/**
 * Status za naš sistem. "doubtful" je izričit tip kod SofaScore-a; kod "missing"
 * opis odlučuje: suspenzije/kartoni → suspended, povrede → injured, ostalo
 * (lični razlozi, reprezentacija...) → unavailable. Opis se čuva kao napomena,
 * pa admin u pregledu može da promeni predlog.
 */
export function mapMissingStatus(type: string, reason: number | null, description: string | null): PlayerStatus {
  if (type === "doubtful") return "doubtful";
  const d = (description ?? "").toLowerCase();
  if (/susp|card|ban|disciplin/.test(d)) return "suspended";
  if (reason === 1 || /injur|knock|strain|sprain|fractur|surgery|tear|ligament|muscle|ill|concuss|fitness/.test(d)) {
    return "injured";
  }
  return "unavailable";
}

export function parseInjuriesFile(json: unknown): InjuriesFile {
  const j = json as any;
  const teams: InjuriesFile["teams"] = [];
  for (const t of Array.isArray(j?.teams) ? j.teams : []) {
    const missing: MissingEntry[] = [];
    for (const m of Array.isArray(t?.missing) ? t.missing : []) {
      const name = m?.player?.name ?? m?.name;
      if (typeof name !== "string" || !name) continue;
      const until = typeof m?.expectedEndDate === "string" ? m.expectedEndDate : typeof m?.until === "string" ? m.until : null;
      missing.push({
        name,
        type: String(m?.type ?? ""),
        reason: typeof m?.reason === "number" ? m.reason : null,
        description: typeof m?.description === "string" ? m.description : null,
        until: until && !Number.isNaN(new Date(until).getTime()) ? new Date(until).toISOString() : null,
      });
    }
    if (typeof t?.team === "string" && t.team) teams.push({ team: t.team, missing });
  }
  return {
    round: typeof j?.round === "number" ? j.round : null,
    fetchedAt: typeof j?.fetchedAt === "string" ? j.fetchedAt : null,
    teams,
  };
}
