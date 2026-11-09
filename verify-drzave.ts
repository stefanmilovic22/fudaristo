// Provera nacionalnosti igrača (lib/nationality.ts). Pokretanje: npx tsx verify-drzave.ts
import { buildNationalitiesPreview, countryName, flagUrl, normalizeCountryCode, parseNationalitiesFile } from "./lib/nationality";
const eq = (n: string, a: unknown, b: unknown) => console.log(JSON.stringify(a) === JSON.stringify(b) ? "OK  " : "FAIL", n, JSON.stringify(a));

eq("kod mala slova", normalizeCountryCode(" gr "), "GR");
eq("kod neispravan", normalizeCountryCode("GRC"), null);
eq("zastava GR", flagUrl("GR"), "https://flagcdn.com/w20/gr.png");
eq("zastava EN → gb-eng", flagUrl("EN", 40), "https://flagcdn.com/w40/gb-eng.png");
eq("naziv sr", countryName("GR", "sr"), "Grčka");
eq("naziv en", countryName("GR", "en"), "Greece");
eq("naziv el", countryName("GR", "el"), "Ελλάδα");
eq("naziv Engleska", countryName("EN", "sr"), "Engleska");

const file = parseNationalitiesFile({
  fetchedAt: "2026-11-09T10:00:00Z",
  teams: [
    { team: "Kalamata", players: [
      { player: { name: "Ben Zidane", country: { alpha2: "fr", name: "France" } } },
      { player: { name: "Lazaros Labrou", country: { alpha2: "GR", name: "Greece" } } },
      { player: { name: "Nepoznat Igrac", country: { alpha2: "RS" } } },
      { player: { name: "Bez Drzave" } },
    ] },
    { team: "Nepostojeci FC", players: [{ player: { name: "X", country: { alpha2: "GR" } } }] },
  ],
});
eq("parse: 2 kluba", file.teams.length, 2);
eq("parse: kod velikim slovima", file.teams[0].players[0].country, "FR");
eq("parse: bez države", file.teams[0].players[3].country, null);

const clubs = [{ id: "k", name: "Kalamata" }];
const players = [
  { id: "1", first_name: "Ben", last_name: "Zidane", club_id: "k", nationality: null },
  { id: "2", first_name: "Lazaros", last_name: "Labrou", club_id: "k", nationality: "GR" },
  { id: "3", first_name: "Neko", last_name: "Treci", club_id: "k", nationality: null },
];
const p = buildNationalitiesPreview(file, clubs, players);
eq("predlog: Zidane FR", p.rows.find((r) => r.playerId === "1")?.country, "FR");
eq("predlog: Labrou bez izmene", [p.unchanged, p.rows.some((r) => r.playerId === "2")], [1, false]);
eq("predlog: neuparen ima playerId null", p.rows.find((r) => r.sofaName === "Nepoznat Igrac")?.playerId, null);
eq("bez države se broji", p.withoutCountry, 1);
eq("naš igrač bez para", p.unmatchedOurs.map((u) => u.name), ["Neko Treci"]);
eq("upozorenje za nepoznat klub", p.warnings.some((w) => w.includes("Nepostojeci FC")), true);
