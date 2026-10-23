/**
 * Provera uvoza povreda: npx tsx verify-povrede.ts
 * Sigurnosna pravila: povratak igrača zbog PRAZNOG spiska kluba nije siguran.
 */
import { buildInjuriesPreview } from "./lib/injuries-preview";
import type { InjuriesFile } from "./lib/sofascore-injuries";

let failures = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  if (ok) console.log("  ✓", name);
  else {
    failures++;
    console.log("  ✗", name, extra ?? "");
  }
}

const clubs = [
  { id: "c1", name: "Olympiacos" },
  { id: "c2", name: "PAOK" },
  { id: "c3", name: "Aris" },
];
const pl = (id: string, first: string, last: string, club: string, status = "available", note: string | null = null) => ({
  id, first_name: first, last_name: last, club_id: club, status, status_note: note, status_until: null,
});
const players = [
  pl("p1", "Ayoub", "El Kaabi", "c1", "injured", "Knock"),
  pl("p2", "Kostas", "Fortounis", "c1"),
  pl("p3", "Dimitris", "Pelkas", "c2", "injured", "Muscle"),
  pl("p4", "Luka", "Jovic", "c2"),
  pl("p5", "Taison", "", "c3", "suspended", "Card"),
];
const file = (teams: InjuriesFile["teams"], fetchedAt: string | null = new Date().toISOString()): InjuriesFile => ({
  round: 8, fetchedAt, teams,
});
const m = (name: string, desc = "Knock Injury") => ({ name, type: "missing", reason: 1, description: desc, until: null });

console.log("Normalan spisak");
let r = buildInjuriesPreview(file([{ team: "Olympiacos", missing: [m("Fortounis")] }]), clubs, players);
const back = r.rows.find((x) => x.playerId === "p1");
check("igrač koji nije na spisku kluba vraća se na dostupan", back?.proposedStatus === "available" && back.sofaName === null, back);
check("takav povratak je siguran (spisak nije prazan)", back?.uncertain === false);
check("novi povređeni se predlaže", r.rows.some((x) => x.playerId === "p2" && x.proposedStatus === "injured"));
check("nema upozorenja", r.warnings.length === 0, r.warnings);

console.log("Prazan spisak kluba");
r = buildInjuriesPreview(file([{ team: "PAOK", missing: [] }]), clubs, players);
const rowP3 = r.rows.find((x) => x.playerId === "p3");
check("povratak se predlaže, ali je označen kao nesiguran", rowP3?.proposedStatus === "available" && rowP3.uncertain === true, rowP3);
check("izdato je upozorenje za klub", r.warnings.some((w) => w.includes("PAOK") && w.includes("NIJE unapred štikliran")), r.warnings);
check("klub bez označenih igrača ne pravi upozorenje", !buildInjuriesPreview(file([{ team: "Olympiacos", missing: [] }]), clubs, [pl("p2", "Kostas", "Fortounis", "c1")]).warnings.length);

console.log("Klub koji nije u fajlu");
r = buildInjuriesPreview(file([{ team: "Olympiacos", missing: [m("Fortounis")] }]), clubs, players);
check("igrači drugih klubova ostaju netaknuti", !r.rows.some((x) => x.playerId === "p3" || x.playerId === "p5"));

console.log("Star fajl");
r = buildInjuriesPreview(file([{ team: "Olympiacos", missing: [m("Fortounis")] }], new Date(Date.now() - 6 * 86_400_000).toISOString()), clubs, players);
check("fajl stariji od 3 dana izdaje upozorenje", r.warnings.some((w) => w.includes("pre 6 dana")), r.warnings);

console.log(failures === 0 ? "\nSve provere prolaze." : `\n${failures} provera NE prolazi.`);
process.exit(failures === 0 ? 0 : 1);
