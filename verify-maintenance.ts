/**
 * Provere za lib/maintenance.ts — poslovi koje dele CLI skripte i admin panel.
 * Pokretanje: npm run verify-maintenance
 *
 * `fetch` je zamenjen lažnim, jer testovi ne smeju da zovu TheSportsDB (ni da
 * zavise od toga da li je gore i šta trenutno vraća).
 */

import { backfillFixtureIds, refreshResults } from "./lib/maintenance";

let pass = 0;
let fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else {
    fail++;
    console.log(`FAIL ${label}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`);
  }
}
function ok(label: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL ${label}`);
  }
}

// --- lažni Supabase ---------------------------------------------------------
type Row = Record<string, any>;
type DB = Record<string, Row[]>;

function makeMock(db: DB) {
  class QB {
    op: "select" | "update" = "select";
    values: any = null;
    filters: { c: string; v: any; kind: "eq" | "in" | "lte" | "isNull" }[] = [];
    mode: "many" | "one" = "many";
    constructor(public table: string) {}
    select() { return this; }
    update(v: any) { this.op = "update"; this.values = v; return this; }
    eq(c: string, v: any) { this.filters.push({ c, v, kind: "eq" }); return this; }
    in(c: string, v: any[]) { this.filters.push({ c, v, kind: "in" }); return this; }
    lte(c: string, v: any) { this.filters.push({ c, v, kind: "lte" }); return this; }
    is(c: string, _v: null) { this.filters.push({ c, v: null, kind: "isNull" }); return this; }
    order() { return this; }
    maybeSingle() { this.mode = "one"; return this; }
    single() { this.mode = "one"; return this; }
    match() {
      return (db[this.table] ?? []).filter((r) =>
        this.filters.every((f) => {
          if (f.kind === "eq") return r[f.c] === f.v;
          if (f.kind === "in") return (f.v as any[]).includes(r[f.c]);
          if (f.kind === "lte") return r[f.c] <= f.v;
          return r[f.c] == null;
        })
      );
    }
    run() {
      const hits = this.match();
      if (this.op === "update") {
        for (const h of hits) Object.assign(h, this.values);
        return { data: null, error: null };
      }
      return { data: this.mode === "one" ? (hits[0] ?? null) : hits, error: null };
    }
    then(res: (v: any) => void) { res(this.run()); }
  }
  return { from: (t: string) => new QB(t) } as any;
}

// --- lažni fetch ------------------------------------------------------------
function stubFetch(routes: Record<string, unknown>) {
  (globalThis as any).fetch = async (url: string) => {
    for (const [needle, body] of Object.entries(routes)) {
      if (url.includes(needle)) return { ok: true, status: 200, json: async () => body };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

const CLUBS = [
  { id: "club-pao", name: "Panathinaikos" },
  { id: "club-oly", name: "Olympiacos" },
  { id: "club-irk", name: "Iraklis" },
];

function seasonEvents() {
  return {
    events: [
      { idEvent: "1001", strHomeTeam: "Panathinaikos", strAwayTeam: "Olympiacos", strTimestamp: "2026-09-01T18:00:00", dateEvent: "2026-09-01" },
      { idEvent: "1002", strHomeTeam: "Olympiacos", strAwayTeam: "Panathinaikos", strTimestamp: "2027-02-01T18:00:00", dateEvent: "2027-02-01" },
      // Alias iz lib/thesportsdb.ts: "Iraklis 1908" -> "Iraklis"
      { idEvent: "1003", strHomeTeam: "Iraklis 1908", strAwayTeam: "Olympiacos", strTimestamp: "2026-09-08T18:00:00", dateEvent: "2026-09-08" },
      // Klub koji ne postoji u bazi — mora da završi u upozorenjima
      { idEvent: "1004", strHomeTeam: "Nepoznati FK", strAwayTeam: "Olympiacos", strTimestamp: "2026-09-15T18:00:00", dateEvent: "2026-09-15" },
    ],
  };
}

async function main() {
  // === 1) Backfill: probni prolaz ne sme ništa da upiše =====================
  {
    // Ide po kolu (eventsround.php), ne po sezoni (eventsseason.php je
    // ograničen na 15 događaja i ne bi video kasnija kola — videti napomenu
    // u lib/maintenance.ts).
    stubFetch({ eventsround: seasonEvents() });
    const db: DB = {
      clubs: CLUBS,
      fixtures: [
        { id: "fx-1", home_club_id: "club-pao", away_club_id: "club-oly", kickoff_at: "2026-09-01T18:00:00Z", api_thesportsdb_id: null, gameweeks: { number: 1 } },
        { id: "fx-2", home_club_id: "club-irk", away_club_id: "club-oly", kickoff_at: "2026-09-08T18:00:00Z", api_thesportsdb_id: null, gameweeks: { number: 1 } },
        { id: "fx-3", home_club_id: "club-oly", away_club_id: "club-pao", kickoff_at: "2027-02-01T18:00:00Z", api_thesportsdb_id: "9999", gameweeks: { number: 20 } },
      ],
    };
    const res = await backfillFixtureIds(makeMock(db), { apply: false });
    eq("probni prolaz ne upisuje", db.fixtures.map((f) => f.api_thesportsdb_id), [null, null, "9999"]);
    eq("probni prolaz broji šta bi uparilo", res.remaining, 2);
    ok("probni prolaz prijavlja neuparen klub", res.warnings.some((w) => w.includes("Nepoznati FK")));
  }

  // === 2) Backfill: --apply upisuje, i to preko ALIASA ======================
  {
    stubFetch({ eventsround: seasonEvents() });
    const db: DB = {
      clubs: CLUBS,
      fixtures: [
        { id: "fx-1", home_club_id: "club-pao", away_club_id: "club-oly", kickoff_at: "2026-09-01T18:00:00Z", api_thesportsdb_id: null, gameweeks: { number: 1 } },
        { id: "fx-2", home_club_id: "club-irk", away_club_id: "club-oly", kickoff_at: "2026-09-08T18:00:00Z", api_thesportsdb_id: null, gameweeks: { number: 2 } },
      ],
    };
    const res = await backfillFixtureIds(makeMock(db), { apply: true });
    eq("upisani ID-jevi", db.fixtures.map((f) => f.api_thesportsdb_id), ["1001", "1003"]);
    eq("ništa nije ostalo", res.remaining, 0);
    ok("rezultat je ok", res.ok);
  }

  // === 3) Backfill: povratni meč se NE meša sa prvim =======================
  {
    // Isti par klubova u oba smera — mora da uzme onaj sa ispravnim domaćinom,
    // ne "najbliži datum".
    stubFetch({ eventsround: seasonEvents() });
    const db: DB = {
      clubs: CLUBS,
      fixtures: [
        { id: "fx-back", home_club_id: "club-oly", away_club_id: "club-pao", kickoff_at: "2027-02-01T18:00:00Z", api_thesportsdb_id: null, gameweeks: { number: 20 } },
      ],
    };
    await backfillFixtureIds(makeMock(db), { apply: true });
    eq("povratni meč dobija svoj ID", db.fixtures[0].api_thesportsdb_id, "1002");
  }

  // === 4) Backfill: nema šta da se radi ====================================
  {
    stubFetch({ eventsround: seasonEvents() });
    const db: DB = { clubs: CLUBS, fixtures: [{ id: "fx-1", home_club_id: "club-pao", away_club_id: "club-oly", kickoff_at: "x", api_thesportsdb_id: "1001", gameweeks: { number: 1 } }] };
    const res = await backfillFixtureIds(makeMock(db), { apply: true });
    ok("prazan posao se prijavi jasno", res.summary.includes("nema šta"));
  }

  // === 4b) Backfill: kolo bez ijednog nedostajućeg ID-ja se ne pita API-ju ===
  // (regresija za bag koji je prijavljen: kolo 5 se nikad nije backfill-ovalo
  // jer je stari kod tražio SVE mečeve sezone jednim pozivom na
  // eventsseason.php, koji besplatan tier seče na 15 događaja — otprilike 2
  // kola od 14 klubova. Kolo 5 se u tom odgovoru nikad ne bi pojavilo.)
  {
    stubFetch({ eventsround: seasonEvents() });
    const db: DB = {
      clubs: CLUBS,
      fixtures: [
        { id: "fx-1", home_club_id: "club-pao", away_club_id: "club-oly", kickoff_at: "2026-09-01T18:00:00Z", api_thesportsdb_id: "1001", gameweeks: { number: 1 } },
        { id: "fx-2", home_club_id: "club-irk", away_club_id: "club-oly", kickoff_at: "2026-09-08T18:00:00Z", api_thesportsdb_id: null, gameweeks: { number: 5 } },
      ],
    };
    const res = await backfillFixtureIds(makeMock(db), { apply: true });
    eq("kolo 5 se upari iako je iza kola 1", db.fixtures[1].api_thesportsdb_id, "1003");
    ok("proverena su samo kola sa nedostajućim ID-jem", res.lines.some((l) => l.includes("Kola koja treba proveriti: 5")));
  }

  // === 5) refreshResults: porcije i "ostalo još" ============================
  {
    stubFetch({
      lookupevent: { events: [{ strHomeTeam: "A", strAwayTeam: "B", strStatus: "FT", intHomeScore: "2", intAwayScore: "1", strPostponed: "no" }] },
    });
    const past = "2026-01-01T00:00:00.000Z";
    const db: DB = {
      fixtures: Array.from({ length: 5 }, (_, i) => ({
        id: `fx-${i}`, api_thesportsdb_id: `${2000 + i}`, kickoff_at: past, status: "scheduled",
        home_score: null, away_score: null,
      })),
    };
    const res = await refreshResults(makeMock(db), { limit: 2, delayMs: 0 });
    eq("obrađena samo porcija", db.fixtures.map((f) => f.status), ["finished", "finished", "scheduled", "scheduled", "scheduled"]);
    eq("ostalo prijavljeno", res.remaining, 3);
    ok("poruka poziva na ponovno pokretanje", res.summary.includes("pokreni ponovo"));
    eq("rezultat upisan", [db.fixtures[0].home_score, db.fixtures[0].away_score], [2, 1]);
  }

  // === 6) refreshResults: FT bez rezultata NE sme da završi meč =============
  {
    stubFetch({
      lookupevent: { events: [{ strHomeTeam: "A", strAwayTeam: "B", strStatus: "FT", intHomeScore: null, intAwayScore: null, strPostponed: "no" }] },
    });
    const db: DB = {
      fixtures: [{ id: "fx-1", api_thesportsdb_id: "3001", kickoff_at: "2026-01-01T00:00:00.000Z", status: "scheduled", home_score: null, away_score: null }],
    };
    const res = await refreshResults(makeMock(db), { delayMs: 0 });
    eq("ostaje live umesto lažnog 0:0", db.fixtures[0].status, "live");
    ok("slučaj je prijavljen", res.warnings.some((w) => w.includes("rezultat nedostaje")));
  }

  // === 7) refreshResults: meč bez ID-ja se prijavi, ne preskoči tiho ========
  {
    stubFetch({ lookupevent: { events: [] } });
    const db: DB = {
      fixtures: [{ id: "fx-1", api_thesportsdb_id: null, kickoff_at: "2026-01-01T00:00:00.000Z", status: "scheduled" }],
    };
    const res = await refreshResults(makeMock(db), { delayMs: 0 });
    ok("upozorenje o nedostajućem ID-ju", res.warnings.some((w) => w.includes("backfill")));
    eq("nema šta da se osveži", res.remaining, 0);
  }

  console.log(`\n${pass} prošlo, ${fail} palo`);
  if (fail > 0) process.exit(1);
}

main();
