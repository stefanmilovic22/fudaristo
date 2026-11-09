// SofaScore nacionalnosti igrača — nalepi ovo u DevTools Console DOK SI na
// sofascore.com (bilo koja stranica tog sajta). Za svaki klub Super lige skida
// spisak igrača sa državom i pravi JEDAN .json fajl; učitaj ga u Admin →
// „Nacionalnosti igrača". Radi se retko (kad stignu novi igrači), ne svake nedelje.
//
// Ceo kod je u bloku { ... }, pa se skripta može nalepiti više puta u istoj
// kartici bez greške "redeclaration of const".
{
const TOURNAMENT_ID = 185; // Stoiximan Super League (Grčka)
const SEASON_ID = 98659; // Super League 26/27
// Kola iz kojih se čitaju klubovi (dovoljno je jedno puno kolo; više kola je rezerva
// ako je neki meč odložen pa klub fali u prvom).
const ROUNDS = [1, 2, 3];

(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clubs = new Map(); // id → ime

  for (const round of ROUNDS) {
    const res = await fetch(
      `https://www.sofascore.com/api/v1/unique-tournament/${TOURNAMENT_ID}/season/${SEASON_ID}/events/round/${round}`
    );
    if (!res.ok) {
      console.warn(`Kolo ${round}: HTTP ${res.status} — preskačem.`);
      continue;
    }
    for (const ev of (await res.json()).events ?? []) {
      if (ev.homeTeam?.id) clubs.set(ev.homeTeam.id, ev.homeTeam.name);
      if (ev.awayTeam?.id) clubs.set(ev.awayTeam.id, ev.awayTeam.name);
    }
    await sleep(300);
  }
  console.log(`Nađeno klubova: ${clubs.size}`);

  const teams = [];
  let sampleLogged = false;
  for (const [id, name] of clubs) {
    await sleep(400);
    const r = await fetch(`https://www.sofascore.com/api/v1/team/${id}/players`);
    if (!r.ok) {
      console.warn(`  ${name}: HTTP ${r.status}, preskačem.`);
      continue;
    }
    const json = await r.json();
    // Isti igrač se može naći u više lista (players / foreignPlayers / nationalPlayers).
    const seen = new Map();
    for (const list of [json.players, json.foreignPlayers, json.nationalPlayers]) {
      for (const e of list ?? []) {
        const p = e.player ?? e;
        if (p?.name && !seen.has(p.name)) seen.set(p.name, p);
      }
    }
    if (!sampleLogged && seen.size > 0) {
      console.log("Primer igrača iz odgovora (ako državu ne nađe, pošalji ovo):", [...seen.values()][0]);
      sampleLogged = true;
    }
    const players = [...seen.values()].map((p) => ({
      player: { name: p.name, country: { alpha2: p.country?.alpha2 ?? null, name: p.country?.name ?? null } },
    }));
    teams.push({ team: name, players });
    console.log(`  → ${name}: ${players.length} igrača, ${players.filter((x) => x.player.country.alpha2).length} sa državom`);
  }

  const out = { fetchedAt: new Date().toISOString(), teams };
  console.log(`Gotovo: ${teams.length} klubova, ${teams.reduce((n, t) => n + t.players.length, 0)} igrača.`);

  const blob = new Blob([JSON.stringify(out)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "sofascore-drzave.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  console.log("Fajl skinut: sofascore-drzave.json — učitaj ga u admin panelu.");
})();
}
