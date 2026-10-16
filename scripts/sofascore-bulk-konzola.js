// SofaScore bulk backfill — nalepi ovo u DevTools Console DOK SI na
// sofascore.com (bilo koja stranica tog sajta, da fetch ima ispravan
// Origin/Referer). Skida JEDAN .json fajl sa svim odigranim mečevima
// traženih kola — taj fajl se učitava u "SofaScore ocene — bulk unos" I u
// "SofaScore golovi i asistencije — ispravka" na /admin stranici Fudarista.
//
// IZMENI SAMO OVU LINIJU po potrebi (koja kola da povuče):
const ROUNDS = [1,2,3,4,5,6];

const TOURNAMENT_ID = 185; // Stoiximan Super League (Grčka)
const SEASON_ID = 98659; // Super League 26/27

// Puni SofaScore odgovor nosi gomilu podataka koji nam ne trebaju (prevodi
// imena na 10+ jezika, tržišna vrednost, zastave država...) — po meču to zna
// da bude i 50-80KB, pa 5 kola × 9 mečeva lako probije Next.js-ov podrazumevani
// limit od 1MB za server action. Ovde se čuva SAMO ono što parser čita
// (lib/sofascore-parser.ts), pa fajl ostane mali.
function trimLineups(lineups) {
  const trimSide = (side) => ({
    players: (side?.players ?? []).map((p) => ({
      player: { name: p.player?.name, shortName: p.player?.shortName, position: p.player?.position },
      position: p.position,
      substitute: p.substitute,
      captain: p.captain,
      statistics: { rating: p.statistics?.rating, minutesPlayed: p.statistics?.minutesPlayed },
    })),
  });
  return {
    confirmed: lineups?.confirmed,
    home: trimSide(lineups?.home),
    away: trimSide(lineups?.away),
  };
}

// Golovi i asistencije NISU u odgovoru sa sastavima — nalaze se u posebnom
// odgovoru ".../event/{id}/incidents". Čuvaju se samo golovi (strelac, asistent,
// vrsta gola, strana), što je sitno.
function trimIncidents(incidents) {
  return (incidents ?? [])
    .filter((i) => i.incidentType === "goal")
    .map((i) => ({
      incidentType: i.incidentType,
      incidentClass: i.incidentClass,
      isHome: i.isHome,
      time: i.time,
      player: { name: i.player?.name ?? i.playerName ?? null },
      assist1: i.assist1 ? { name: i.assist1.name } : null,
    }));
}

(async () => {
  const matches = [];
  let skippedNotFinished = 0;
  let noIncidents = 0;

  for (const round of ROUNDS) {
    console.log(`Kolo ${round}: tražim mečeve…`);
    const roundRes = await fetch(
      `https://www.sofascore.com/api/v1/unique-tournament/${TOURNAMENT_ID}/season/${SEASON_ID}/events/round/${round}`
    );
    if (!roundRes.ok) {
      console.warn(`Kolo ${round}: HTTP ${roundRes.status} — preskačem.`);
      continue;
    }
    const roundJson = await roundRes.json();

    for (const ev of roundJson.events ?? []) {
      if (ev.status?.type !== "finished") {
        skippedNotFinished++;
        continue;
      }
      console.log(`  → ${ev.homeTeam?.name} — ${ev.awayTeam?.name} (id ${ev.id})`);

      // Malo pauze između poziva — ovo je i dalje tvoj browser (ne server),
      // ali nema razloga da se udara API brže nego što bi to radila stvarna
      // stranica dok je čita čovek.
      await new Promise((r) => setTimeout(r, 350));

      const linRes = await fetch(`https://www.sofascore.com/api/v1/event/${ev.id}/lineups`);
      if (!linRes.ok) {
        console.warn(`    lineups HTTP ${linRes.status} — preskačem ovaj meč.`);
        continue;
      }
      const lineups = await linRes.json();

      await new Promise((r) => setTimeout(r, 350));

      // Bez golova meč i dalje ide u fajl (ocene rade), samo bez "incidents".
      let incidents;
      const incRes = await fetch(`https://www.sofascore.com/api/v1/event/${ev.id}/incidents`);
      if (incRes.ok) {
        incidents = trimIncidents((await incRes.json()).incidents);
      } else {
        noIncidents++;
        console.warn(`    incidents HTTP ${incRes.status} — meč ide bez golova.`);
      }

      matches.push({
        sofaEventId: ev.id,
        homeTeam: ev.homeTeam?.name ?? "?",
        awayTeam: ev.awayTeam?.name ?? "?",
        round,
        lineups: trimLineups(lineups),
        ...(incidents ? { incidents } : {}),
      });
    }
  }

  console.log(
    `Gotovo: ${matches.length} mečeva (preskočeno ${skippedNotFinished} neodigranih, bez golova: ${noIncidents}).`
  );

  const blob = new Blob([JSON.stringify({ matches })], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "sofascore-bulk.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  console.log("Fajl skinut: sofascore-bulk.json — učitaj ga u admin panelu.");
})();
