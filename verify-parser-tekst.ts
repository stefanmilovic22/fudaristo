/**
 * Test protiv STVARNOG kopiranog izveštaja (Olympiacos — OFI, kolo 4).
 * Nije sintetički: tekst je tačno onakav kakav stiže iz pregledača.
 */
import { extractMatchStatsFromText } from "./lib/worldfootball-parser";
import fs from "fs";

let pass = 0, fail = 0;
const ok = (l: string, c: boolean, extra = "") =>
  c ? pass++ : (fail++, console.log(`FAIL ${l}${extra ? " — " + extra : ""}`));

const r = extractMatchStatsFromText(fs.readFileSync("verify-uzorak-izvestaj.txt", "utf-8"));
const by = (name: string) =>
  r.players.find((p) => p.nameOnPage.toLowerCase().includes(name.toLowerCase()));

ok("domaćin", r.homeTeamName === "Olympiacos FC", r.homeTeamName);
ok("gost", r.awayTeamName === "OFI Crete", r.awayTeamName);
ok("rezultat 0:1", r.homeScore === 0 && r.awayScore === 1);

// 11 + 12 + 11 + 12 = 46 igrača
ok("46 igrača ukupno", r.players.length === 46, String(r.players.length));

// Golovi
ok("Kodro ima gol", by("Kodro")?.goals === 1);
ok("Athanasiou ima asistenciju", by("Athanasiou")?.assists === 1, String(by("Athanasiou")?.assists));
ok("asistent nema gol", by("Athanasiou")?.goals === 0);
ok("samo jedan gol ukupno", r.players.reduce((s, p) => s + p.goals, 0) === 1);

// Minuti — starteri bez izmene
ok("Ortega 90 (nije menjan)", by("Ortega")?.minutesPlayed === 90);
ok("Jota Silva 90", by("Jota")?.minutesPlayed === 90);

// KLJUČNI SLUČAJ: Pirola ima 60. ali nijedna rezerva nije ušla u 60.
// → to je karton, ne izmena, pa mora da ostane 90 minuta.
ok("Pirola 90 (60. je karton, ne izmena)", by("Pirola")?.minutesPlayed === 90,
   String(by("Pirola")?.minutesPlayed));

// Starteri koji JESU menjani
ok("Freuler izašao u 67.", by("Freuler")?.minutesPlayed === 67);
ok("Fortounis izašao u 75.", by("Fortounis")?.minutesPlayed === 75);
ok("Chiquinho izašao u 83.", by("Chiquinho")?.minutesPlayed === 83);
ok("Nikolaou izašao u 13.", by("Nikolaou")?.minutesPlayed === 13);

// KLJUČNI SLUČAJ 2: Kodro ima 66. (gol) i 70. (izmena) — mora uzeti 70.
ok("Kodro izašao u 70., ne 66.", by("Kodro")?.minutesPlayed === 70,
   String(by("Kodro")?.minutesPlayed));

// Rezerve
ok("Hezze ušao u 67. → 23 min", by("Hezze")?.minutesPlayed === 23);
ok("Krizmanić ušao u 13. → 77 min", by("Krizmani")?.minutesPlayed === 77);
ok("Carmo nije igrao → 0 min", by("Carmo")?.minutesPlayed === 0);
ok("Clayton nije igrao → 0 min", by("Clayton")?.minutesPlayed === 0);

// Nema izmišljenih kartona
ok("nijedan karton nije izmišljen", r.players.every((p) => p.yellowCards === 0 && p.redCards === 0));
ok("upozorenje o kartonima postoji", r.warnings.some((w) => w.includes("Kartoni se NE izvlače")));

// Strane
ok("Ortega je domaćin", by("Ortega")?.isHome === true);
ok("Kodro je gost", by("Kodro")?.isHome === false);

// Minuti golova za tačan obračun primljenih
ok("gol u 66. zabeležen", r.goalMinutes?.[0]?.minute === 66);
ok("gol pripada gostu", r.goalMinutes?.[0]?.forHome === false);

console.log(`${pass} prošlo, ${fail} palo`);
if (fail) process.exit(1);
