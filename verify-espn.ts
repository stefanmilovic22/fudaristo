/**
 * Test ESPN parsera na sintetičkom odgovoru (isti oblik kao site.api.espn.com
 * summary). Proverava minute igrača — jedino što se ne čita direktno iz ESPN-a.
 */
import { parseEspnSummary } from "./lib/espn-parser";

let pass = 0, fail = 0;
const ok = (l: string, c: boolean, extra = "") => (c ? pass++ : (fail++, console.log(`FAIL ${l}${extra ? " — " + extra : ""}`)));

const ath = (id: number, name: string) => ({ id: String(id), fullName: name });
const sec = (min: number) => ({ value: min * 60 });
const sub = (inId: number, outId: number, min: number) => ({
  type: { type: "substitution" },
  clock: sec(min),
  participants: [{ athlete: ath(inId, "in") }, { athlete: ath(outId, "out") }],
});

const json = {
  header: { competitions: [{ competitors: [
    { homeAway: "home", score: "1", team: { id: "10", displayName: "Home FC" } },
    { homeAway: "away", score: "0", team: { id: "20", displayName: "Away FC" } },
  ] }] },
  rosters: [
    { homeAway: "home", roster: [
      { athlete: ath(1, "Starter Full"), starter: true, stats: [{ name: "totalGoals", value: 1 }] },
      { athlete: ath(2, "Starter Off67"), starter: true, subbedOut: true },
      { athlete: ath(3, "Sub On67"), starter: false, subbedIn: true },
      { athlete: ath(4, "Sub Late92"), starter: false, subbedIn: true },
      { athlete: ath(5, "Starter Off93"), starter: true, subbedOut: true },
      { athlete: ath(6, "Unused Sub"), starter: false },
      { athlete: ath(7, "Off No Event"), starter: true, subbedOut: true },
      { athlete: ath(8, "On No Event"), starter: false, subbedIn: true },
    ] },
    { homeAway: "away", roster: [] },
  ],
  keyEvents: [sub(3, 2, 67), sub(4, 5, 92)],
};

const r = parseEspnSummary(json);
const by = (n: string) => r.players.find((p) => p.nameOnPage.includes(n))!;

ok("starter bez izmene = 90", by("Starter Full").minutesPlayed === 90);
ok("gol se čita", by("Starter Full").goals === 1);
ok("starter izašao u 67. = 67", by("Off67").minutesPlayed === 67);
ok("rezerva ušla u 67. = 23", by("Sub On67").minutesPlayed === 23, String(by("Sub On67").minutesPlayed));
ok("rezerva ušla u 92. (nadoknada) = bar 1, ne negativno", by("Late92").minutesPlayed === 1, String(by("Late92").minutesPlayed));
ok("starter izašao u 92. ne prelazi 90", by("Off93").minutesPlayed === 90, String(by("Off93").minutesPlayed));
ok("neiskorišćena rezerva = 0", by("Unused").minutesPlayed === 0);
ok("izašao bez događaja → upozorenje", r.warnings.some((w) => w.includes("Off No Event")));
ok("ušao bez događaja → 1 min + upozorenje", by("On No Event").minutesPlayed === 1 && r.warnings.some((w) => w.includes("On No Event")));
ok("nijedan igrač nema negativne minute", r.players.every((p) => (p.minutesPlayed ?? 0) >= 0));
ok("rezultat 1:0", r.homeScore === 1 && r.awayScore === 0);

console.log(`${pass} prošlo, ${fail} palo`);
process.exit(fail ? 1 : 0);
