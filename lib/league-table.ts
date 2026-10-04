/**
 * Tabela grčke Super lige — računa se iz odigranih mečeva (fixtures sa
 * status "finished" i upisanim rezultatom), ne čuva se posebno. Tako uvek
 * prati ono što je admin/uvoz upisao i ne može da se razmimoiđe sa rezultatima.
 *
 * Bodovanje: pobeda 3, nerešeno 1, poraz 0. Redosled: bodovi, gol-razlika,
 * postignuti golovi, pa ime kluba. (Pravi poredak Super lige ima i međusobni
 * skor; ovde ga namerno nema da tabela ostane jednostavna i predvidljiva.)
 */
export type TableClub = { id: string; name: string; short_name: string; primary_color: string };
export type TableFixture = {
  home_club_id: string;
  away_club_id: string;
  home_score: number | null;
  away_score: number | null;
  kickoff_at: string;
};

export type FormResult = "W" | "D" | "L";

export type TableRow = {
  clubId: string;
  name: string;
  short: string;
  color: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  form: FormResult[]; // poslednjih 5, najnoviji poslednji
  rank: number;
};

export function computeLeagueTable(clubs: TableClub[], fixtures: TableFixture[]): TableRow[] {
  const rows = new Map<string, Omit<TableRow, "rank" | "form"> & { results: { at: string; r: FormResult }[] }>();
  for (const c of clubs) {
    rows.set(c.id, {
      clubId: c.id, name: c.name, short: c.short_name, color: c.primary_color,
      played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0,
      results: [],
    });
  }

  const apply = (id: string, gf: number, ga: number, at: string) => {
    const row = rows.get(id);
    if (!row) return;
    row.played += 1;
    row.goalsFor += gf;
    row.goalsAgainst += ga;
    if (gf > ga) { row.won += 1; row.points += 3; row.results.push({ at, r: "W" }); }
    else if (gf === ga) { row.drawn += 1; row.points += 1; row.results.push({ at, r: "D" }); }
    else { row.lost += 1; row.results.push({ at, r: "L" }); }
  };

  for (const f of fixtures) {
    if (f.home_score == null || f.away_score == null) continue;
    apply(f.home_club_id, f.home_score, f.away_score, f.kickoff_at);
    apply(f.away_club_id, f.away_score, f.home_score, f.kickoff_at);
  }

  const list = [...rows.values()].map((r) => ({
    ...r,
    goalDiff: r.goalsFor - r.goalsAgainst,
    form: r.results.sort((a, b) => a.at.localeCompare(b.at)).slice(-5).map((x) => x.r),
  }));
  list.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDiff - a.goalDiff ||
      b.goalsFor - a.goalsFor ||
      a.name.localeCompare(b.name)
  );
  return list.map(({ results: _results, ...r }, i) => ({ ...r, rank: i + 1 }));
}
