// SofaScore povrede i suspenzije — nalepi ovo u DevTools Console DOK SI na
// sofascore.com (bilo koja stranica tog sajta). Skuplja spisak odsutnih igrača
// za mečeve narednog kola i skida JEDAN .json fajl; učitaj ga u Admin →
// „SofaScore povrede i suspenzije". Radi se jednom nedeljno, pred kolo.
//
// Ceo kod je u bloku { ... }, pa se skripta može nalepiti više puta u istoj
// kartici bez greške "redeclaration of const".
//
// IZMENI SAMO OVU LINIJU (koje kolo je sledeće):
{
const ROUND = 7;

const TOURNAMENT_ID = 185; // Stoiximan Super League (Grčka)
const SEASON_ID = 98659; // Super League 26/27

(async () => {
  const teams = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  console.log(`Kolo ${ROUND}: tražim mečeve…`);
  const res = await fetch(
    `https://www.sofascore.com/api/v1/unique-tournament/${TOURNAMENT_ID}/season/${SEASON_ID}/events/round/${ROUND}`
  );
  if (!res.ok) return console.error(`HTTP ${res.status} — proveri ROUND.`);
  const events = (await res.json()).events ?? [];

  const slim = (list) =>
    (list ?? []).map((m) => ({
      player: { name: m.player?.name },
      type: m.type,
      reason: m.reason,
      description: m.description,
      expectedEndDate: m.expectedEndDate ?? null,
    }));

  for (const ev of events) {
    // Odigrani mečevi i mečevi u toku nemaju smisla za "ko ne igra sledeće".
    if (ev.status?.type === "finished" || ev.status?.type === "inprogress") continue;
    await sleep(400);
    const r = await fetch(`https://www.sofascore.com/api/v1/event/${ev.id}/lineups`);
    if (!r.ok) {
      console.warn(`  ${ev.homeTeam?.name} — ${ev.awayTeam?.name}: HTTP ${r.status}, preskačem.`);
      continue;
    }
    const l = await r.json();
    // I prazan spisak je podatak ("nema odsutnih") — klub ostaje u fajlu.
    teams.push({ team: ev.homeTeam?.name ?? "?", missing: slim(l.home?.missingPlayers) });
    teams.push({ team: ev.awayTeam?.name ?? "?", missing: slim(l.away?.missingPlayers) });
    console.log(`  → ${ev.homeTeam?.name} — ${ev.awayTeam?.name}`);
  }

  const out = { round: ROUND, fetchedAt: new Date().toISOString(), teams };
  console.log(`Gotovo: ${teams.length} klubova, ${teams.reduce((n, t) => n + t.missing.length, 0)} odsutnih igrača.`);

  const blob = new Blob([JSON.stringify(out)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "sofascore-povrede.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  console.log("Fajl skinut: sofascore-povrede.json — učitaj ga u admin panelu.");
})();
}
