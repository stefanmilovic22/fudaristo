/**
 * Privremen verifikacioni skript za Fazu 6 (nije deo isporuke — isti obrazac
 * kao mock testovi iz Faze 5). Pokretanje: npx tsx verify-faza6.ts
 */
import {
  calculateRowFantasyPoints,
  resolveEffectiveStartingXI,
  resolveCaptainMultiplier,
  runScoringForGameweek,
  type SquadPlayerForScoring,
} from "./lib/scoring";

let pass = 0;
let fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else {
    fail++;
    console.log(`FAIL ${label}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`);
  }
}
async function throwsWith(label: string, fn: () => Promise<unknown>, contains: string) {
  try {
    await fn();
    fail++;
    console.log(`FAIL ${label}: nije bacio grešku`);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes(contains)) pass++;
    else {
      fail++;
      console.log(`FAIL ${label}: poruka "${m}" ne sadrži "${contains}"`);
    }
  }
}

// ============================================================================
// 1) Bodovna tabela
// ============================================================================
const base = {
  minutes_played: 0, goals: 0, assists: 0, clean_sheet: false, goals_conceded: 0,
  saves: 0, penalties_saved: 0, penalties_missed: 0, yellow_cards: 0,
  red_cards: 0, own_goals: 0, bonus_points: 0,
};

eq("GK 90min CS 4 odbrane", calculateRowFantasyPoints({ ...base, position: "GK", minutes_played: 90, clean_sheet: true, saves: 4 }), 2 + 4 + 1);
eq("GK odbranjen penal + 3 primljena", calculateRowFantasyPoints({ ...base, position: "GK", minutes_played: 90, penalties_saved: 1, goals_conceded: 3 }), 2 + 5 - 1);
eq("DEF 3 primljena gola", calculateRowFantasyPoints({ ...base, position: "DEF", minutes_played: 90, goals_conceded: 3 }), 2 - 1);
eq("MID gol+asist+CS", calculateRowFantasyPoints({ ...base, position: "MID", minutes_played: 90, goals: 1, assists: 1, clean_sheet: true }), 2 + 5 + 3 + 1);
eq("FWD 2 gola, CS bez efekta", calculateRowFantasyPoints({ ...base, position: "FWD", minutes_played: 90, goals: 2, clean_sheet: true }), 2 + 8);
eq("59 min = 1", calculateRowFantasyPoints({ ...base, position: "MID", minutes_played: 59 }), 1);
eq("60 min = 2 (isključivo)", calculateRowFantasyPoints({ ...base, position: "MID", minutes_played: 60 }), 2);
eq("crveni+autogol+promašen penal", calculateRowFantasyPoints({ ...base, position: "FWD", minutes_played: 90, red_cards: 1, own_goals: 1, penalties_missed: 1 }), 2 - 3 - 2 - 2);
eq("MID ne gubi na primljenim golovima", calculateRowFantasyPoints({ ...base, position: "MID", minutes_played: 90, goals_conceded: 4 }), 2);
eq("FWD odbrane se ne broje", calculateRowFantasyPoints({ ...base, position: "FWD", minutes_played: 90, saves: 9 }), 2);
eq("bonus se sabira", calculateRowFantasyPoints({ ...base, position: "MID", minutes_played: 90, bonus_points: 3 }), 5);

// ============================================================================
// 2) Auto-sub
// ============================================================================
let n = 0;
function p(pos: SquadPlayerForScoring["position"], starting: boolean, minutes: number, order = ++n, extra: Partial<SquadPlayerForScoring> = {}): SquadPlayerForScoring {
  return {
    playerId: `p${order}-${pos}`, position: pos, isStarting: starting, squadOrder: order,
    isCaptain: false, isViceCaptain: false, clubId: "c1",
    minutesPlayed: minutes, fantasyPoints: minutes > 0 ? 2 : 0, ...extra,
  };
}
function squad442(o: { starterDefMin: number; benchDef: number; benchFwd: number; benchGk: number; starterGkMin?: number }) {
  n = 0;
  return [
    p("GK", true, o.starterGkMin ?? 90),
    p("DEF", true, o.starterDefMin), p("DEF", true, 90), p("DEF", true, 90), p("DEF", true, 90),
    p("MID", true, 90), p("MID", true, 90), p("MID", true, 90), p("MID", true, 90),
    p("FWD", true, 90), p("FWD", true, 90),
    p("GK", false, o.benchGk, 12), p("DEF", false, o.benchDef, 13),
    p("FWD", false, o.benchFwd, 14), p("MID", false, 90, 15),
  ];
}

