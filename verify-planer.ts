/**
 * Provera logike planera: npx tsx verify-planer.ts
 */
import { simulatePlan, type Plan, type SquadMember } from "./lib/planner";
import type { Position, SelectablePlayer } from "./lib/fantasy-rules";

let failures = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  if (ok) console.log("  ✓", name);
  else {
    failures++;
    console.log("  ✗", name, extra ?? "");
  }
}

let n = 0;
function p(position: Position, club: string, price: number): SelectablePlayer {
  n++;
  return {
    id: `p${n}`, first_name: "P", last_name: String(n), position, price, status: "available",
    club_id: club, club_name: club, club_short: club, club_color: "#fff", club_jersey_photo_url: null,
    total_points: 0, avg_rating: null,
  };
}
const own = [p("GK", "A", 5), p("DEF", "A", 5), p("DEF", "B", 5), p("MID", "C", 6), p("FWD", "D", 8)];
const squad: SquadMember[] = own.map((pl) => ({ player: pl, sellPrice: pl.price }));
const buyDef = p("DEF", "E", 5.5);
const buyDef2 = p("DEF", "F", 5.1);
const buyMid = p("MID", "G", 6.5);
const buyFwd = p("FWD", "H", 20); // preskup
const buyGk = p("GK", "B", 5); // ok pozicija
const all = new Map([...own, buyDef, buyDef2, buyMid, buyFwd, buyGk].map((x) => [x.id, x]));
const run = (plan: Plan, free = 1, budget = 1) =>
  simulatePlan({ squad, budget, freeNow: free, plan, players: all, gwCount: 3 });

console.log("Slobodni transferi i cena");
let r = run([[], [], []], 1);
check("gomilanje 1 → 2 → 3", r.gws.map((g) => g.freeAvailable).join() === "1,2,3", r.gws.map((g) => g.freeAvailable));
r = run([[], [], []], 5);
check("najviše 5", r.gws.map((g) => g.freeAvailable).join() === "5,5,5");
r = run([[{ outId: own[1].id, inId: buyDef.id }, { outId: own[2].id, inId: buyDef2.id }], [], []], 1);
check("2 transfera uz 1 slobodan = −4", r.gws[0].cost === 4 && r.gws[0].used === 2, r.gws[0]);
check("posle toga sledeće kolo ima 1 (ostatak 0 + 1)", r.gws[1].freeAvailable === 1);
r = run([[], [], [{ outId: own[1].id, inId: buyDef.id }, { outId: own[2].id, inId: buyDef2.id }, { outId: own[3].id, inId: buyMid.id }]], 1, 5);
check("3 transfera u K3 uz 3 slobodna = 0", r.gws[2].cost === 0 && r.gws[2].freeAvailable === 3, r.gws[2]);

console.log("Ograničenja");
r = run([[{ outId: own[1].id, inId: buyMid.id }], [], []]);
check("druga pozicija se odbacuje", r.gws[0].used === 0 && r.plan[0].length === 0);
r = run([[{ outId: own[4].id, inId: buyFwd.id }], [], []]);
check("preskup se odbacuje (kasa)", r.gws[0].used === 0);
r = run([[{ outId: own[0].id, inId: buyGk.id }], [], []]);
check("klub sa 3 igrača je dozvoljen do limita", r.gws[0].used === 1);
r = run([[{ outId: own[1].id, inId: own[2].id }], [], []]);
check("igrač koji je već u sastavu se odbacuje", r.gws[0].used === 0);

console.log("Budžet i prodajna cena");
r = run([[{ outId: own[1].id, inId: buyDef.id }], [], []], 1, 0);
check("kasa 0: 5.0 → 5.5 ne može", r.gws[0].used === 0);
r = run([[{ outId: own[1].id, inId: buyDef.id }], [], []], 1, 0.5);
check("kasa 0.5: 5.0 → 5.5 može, kasa 0", r.gws[0].used === 1 && r.gws[0].budgetAfter === 0, r.gws[0]);

console.log("Lanac kroz kola");
const chain: Plan = [[{ outId: own[1].id, inId: buyDef.id }], [{ outId: buyDef.id, inId: buyDef2.id }], []];
r = run(chain, 2, 1);
check("K2 prodaje igrača kupljenog u K1 po njegovoj ceni", r.gws[1].used === 1 && r.gws[1].transfers[0].out.sellPrice === 5.5, r.gws[1].transfers[0]);
const broken: Plan = [[], [{ outId: buyDef.id, inId: buyDef2.id }], []];
r = run(broken, 2, 1);
check("K2 ne može da proda igrača kog nije kupio", r.gws[1].used === 0 && r.plan[1].length === 0);
const sameGw: Plan = [[{ outId: own[1].id, inId: buyDef.id }, { outId: buyDef.id, inId: buyDef2.id }], [], []];
r = run(sameGw, 2, 1);
check("nema lanca kupi-pa-prodaj u istom kolu", r.gws[0].used === 1 && r.plan[0].length === 1);

console.log(failures === 0 ? "\nSve provere prolaze." : `\n${failures} provera NE prolazi.`);
process.exit(failures === 0 ? 0 : 1);
