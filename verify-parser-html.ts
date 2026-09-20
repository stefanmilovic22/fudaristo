/**
 * Testovi parsera na sintetičkom HTML-u koji oponaša strukturu worldfootball-a.
 * NE dokazuju da radi na pravoj stranici — dokazuju da obrasci rade kako je
 * zamišljeno i, još važnije, da NE izmišljaju brojeve kad obrazac ne odgovara.
 */
import { extractMatchStats } from "./lib/worldfootball-parser";

let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => (c ? pass++ : (fail++, console.log("FAIL " + l)));

const P = (id: number, name: string) => `<a href="/person/pe${id}/${name.toLowerCase()}/">${name}</a>`;

const html = `
<html><head><title>Line-ups: Panathinaikos - Panetolikos, 13.09.2026 | worldfootball</title></head>
<body>
<div>3:0</div>
<table>
  <tr><td>1:0</td><td>${P(1, "Taborda")}</td><td>${P(2, "Pelkas")}</td><td>23.</td></tr>
  <tr><td>2:0</td><td>${P(1, "Taborda")}</td><td>55.</td></tr>
  <tr><td>3:0</td><td>${P(9, "Defender")}</td><td>own goal</td><td>70.</td></tr>
</table>
<table>
  <tr><td><img src="/gfx/yellow.png"></td><td>${P(3, "Cerin")}</td><td>41.</td></tr>
  <tr><td><img src="/gfx/yellowred.png"></td><td>${P(4, "Kotsiras")}</td><td>88.</td></tr>
  <tr><td><img src="/gfx/red.png"></td><td>${P(5, "Mladenovic")}</td><td>90.</td></tr>
</table>
<table>
  <tr><td>out</td><td>${P(6, "Ioannidis")}</td><td>in</td><td>${P(7, "Sporar")}</td><td>67.</td></tr>
</table>
<table><tr><td>${P(8, "Brignoli")}</td></tr></table>
</body></html>`;

const r = extractMatchStats(html);
const by = (id: number) => r.players.find((p) => p.worldfootballId === id)!;

ok("naslov -> imena timova", r.homeTeamName === "Panathinaikos" && r.awayTeamName === "Panetolikos");
ok("strelac ima 2 gola", by(1).goals === 2);
ok("asistent ima 1 asistenciju", by(2).assists === 1);
ok("asistent NEMA gol", by(2).goals === 0);
ok("autogol nije gol", by(9).ownGoals === 1 && by(9).goals === 0);
ok("autogol nema asistenta", by(9).assists === 0);
ok("žuti karton", by(3).yellowCards === 1 && by(3).redCards === 0);
ok("drugi žuti = žuti + crveni", by(4).yellowCards === 1 && by(4).redCards === 1);
ok("direktan crveni", by(5).redCards === 1 && by(5).yellowCards === 0);
ok("izašao u 67. -> 67 minuta", by(6).minutesPlayed === 67);
ok("ušao u 67. -> 23 minuta", by(7).minutesPlayed === 23);
ok("ušao je označen kao nestarter", by(7).startedMatch === false);
ok("igrač bez podataka ostaje prazan", by(8).minutesPlayed === null && by(8).goals === 0);
ok("broj golova prepoznat", r.confidence.goalsFound === 3);
ok("izmene prepoznate", r.confidence.substitutionsFound === 1);

// Ono što je najvažnije: kad obrazac NE odgovara, ne sme se ništa izmisliti.
const smece = `<html><body><p>${P(1, "Taborda")} je bio dobar, dao je gol u 23 minutu</p></body></html>`;
const r2 = extractMatchStats(smece);
ok("proza ne proizvodi golove", r2.players.every((p) => p.goals === 0));
ok("proza ne proizvodi minute", r2.players.every((p) => p.minutesPlayed === null));
ok("upozorenje kad nema izmena", r2.warnings.some((w) => w.includes("izmena nije prepoznata")));

console.log(`${pass} prošlo, ${fail} palo`);
if (fail) process.exit(1);