{
  const r = resolveEffectiveStartingXI(squad442({ starterDefMin: 0, benchDef: 90, benchFwd: 90, benchGk: 90 }));
  eq("auto-sub DEF za DEF", [r.effectiveIds.size, [...r.autoSubbedInIds]], [11, ["p13-DEF"]]);
}
{
  const r = resolveEffectiveStartingXI(squad442({ starterDefMin: 90, benchDef: 90, benchFwd: 90, benchGk: 90, starterGkMin: 0 }));
  eq("auto-sub GK za GK", [r.effectiveIds.has("p12-GK"), r.effectiveIds.has("p1-GK")], [true, false]);
}
{
  const r = resolveEffectiveStartingXI(squad442({ starterDefMin: 90, benchDef: 90, benchFwd: 90, benchGk: 0, starterGkMin: 0 }));
  eq("GK bez zamene ostaje u postavi", [r.effectiveIds.size, r.autoSubbedInIds.size], [11, 0]);
}
{
  n = 0;
  const s = [
    p("GK", true, 90),
    p("DEF", true, 0), p("DEF", true, 90), p("DEF", true, 90), p("DEF", true, 90),
    p("MID", true, 90), p("MID", true, 90), p("MID", true, 90), p("MID", true, 90),
    p("FWD", true, 90), p("FWD", true, 90),
    p("GK", false, 0, 12), p("FWD", false, 90, 13), p("DEF", false, 0, 14), p("MID", false, 0, 15),
  ];
  eq("4-4-2 → 3-4-3 zamena prolazi", [...resolveEffectiveStartingXI(s).autoSubbedInIds], ["p13-FWD"]);
}
{
  n = 0;
  const s = [
    p("GK", true, 90),
    p("DEF", true, 0), p("DEF", true, 90), p("DEF", true, 90),
    p("MID", true, 90), p("MID", true, 90), p("MID", true, 90), p("MID", true, 90),
    p("FWD", true, 90), p("FWD", true, 90), p("FWD", true, 90),
    p("GK", false, 0, 12), p("FWD", false, 90, 13), p("DEF", false, 0, 14), p("MID", false, 0, 15),
  ];
  eq("2-4-4 bi bio nevalidan → zamena odbijena", resolveEffectiveStartingXI(s).autoSubbedInIds.size, 0);
}
{
  n = 0;
  const s = [
    p("GK", true, 90),
    p("DEF", true, 0), p("DEF", true, 90), p("DEF", true, 90), p("DEF", true, 90),
    p("MID", true, 0), p("MID", true, 90), p("MID", true, 90), p("MID", true, 90),
    p("FWD", true, 90), p("FWD", true, 90),
    p("GK", false, 0, 12), p("DEF", false, 90, 13), p("MID", false, 90, 14), p("FWD", false, 0, 15),
  ];
  eq("dve zamene odjednom", [...resolveEffectiveStartingXI(s).autoSubbedInIds].sort(), ["p13-DEF", "p14-MID"]);
}

