// SofaScore termini — nalepi ovo u DevTools Console DOK SI na sofascore.com
// (bilo koja stranica tog sajta). Skida JEDAN .json fajl sa terminima svih
// mečeva traženih kola; učitaj ga u Admin → „SofaScore termini mečeva”.
//
// Ceo kod je u bloku { ... }, pa se skripta može nalepiti više puta u istoj
// kartici bez greške "redeclaration of const".
//
// IZMENI SAMO OVU LINIJU po potrebi (od narednog kola do kraja):
{
const ROUNDS = [7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26];

const TOURNAMENT_ID = 185; // Stoiximan Super League (Grčka)
const SEASON_ID = 98659; // Super League 26/27

(async () => {
  const fixtures = [];

  for (const round of ROUNDS) {
    console.log(`Kolo ${round}: tražim mečeve…`);
    const res = await fetch(
      `https://www.sofascore.com/api/v1/unique-tournament/${TOURNAMENT_ID}/season/${SEASON_ID}/events/round/${round}`
    );
    if (!res.ok) {
      console.warn(`Kolo ${round}: HTTP ${res.status} — preskačem.`);
      continue;
    }
    const json = await res.json();
    for (const ev of json.events ?? []) {
      fixtures.push({
        sofaEventId: ev.id,
        round,
        homeTeam: ev.homeTeam?.name ?? "?",
        awayTeam: ev.awayTeam?.name ?? "?",
        startTimestamp: ev.startTimestamp ?? null, // sekunde (UTC)
        status: ev.status?.type ?? "",
      });
    }
    // Jedan poziv po kolu, uz malu pauzu — ovo je tvoj browser, ne server.
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`Gotovo: ${fixtures.length} mečeva iz ${ROUNDS.length} kola.`);

  const blob = new Blob([JSON.stringify({ fixtures })], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "sofascore-termini.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  console.log("Fajl skinut: sofascore-termini.json — učitaj ga u admin panelu.");
})();
}
