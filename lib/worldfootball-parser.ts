/**
 * Parser za izveštaj sa meča na worldfootball.net — koristi ga admin dugme
 * "Povuci sa worldfootball-a".
 *
 * ⚠️ SVESNO OGRANIČEN OBIM. Prva verzija je pokušala i golove, asistencije,
 * postavu/klupu i minute izmena da izvuče iz teksta oko linkova ka
 * igračima. Testiranje na sintetičkoj strani je pokazalo da to AKTIVNO
 * GREŠI, ne samo da nešto propušta: asistent je dobio pripisana 2 gola koja
 * nije dao (link mu se našao u prozoru teksta oko sledećeg gola), a igrač
 * sa klupe koji je ušao i dao gol je označen kao starter (njegov link se
 * prvi put javlja u listi golova, iznad tabele sa postavom). Pogrešan broj
 * koji izgleda uverljivo je opasniji od praznog polja u review ekranu — lako
 * se previdi.
 *
 * Zato ovaj parser sad tvrdi SAMO ono što je testom potvrđeno da radi
 * tačno: finalni rezultat, imena timova, i POTPUN spisak igrača koji se
 * pominju na strani (postava + klupa oba tima, bez razdvajanja koje je
 * pokazalo da nije pouzdano izvesti iz teksta). Sve statističke vrednosti
 * (minuti, golovi, asistencije, kartoni, odbrane) počinju PRAZNE — admin ih
 * upisuje gledajući u isti izveštaj koji je otvorio da nalepi URL.
 *
 * I dalje štedi vreme: bez ovoga bi admin morao ručno da otkuca i uparuje
 * 22+ imena; sa ovim, imena i uparivanje sa igračima iz baze (po klubu i
 * prezimenu) su već tu — upisuju se samo brojevi.
 */

import * as cheerio from "cheerio";

export type ParsedPlayerRow = {
  worldfootballId: number;
  nameOnPage: string;
};

export type ParsedMatchReport = {
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  players: ParsedPlayerRow[];
  warnings: string[];
};

const PERSON_HREF = /\/person\/pe(\d+)\/([^/]+)\/?$/;

/**
 * Parsira HTML stranice izveštaja. Radi i na glavnoj strani meča i na
 * .../lineup/ pod-strani — obe sadrže isti skup /person/pe.../ linkova.
 */
export function parseWorldfootballLineup(html: string): ParsedMatchReport {
  const $ = cheerio.load(html);
  const warnings: string[] = [];

  const scoreMatch = $("body")
    .text()
    .match(/(\d+)\s*:\s*(\d+)/);
  const homeScore = scoreMatch ? Number(scoreMatch[1]) : null;
  const awayScore = scoreMatch ? Number(scoreMatch[2]) : null;
  if (homeScore === null) {
    warnings.push("Rezultat nije prepoznat u tekstu stranice — upiši ga ručno.");
  }

  // Naslov oblika "Line-ups: Home Team - Away Team, dd.mm.yyyy | ..."
  const titleText = $("title").first().text();
  const titleMatch = titleText.match(/:\s*(.+?)\s*-\s*(.+?),/);
  const homeTeamName = titleMatch?.[1]?.trim() ?? "Domaći";
  const awayTeamName = titleMatch?.[2]?.trim() ?? "Gosti";
  if (!titleMatch) {
    warnings.push("Nisam prepoznao imena timova iz naslova stranice — provera ručno.");
  }

  // Svaki /person/pe<ID>/ link, deduplikovan po ID-ju. Ovo je JEDINI deo
  // koji je testiranje potvrdilo kao pouzdan — obrazac linka je specifičan i
  // ne zavisi od toga koji deo teksta stoji oko njega.
  const seen = new Map<number, string>();
  $("a[href*='/person/pe']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.match(PERSON_HREF);
    if (!m) return;
    const id = Number(m[1]);
    if (seen.has(id)) return;
    const name = $(el).text().trim();
    if (name) seen.set(id, name);
  });

  if (seen.size === 0) {
    warnings.push(
      "Nijedan link ka igraču nije nađen — provera da je nalepljen URL izveštaja sa meča (stranica se možda promenila)."
    );
  } else if (seen.size < 20) {
    warnings.push(`Nađeno ${seen.size} igrača — obično ima 22+ (postave + klupe oba tima). Provera da li nešto nedostaje.`);
  }

  warnings.push(
    "Postava/klupa, minuti, golovi, asistencije i kartoni NISU automatski popunjeni — upiši ih gledajući izveštaj sa meča."
  );
  warnings.push("Odbrane golmana nisu dostupne na ovom sajtu ni ručnim gledanjem — proveri drugi izvor ili ostavi 0.");

  return {
    homeTeamName,
    awayTeamName,
    homeScore,
    awayScore,
    players: [...seen.entries()].map(([worldfootballId, nameOnPage]) => ({ worldfootballId, nameOnPage })),
    warnings,
  };
}