// ============================================================================
// 3) Kapiten
// ============================================================================
{
  n = 0;
  const s = [p("MID", true, 90, 1, { isCaptain: true }), p("FWD", true, 90, 2, { isViceCaptain: true })];
  const ids = new Set(s.map((x) => x.playerId));
  eq("kapiten 2x", resolveCaptainMultiplier(s, null, ids).multiplier, 2);
  eq("triple captain 3x", resolveCaptainMultiplier(s, "triple_captain", ids).multiplier, 3);
}
{
  n = 0;
  const s = [p("MID", true, 0, 1, { isCaptain: true }), p("FWD", true, 90, 2, { isViceCaptain: true })];
  const r = resolveCaptainMultiplier(s, null, new Set(["p2-FWD"]));
  eq("fallback na vicea", [r.captainId, r.multiplier], ["p2-FWD", 2]);
}
{
  n = 0;
  const s = [p("MID", true, 0, 1, { isCaptain: true }), p("FWD", true, 0, 2, { isViceCaptain: true })];
  eq("niko ne nosi množilac", resolveCaptainMultiplier(s, null, new Set()).multiplier, 1);
}
{
  // POPRAVKA: kapiten je odigrao ali je ostao na klupi (nije auto-subbed in) —
  // traka mora da padne na vicea, ne da se izgubi.
  n = 0;
  const s = [
    p("GK", true, 90),
    p("DEF", true, 90), p("DEF", true, 90), p("DEF", true, 90), p("DEF", true, 90),
    p("MID", true, 90), p("MID", true, 90), p("MID", true, 90), p("MID", true, 90, 9, { isViceCaptain: true }),
    p("FWD", true, 90), p("FWD", true, 90),
    p("GK", false, 0, 12), p("DEF", false, 90, 13, { isCaptain: true }),
    p("MID", false, 0, 14), p("FWD", false, 0, 15),
  ];
  const { effectiveIds } = resolveEffectiveStartingXI(s);
  const r = resolveCaptainMultiplier(s, null, effectiveIds);
  eq("kapiten sa klupe → traka ide viceu", [r.captainId, r.multiplier], ["p9-MID", 2]);
}

// ============================================================================
// 4) Mock Supabase klijent (in-memory, podržava rpc + range straničenje)
// ============================================================================
type Row = Record<string, any>;
type DB = Record<string, Row[]>;

function makeMock(db: DB) {
  const calls = { total: 0 };

  function embed(cols: string, row: Row): Row {
    const out = { ...row };
    if (/\bplayers\(/.test(cols) && row.player_id) {
      const pl = (db.players ?? []).find((x) => x.id === row.player_id);
      out.players = pl ? { position: pl.position, club_id: pl.club_id } : null;
    }
    return out;
  }

  class QB {
    op: "select" | "insert" | "update" = "select";
    cols = "*";
    values: any = null;
    filters: { c: string; v: any; kind: "eq" | "in" }[] = [];
    rangeFT: [number, number] | null = null;
    mode: "many" | "single" | "maybe" = "many";
    constructor(public table: string) {}
    select(cols = "*") { if (this.op === "select") this.cols = cols; return this; }
    insert(v: any) { this.op = "insert"; this.values = v; return this; }
    update(v: any) { this.op = "update"; this.values = v; return this; }
    eq(c: string, v: any) { this.filters.push({ c, v, kind: "eq" }); return this; }
    in(c: string, v: any[]) { this.filters.push({ c, v, kind: "in" }); return this; }
    order() { return this; }
    limit() { return this; }
    range(f: number, t: number) { this.rangeFT = [f, t]; return this; }
    single() { this.mode = "single"; return this; }
    maybeSingle() { this.mode = "maybe"; return this; }
    match(rows: Row[]) {
      return rows.filter((r) =>
        this.filters.every((f) => (f.kind === "eq" ? r[f.c] === f.v : (f.v as any[]).includes(r[f.c])))
      );
    }
    run() {
      calls.total++;
      db[this.table] ??= [];
      const table = db[this.table];
      if (this.op === "insert") {
        const list = Array.isArray(this.values) ? this.values : [this.values];
        const added = list.map((v: Row) => ({ id: `gen-${Math.random().toString(36).slice(2)}`, ...v }));
        table.push(...added);
        return { data: this.mode === "many" ? added : added[0], error: null };
      }
      if (this.op === "update") {
        for (const h of this.match(table)) Object.assign(h, this.values);
        return { data: null, error: null };
      }
      let rows = this.match(table).map((r) => embed(this.cols, r));
      if (this.rangeFT) rows = rows.slice(this.rangeFT[0], this.rangeFT[1] + 1);
      if (this.mode !== "many") return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }
    then(res: (v: any) => void) { res(this.run()); }
  }

  const rpcs: Record<string, (a: any) => number> = {
    score_write_stat_points: ({ p_rows }) => {
      for (const r of p_rows) {
        const row = db.player_gameweek_stats.find((x) => x.id === r.id);
        if (row) row.fantasy_points = r.points;
      }
      return p_rows.length;
    },
    score_refresh_player_totals: ({ p_gameweek_id }) => {
      const ids = new Set(db.player_gameweek_stats.filter((r) => r.gameweek_id === p_gameweek_id).map((r) => r.player_id));
      for (const id of ids) {
        const total = db.player_gameweek_stats.filter((r) => r.player_id === id).reduce((s, r) => s + (r.fantasy_points ?? 0), 0);
        const pl = db.players.find((x) => x.id === id);
        if (pl) pl.total_points = total;
      }
      return ids.size;
    },
    score_write_user_points: ({ p_gameweek_id, p_rows }) => {
      db.user_gameweek_points ??= [];
      for (const r of p_rows) {
        const ex = db.user_gameweek_points.find((x) => x.user_id === r.user_id && x.gameweek_id === p_gameweek_id);
        if (ex) Object.assign(ex, r, { gameweek_id: p_gameweek_id });
        else db.user_gameweek_points.push({ id: `ugp-${r.user_id}`, ...r, gameweek_id: p_gameweek_id });
      }
      for (const r of p_rows) {
        const total = db.user_gameweek_points.filter((x) => x.user_id === r.user_id).reduce((s, x) => s + (x.total_points ?? 0), 0);
        const u = db.users.find((x) => x.id === r.user_id);
        if (u) u.total_points = total;
      }
      return p_rows.length;
    },
    score_write_auto_subs: ({ p_gameweek_id, p_rows }) => {
      for (const s of db.squads) if (s.gameweek_id === p_gameweek_id) s.auto_subbed_in = false;
      for (const r of p_rows) {
        const s = db.squads.find((x) => x.gameweek_id === p_gameweek_id && x.user_id === r.user_id && x.player_id === r.player_id);
        if (s) s.auto_subbed_in = true;
      }
      return p_rows.length;
    },
  };

  const client: any = {
    from: (t: string) => new QB(t),
    rpc: (name: string, args: any) => {
      calls.total++;
      if (!rpcs[name]) return Promise.resolve({ data: null, error: { message: `nepoznat RPC ${name}` } });
      return Promise.resolve({ data: rpcs[name](args), error: null });
    },
  };
  return { client, calls };
}

// --- Testna baza ------------------------------------------------------------
const GW = "gw-1";
function buildDb(opts: { users: number; emptyFixture?: boolean }): DB {
  const layout: [string, number][] = [["GK", 2], ["DEF", 5], ["MID", 5], ["FWD", 3]];
  const players: Row[] = [];
  for (const [pos, count] of layout) {
    for (let k = 0; k < count; k++) {
      players.push({ id: `pl-${pos}-${k}`, position: pos, club_id: k < 2 ? "club-A" : "club-B", total_points: 0 });
    }
  }

  const fixtures: Row[] = [{ id: "fx-1", gameweek_id: GW, status: "finished" }];
  if (opts.emptyFixture) fixtures.push({ id: "fx-2", gameweek_id: GW, status: "finished" });

  // Svaki igrač: 90 min + 1 gol. Izuzetak pl-MID-4 (0 min) — okida auto-sub.
  const stats: Row[] = players.map((pl) => ({
    id: `st-${pl.id}`, player_id: pl.id, club_id: pl.club_id, fixture_id: "fx-1", gameweek_id: GW,
    minutes_played: pl.id === "pl-MID-4" ? 0 : 90,
    goals: pl.id === "pl-MID-4" ? 0 : 1,
    assists: 0, clean_sheet: false, goals_conceded: 0, saves: 0, penalties_saved: 0,
    penalties_missed: 0, yellow_cards: 0, red_cards: 0, own_goals: 0, bonus_points: 0,
    fantasy_points: 0, is_admin_reviewed: true,
  }));

  // Startnih 11 = 4-4-2 (GK-0, DEF 0-3, MID 0/1/2/4, FWD 0/1)
  const starting = new Set([
    "pl-GK-0", "pl-DEF-0", "pl-DEF-1", "pl-DEF-2", "pl-DEF-3",
    "pl-MID-0", "pl-MID-1", "pl-MID-2", "pl-MID-4", "pl-FWD-0", "pl-FWD-1",
  ]);

  const users: Row[] = [];
  const squads: Row[] = [];
  const transfers: Row[] = [];
  for (let u = 0; u < opts.users; u++) {
    const userId = `user-${u}`;
    users.push({ id: userId, favorite_club_id: null, total_points: 0 });
    let benchOrder = 12;
    for (const pl of players) {
      const isStarting = starting.has(pl.id);
      squads.push({
        user_id: userId, gameweek_id: GW, player_id: pl.id,
        is_starting: isStarting, squad_order: isStarting ? 1 : benchOrder++,
        is_captain: pl.id === "pl-FWD-0", is_vice_captain: pl.id === "pl-FWD-1",
        auto_subbed_in: false,
      });
    }
    transfers.push({ user_id: userId, gameweek_id: GW, points_cost: -4 });
  }

  return {
    gameweeks: [{ id: GW, number: 1, status: "data_pulled" }],
    fixtures, players, player_gameweek_stats: stats, squads, users, transfers,
    chips_usage: [], user_gameweek_points: [], ingestion_runs: [],
  };
}

// Očekivano za ovu bazu:
//  poeni: GK/DEF 2+6=8, MID 2+5=7, FWD 2+4=6
//  pl-MID-4 (0 min) izlazi; sa klupe po prioritetu ulazi pl-DEF-4 (5-3-2 je validno)
//  raw = 8 + 5×8 + 3×7 + 2×6 = 81 ; kapiten FWD-0 nosi +6 ; transfer -4 → 83
const RAW = 81;
const TOTAL = 83;

async function main() {
  // --- 5a) Srećan slučaj ----------------------------------------------------
  {
    const db = buildDb({ users: 1 });
    const { client, calls } = makeMock(db);
    const res = await runScoringForGameweek(client, GW, "admin-1");

    const st = (id: string) => db.player_gameweek_stats.find((r) => r.player_id === id)!.fantasy_points;
    eq("e2e: GK poeni", st("pl-GK-0"), 8);
    eq("e2e: DEF poeni", st("pl-DEF-0"), 8);
    eq("e2e: MID poeni", st("pl-MID-0"), 7);
    eq("e2e: FWD poeni", st("pl-FWD-0"), 6);
    eq("e2e: igrač bez minuta", st("pl-MID-4"), 0);

    const ugp = db.user_gameweek_points[0];
    eq("e2e: raw_points", ugp.raw_points, RAW);
    eq("e2e: transfer_cost", ugp.transfer_cost, -4);
    eq("e2e: total_points", ugp.total_points, TOTAL);
    eq("e2e: users.total_points keš", db.users[0].total_points, TOTAL);
    eq("e2e: kolo zaključano", db.gameweeks[0].status, "finalized");
    eq("e2e: rezultat", [res.ok, res.finalized, res.usersScored, res.statRowsScored], [true, true, 1, 15]);
    eq("e2e: auto-sub trag", db.squads.filter((s) => s.auto_subbed_in).map((s) => s.player_id), ["pl-DEF-4"]);
    eq("e2e: players.total_points keš", db.players.find((x) => x.id === "pl-GK-0")!.total_points, 8);

    const run = db.ingestion_runs[0];
    eq("e2e: dnevnik zatvoren", [run.kind, !!run.finished_at, run.fixtures_touched, run.errors.length], ["admin_scoring_finalize", true, 15, 0]);
    console.log(`  → poziva ka bazi, 1 korisnik: ${calls.total}`);
  }

  // --- 5b) Idempotentnost ---------------------------------------------------
  {
    const db = buildDb({ users: 1 });
    const { client } = makeMock(db);
    await runScoringForGameweek(client, GW, "admin-1");
    const res2 = await runScoringForGameweek(client, GW, "admin-1");
    eq("idempotentnost: jedan ugp red", db.user_gameweek_points.length, 1);
    eq("idempotentnost: isti total", db.user_gameweek_points[0].total_points, TOTAL);
    eq("idempotentnost: keš nije udvostručen", db.users[0].total_points, TOTAL);
    eq("idempotentnost: igračev keš nije udvostručen", db.players.find((x) => x.id === "pl-GK-0")!.total_points, 8);
    eq("idempotentnost: drugi prolaz ok", res2.ok, true);
  }

  // --- 5c) Odigran meč bez ijednog reda statistike ---------------------------
  {
    const db = buildDb({ users: 1, emptyFixture: true });
    const { client } = makeMock(db);
    await throwsWith("prazan odigran meč puca", () => runScoringForGameweek(client, GW, "admin-1"), "nema unetu statistiku");
    eq("prazan meč: kolo NIJE zaključano", db.gameweeks[0].status, "data_pulled");
    eq("prazan meč: dnevnik ipak zatvoren", !!db.ingestion_runs[0].finished_at, true);
    eq("prazan meč: greška zapisana u dnevnik", db.ingestion_runs[0].errors.length, 1);
  }

  // --- 5d) Straničenje: 100 korisnika = 1500 squads redova ------------------
  {
    const db = buildDb({ users: 100 });
    const { client, calls } = makeMock(db);
    const res = await runScoringForGameweek(client, GW, "admin-1");
    eq("straničenje: svih 100 korisnika obračunato", res.usersScored, 100);
    eq("straničenje: 100 ugp redova", db.user_gameweek_points.length, 100);
    eq("straničenje: i poslednji korisnik ima poene", db.user_gameweek_points.at(-1)!.total_points, TOTAL);
    console.log(`  → poziva ka bazi, 100 korisnika: ${calls.total}`);
    if (calls.total <= 25) pass++;
    else { fail++; console.log(`FAIL straničenje: previše poziva (${calls.total})`); }
  }

  // --- 5e) Validacije -------------------------------------------------------
  {
    const db = buildDb({ users: 1 });
    db.player_gameweek_stats[0].is_admin_reviewed = false;
    const { client } = makeMock(db);
    await throwsWith("nepotvrđena statistika puca", () => runScoringForGameweek(client, GW, "admin-1"), "nije potvrđeno");
  }
  {
    const db = buildDb({ users: 1 });
    db.fixtures[0].status = "live";
    const { client } = makeMock(db);
    await throwsWith("neodigran meč puca", () => runScoringForGameweek(client, GW, "admin-1"), "nije odigrano");
  }

  // --- 5f2) Kolo u statusu "upcoming" sa odigranim mečevima ------------------
  {
    // Rezultati uneti ručno (SQL) ne menjaju gameweeks.status. Ranije je
    // obračun to odbijao i kolo se nije moglo zaključati bez ručne izmene
    // statusa u bazi.
    const db = buildDb({ users: 1 });
    db.gameweeks[0].status = "upcoming";
    const { client } = makeMock(db);
    const res = await runScoringForGameweek(client, GW, "admin-1");
    eq("upcoming + odigrani mečevi se obračunava", [res.ok, res.finalized], [true, true]);
    eq("upcoming: kolo je zaključano", db.gameweeks[0].status, "finalized");
  }

  // --- 5f) Otkazan meč sme da bude prazan -----------------------------------
  {
    const db = buildDb({ users: 1, emptyFixture: true });
    db.fixtures[1].status = "cancelled";
    const { client } = makeMock(db);
    const res = await runScoringForGameweek(client, GW, "admin-1");
    eq("otkazan meč bez statistike je u redu", [res.ok, res.finalized], [true, true]);
  }

  // --- 5g) Čip Favorite Club x2 ---------------------------------------------
  {
    // club-B u efektivnoj postavi: DEF-2, DEF-3, DEF-4, MID-2 = 8+8+8+7 = 31
    // multiplied = 81 + 6 (kapiten) + 31 = 118 ; total = 114
    const db = buildDb({ users: 1 });
    db.users[0].favorite_club_id = "club-B";
    db.chips_usage.push({ user_id: "user-0", gameweek_id: GW, chip_type: "favorite_club_x2" });
    const { client } = makeMock(db);
    await runScoringForGameweek(client, GW, "admin-1");
    const ugp = db.user_gameweek_points[0];
    eq("čip: raw ostaje bez množilaca", ugp.raw_points, RAW);
    eq("čip: chip_type_used upisan", ugp.chip_type_used, "favorite_club_x2");
    eq("čip: total sa klupskim množiocem", ugp.total_points, 114);
  }

  // --- 5h) Triple Captain ---------------------------------------------------
  {
    const db = buildDb({ users: 1 });
    db.chips_usage.push({ user_id: "user-0", gameweek_id: GW, chip_type: "triple_captain" });
    const { client } = makeMock(db);
    await runScoringForGameweek(client, GW, "admin-1");
    // kapiten FWD-0 nosi 3x umesto 2x → +6 više nego obično
    eq("čip: triple captain", db.user_gameweek_points[0].total_points, TOTAL + 6);
  }

  console.log(`\n${pass} prošlo, ${fail} palo`);
  if (fail > 0) process.exit(1);
}

main();
