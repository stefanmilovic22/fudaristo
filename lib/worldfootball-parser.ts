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

// ============================================================================
// Izvlačenje brojeva iz izveštaja (minuti, golovi, kartoni)
// ============================================================================

/**
 * ⚠️ PROČITAJ PRE MENJANJA.
 *
 * Prva verzija ovog parsera je pokušavala da golove i asistencije pogodi iz
 * TEKSTA OKO linkova ka igračima, i grešila je uverljivo: asistent je dobijao
 * tuđe golove, a igrač sa klupe je proglašavan starterom. Zato je bila
 * uklonjena.
 *
 * Ova verzija radi drugačije — ne gleda okolinu linka, nego SEGMENTIRA
 * stranicu po sekcijama i unutar svake traži strog obrazac:
 *
 *   golovi     → red koji počinje rezultatom "2:1" i sadrži tačno jedan link
 *                ka igraču; minut je broj sa tačkom ("67.")
 *   kartoni    → red u sekciji sa kartonima, boja iz naziva slike/teksta
 *   izmene     → red sa DVA linka (izlazi, ulazi) i minutom
 *   postava    → linkovi u tabeli pre sekcije izmena
 *
 * Ako red ne odgovara obrascu, PRESKAČE SE i upisuje se upozorenje. Prazno
 * polje je bezbedno; pogrešan broj nije.
 *
 * I dalje se NIŠTA ne upisuje u bazu dok admin ne pogleda pregled i ne
 * potvrdi — videti PullResult.preview u admin akciji.
 */

export type ExtractedPlayerStats = {
  /** null kad je izvor nalepljen tekst — tamo nema linkova ka igračima. */
  worldfootballId: number | null;
  nameOnPage: string;
  /** null = nije pouzdano utvrđeno, admin upisuje. */
  minutesPlayed: number | null;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  isHome: boolean | null;
  startedMatch: boolean | null;
  /** Minut ulaska sa klupe; null za startere i za one koji nisu igrali. */
  cameOnAt?: number | null;
};

export type ExtractedMatch = {
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  players: ExtractedPlayerStats[];
  warnings: string[];
  /** Minuti golova i kom timu pripadaju — za tačan obračun primljenih golova. */
  goalMinutes?: { minute: number; forHome: boolean | null }[];
  /** Koliko je stvari parser uspeo da utvrdi — za poruku u pregledu. */
  confidence: {
    lineupsFound: boolean;
    goalsFound: number;
    cardsFound: number;
    substitutionsFound: number;
  };
};

const MINUTE = /(\d{1,3})\s*\./;
const SCORE_LINE = /^\s*\d+\s*:\s*\d+/;

function personIdFrom(href: string): number | null {
  const m = href.match(PERSON_HREF);
  return m ? Number(m[1]) : null;
}

export function extractMatchStats(html: string): ExtractedMatch {
  const $ = cheerio.load(html);
  const warnings: string[] = [];

  const base = parseWorldfootballLineup(html);
  const stats = new Map<number, ExtractedPlayerStats>();

  const ensure = (id: number, name: string): ExtractedPlayerStats => {
    let row = stats.get(id);
    if (!row) {
      row = {
        worldfootballId: id,
        nameOnPage: name,
        minutesPlayed: null,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        ownGoals: 0,
        isHome: null,
        startedMatch: null,
      };
      stats.set(id, row);
    }
    return row;
  };

  for (const p of base.players) ensure(p.worldfootballId, p.nameOnPage);

  const confidence = {
    lineupsFound: false,
    goalsFound: 0,
    cardsFound: 0,
    substitutionsFound: 0,
  };

  // --- Golovi -------------------------------------------------------------
  // Red počinje rezultatom ("1:0") i sadrži linkove ka igračima. Prvi link je
  // strelac; drugi, ako postoji, asistent. Autogol se prepoznaje po tekstu.
  $("tr").each((_, tr) => {
    const $tr = $(tr);
    const text = $tr.text().replace(/\s+/g, " ").trim();
    if (!SCORE_LINE.test(text)) return;

    const links = $tr.find("a[href*='/person/pe']").toArray();
    if (links.length === 0) return;

    const scorerId = personIdFrom($(links[0]).attr("href") ?? "");
    if (scorerId === null) return;

    const row = ensure(scorerId, $(links[0]).text().trim());
    const isOwnGoal = /own goal|eigentor|autogol/i.test(text);

    if (isOwnGoal) row.ownGoals += 1;
    else row.goals += 1;
    confidence.goalsFound++;

    if (links.length > 1 && !isOwnGoal) {
      const assistId = personIdFrom($(links[1]).attr("href") ?? "");
      if (assistId !== null) {
        ensure(assistId, $(links[1]).text().trim()).assists += 1;
      }
    }
  });

  // --- Kartoni ------------------------------------------------------------
  // Boja se čita iz naziva slike (yellow.png / red.png / yellowred.png) ili iz
  // teksta reda. Red sa kartonom ima tačno jedan link ka igraču.
  $("tr").each((_, tr) => {
    const $tr = $(tr);
    const html_ = $tr.html() ?? "";
    const text = $tr.text().replace(/\s+/g, " ").trim();

    const hasYellowRed = /yellowred|gelb-rot|yellow-red/i.test(html_ + text);
    const hasRed = !hasYellowRed && /\bred\b|rote karte|red card/i.test(html_ + text);
    const hasYellow = !hasYellowRed && !hasRed && /\byellow\b|gelbe karte|yellow card/i.test(html_ + text);
    if (!hasYellowRed && !hasRed && !hasYellow) return;

    const links = $tr.find("a[href*='/person/pe']").toArray();
    if (links.length !== 1) return;

    const id = personIdFrom($(links[0]).attr("href") ?? "");
    if (id === null) return;

    const row = ensure(id, $(links[0]).text().trim());
    if (hasYellowRed) {
      row.yellowCards += 1;
      row.redCards += 1;
    } else if (hasRed) {
      row.redCards += 1;
    } else {
      row.yellowCards += 1;
    }
    confidence.cardsFound++;
  });

  // --- Izmene -------------------------------------------------------------
  // Red sa DVA linka i minutom: prvi izlazi, drugi ulazi.
  $("tr").each((_, tr) => {
    const $tr = $(tr);
    const text = $tr.text().replace(/\s+/g, " ").trim();
    if (!/(in|out|für|for|←|→)/i.test(text)) return;

    const links = $tr.find("a[href*='/person/pe']").toArray();
    if (links.length !== 2) return;

    const minuteMatch = text.match(MINUTE);
    if (!minuteMatch) return;
    const minute = Number(minuteMatch[1]);
    if (minute < 1 || minute > 120) return;

    const outId = personIdFrom($(links[0]).attr("href") ?? "");
    const inId = personIdFrom($(links[1]).attr("href") ?? "");
    if (outId === null || inId === null) return;

    ensure(outId, $(links[0]).text().trim()).minutesPlayed = minute;
    const inRow = ensure(inId, $(links[1]).text().trim());
    inRow.minutesPlayed = 90 - minute;
    inRow.startedMatch = false;
    confidence.substitutionsFound++;
  });

  if (confidence.goalsFound === 0 && (base.homeScore ?? 0) + (base.awayScore ?? 0) > 0) {
    warnings.push(
      "Rezultat kaže da je bilo golova, ali nijedan strelac nije prepoznat — upiši golove ručno."
    );
  }
  if (confidence.substitutionsFound === 0) {
    warnings.push("Nijedna izmena nije prepoznata — minuti su ostali prazni za sve igrače.");
  }
  warnings.push(
    "Odbrane golmana i primljeni golovi se NE izvlače — odbrane sajt ne daje, a primljeni golovi zavise od toga ko je bio na terenu."
  );

  return {
    homeTeamName: base.homeTeamName,
    awayTeamName: base.awayTeamName,
    homeScore: base.homeScore,
    awayScore: base.awayScore,
    players: [...stats.values()],
    warnings: [...base.warnings.filter((w) => !w.includes("NISU automatski")), ...warnings],
    confidence,
  };
}

// ============================================================================
// Parsiranje NALEPLJENOG izveštaja (Ctrl+A, Ctrl+C sa stranice meča)
// ============================================================================

/**
 * Pisano prema STVARNOM kopiranom izveštaju, ne prema pretpostavci o izgledu
 * stranice. Oblik koji stiže iz pregledača:
 *
 *   Olympiacos FC          ← domaćin
 *   0:1                    ← rezultat
 *   OFI Crete              ← gost
 *
 *   0:1                    ← gol: rezultat posle gola
 *   Kenan Kodro            ← strelac
 *   66.                    ← minut
 *   right foot             ← način (mala slova)
 *   N. Athanasiou          ← asistent (veliko slovo)
 *
 *   Olympiacos FC (4-2-3-1)  ← zaglavlje postave
 *   1                        ← broj dresa
 *   Stefan Ortega            ← ime
 *   5
 *   Lorenzo Pirola
 *   60.                      ← minut uz igrača
 *   ...
 *   Olympiacos FC
 *   Reserve players          ← klupa, isti oblik
 *
 * ⚠️ NAJVAŽNIJE OGRANIČENJE: kopiranjem se gube IKONICE. Minut „60." uz
 * startera može da znači izmenu, gol ILI karton — u tekstu izgledaju isto.
 *
 * Rešenje: minut uz startera je IZMENA samo ako isti minut postoji i kod
 * rezerve istog tima (neko je ušao). Na stvarnom primeru: Pirola ima 60., a
 * nijedna rezerva Olympiacosa nije ušla u 60. → to nije izmena nego karton,
 * pa Pirola dobija punih 90 minuta. Kodro ima 66. i 70.; 70 postoji kod
 * rezervi OFI-ja → izašao u 70., a 66. je njegov gol.
 *
 * Kartone NE izvlačimo iz tog minuta — bez ikonice se ne zna ni boja. Ostaju
 * na nuli i upisuju se ručno.
 *
 * ⚠️ ISPRAVKA (nađeno na stvarnom izveštaju Asteras Tripolis — AEK Athens):
 * zaglavlje postave drugog tima na stranici NE MORA da nosi formaciju u
 * zagradama ("AEK Athens" umesto "AEK Athens (4-3-1-2)") — worldfootball to
 * ume da izostavi. LINEUP_HEADER regex je tada promašivao ceo taj heading,
 * pa je parseSquadBlock nastavljao da čita igrače DRUGOG tima kao rezerve
 * PRVOG (Panathinaikos-Panetolikos incident: cela postava gostiju pripisana
 * domaćinu). Ispravka: granica bloka je SADA i "gola" linija koja se tačno
 * poklapa sa homeTeamName ili awayTeamName, ne samo "Ime (formacija)".
 */

const SCORE_ONLY = /^(\d{1,2})\s*:\s*(\d{1,2})$/;
const MINUTE_ONLY = /^(\d{1,3})\s*\.$/;
const SHIRT_ONLY = /^\d{1,2}$/;
const LINEUP_HEADER = /^(.+?)\s*\((\d[\d-]*)\)$/;
const RESERVES_HEADER = /^reserve players$/i;
const OWN_GOAL_TEXT = /\bown\s*goal\b/i;

type RawPlayer = { shirt: number; name: string; minutes: number[] };

/**
 * Da li ova linija označava POČETAK novog bloka (nova postava/rezerve, ili
 * prelazak na drugi tim) — bilo kroz "Ime (formacija)" bilo kroz golo ime
 * jednog od dva tima iz meča (videti ISPRAVKA gore).
 */
function isBlockBoundary(line: string, homeTeamName: string, awayTeamName: string): boolean {
  return (
    LINEUP_HEADER.test(line) ||
    RESERVES_HEADER.test(line) ||
    line === homeTeamName ||
    line === awayTeamName
  );
}

function parseSquadBlock(
  lines: string[],
  from: number,
  homeTeamName: string,
  awayTeamName: string
): { players: RawPlayer[]; next: number } {
  const players: RawPlayer[] = [];
  let i = from;

  while (i < lines.length) {
    const line = lines[i];
    // Kraj bloka: novo zaglavlje postave (sa ili bez formacije), naslov
    // klupe, ili gola linija sa imenom drugog tima.
    if (isBlockBoundary(line, homeTeamName, awayTeamName)) break;

    if (SHIRT_ONLY.test(line) && i + 1 < lines.length) {
      const name = lines[i + 1];
      // Iza broja dresa mora doći IME, ne opet broj — inače nije red igrača.
      if (SHIRT_ONLY.test(name) || MINUTE_ONLY.test(name)) {
        i++;
        continue;
      }
      const minutes: number[] = [];
      let j = i + 2;
      while (j < lines.length && MINUTE_ONLY.test(lines[j])) {
        minutes.push(Number(lines[j].match(MINUTE_ONLY)![1]));
        j++;
      }
      players.push({ shirt: Number(line), name, minutes });
      i = j;
      continue;
    }
    i++;
  }

  return { players, next: i };
}

export function extractMatchStatsFromText(text: string): ExtractedMatch {
  const warnings: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const confidence = { lineupsFound: false, goalsFound: 0, cardsFound: 0, substitutionsFound: 0 };

  // --- Zaglavlje: domaćin / rezultat / gost -------------------------------
  let homeTeamName = "";
  let awayTeamName = "";
  let homeScore: number | null = null;
  let awayScore: number | null = null;
  let cursor = 0;

  for (let i = 1; i < lines.length - 1; i++) {
    const m = lines[i].match(SCORE_ONLY);
    if (m) {
      homeTeamName = lines[i - 1];
      awayTeamName = lines[i + 1];
      homeScore = Number(m[1]);
      awayScore = Number(m[2]);
      cursor = i + 2;
      break;
    }
  }

  // --- Golovi -------------------------------------------------------------
  // Svaki gol: rezultat → strelac → minut → [način] → [asistent].
  // Način je malim slovom ("right foot", "penalty"), asistent velikim.
  type GoalEvent = { scorer: string; assist: string | null; minute: number; ownGoal: boolean };
  const goals: GoalEvent[] = [];

  let i = cursor;
  while (i < lines.length && !LINEUP_HEADER.test(lines[i]) && lines[i] !== homeTeamName && lines[i] !== awayTeamName) {
    const score = lines[i].match(SCORE_ONLY);
    if (!score) {
      i++;
      continue;
    }

    const scorer = lines[i + 1];
    const minuteMatch = lines[i + 2]?.match(MINUTE_ONLY);
    if (!scorer || !minuteMatch) {
      i++;
      continue;
    }

    let j = i + 3;
    let assist: string | null = null;
    let ownGoal = false;

    // Stani čim naiđe sledeći gol ILI zaglavlje postave (sa/bez formacije) —
    // inače se, kad iza pravog asistenta odmah sledi gola linija sa imenom
    // tima (npr. pred kraj utakmice, tik pre postava), taj naziv tima
    // POGREŠNO upiše kao "asistent" i prepiše pravog (nađeno na stvarnom
    // izveštaju: "F. Macheda" prepisan sa "Asteras Tripolis").
    while (
      j < lines.length &&
      !SCORE_ONLY.test(lines[j]) &&
      !LINEUP_HEADER.test(lines[j]) &&
      lines[j] !== homeTeamName &&
      lines[j] !== awayTeamName
    ) {
      if (OWN_GOAL_TEXT.test(lines[j])) ownGoal = true;
      // Samo PRVI kandidat se uzima kao asistent — dalje linije (npr. naziv
      // tima koji sledi) se ignorišu umesto da ga prepišu.
      else if (assist === null && /^[A-ZÀ-Ž]/.test(lines[j])) assist = lines[j];
      j++;
    }

    goals.push({ scorer, assist, minute: Number(minuteMatch[1]), ownGoal });
    confidence.goalsFound++;
    i = j;
  }

  // --- Postave i klupe ----------------------------------------------------
  type Side = { team: string; starters: RawPlayer[]; reserves: RawPlayer[] };
  const sides: Side[] = [];

  while (i < lines.length) {
    const header = lines[i].match(LINEUP_HEADER);
    const bareTeam = !header && (lines[i] === homeTeamName || lines[i] === awayTeamName) ? lines[i] : null;
    if (!header && !bareTeam) {
      i++;
      continue;
    }
    const team = header ? header[1] : (bareTeam as string);
    const startersBlock = parseSquadBlock(lines, i + 1, homeTeamName, awayTeamName);
    let reserves: RawPlayer[] = [];
    let next = startersBlock.next;

    // Posle postave dolazi "<Tim>" pa "Reserve players" — ALI ako drugi tim
    // uopšte nema rezerve navedene pre svog imena, odmah nailazimo na golo
    // ime drugog tima; tada NE ulazimo u parseSquadBlock (nema šta da se
    // pročita kao rezerve ovog tima).
    while (
      next < lines.length &&
      !LINEUP_HEADER.test(lines[next]) &&
      lines[next] !== homeTeamName &&
      lines[next] !== awayTeamName
    ) {
      if (RESERVES_HEADER.test(lines[next])) {
        const block = parseSquadBlock(lines, next + 1, homeTeamName, awayTeamName);
        reserves = block.players;
        next = block.next;
        break;
      }
      next++;
    }

    sides.push({ team, starters: startersBlock.players, reserves });
    confidence.lineupsFound = true;
    i = next;
  }

  // --- Minuti -------------------------------------------------------------
  const players: ExtractedPlayerStats[] = [];

  for (const side of sides) {
    const isHome = side.team === homeTeamName || homeTeamName.startsWith(side.team);

    // Minuti ulazaka sa klupe — po njima se prepoznaje koja je od brojki uz
    // startera stvarno izmena.
    const subOnMinutes = side.reserves.flatMap((r) => r.minutes);
    const available = [...subOnMinutes];

    for (const starter of side.starters) {
      let offMinute: number | null = null;
      for (const m of starter.minutes) {
        const idx = available.indexOf(m);
        if (idx !== -1) {
          offMinute = m;
          available.splice(idx, 1);
          confidence.substitutionsFound++;
          break;
        }
      }
      players.push(makeRow(starter.name, offMinute ?? 90, true, isHome));
    }

    for (const reserve of side.reserves) {
      const onMinute = reserve.minutes[0];
      const played = onMinute !== undefined;
      players.push(makeRow(reserve.name, played ? 90 - onMinute : 0, false, isHome, played ? onMinute : null));
    }
  }

  // --- Golovi i asistencije na igrače --------------------------------------
  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^[a-z]\.\s*/, "").trim();

  const findByName = (name: string) => {
    const target = normalize(name);
    const targetLast = target.split(" ").pop()!;
    return (
      players.find((p) => normalize(p.nameOnPage) === target) ??
      players.find((p) => normalize(p.nameOnPage).endsWith(" " + targetLast)) ??
      null
    );
  };

  for (const goal of goals) {
    const scorer = findByName(goal.scorer);
    if (!scorer) {
      warnings.push(`Strelac "${goal.scorer}" nije nađen u postavama — upiši mu gol ručno.`);
      continue;
    }
    if (goal.ownGoal) scorer.ownGoals += 1;
    else {
      scorer.goals += 1;
      if (goal.assist) {
        const assist = findByName(goal.assist);
        if (assist) assist.assists += 1;
        else warnings.push(`Asistent "${goal.assist}" nije nađen u postavama.`);
      }
    }
  }

  if (!confidence.lineupsFound) {
    warnings.push(
      "Nijedna postava nije prepoznata. Kopiraj celu stranicu izveštaja, uključujući postave i rezerve."
    );
  }
  warnings.push(
    "Kartoni se NE izvlače: kopiranjem se gube ikonice, pa se iz minuta uz igrača ne vidi ni da li je karton ni koje je boje. Upiši ih ručno."
  );
  warnings.push("Odbrane golmana sajt ne prikazuje — upiši ih ručno za golmane.");

  return {
    homeTeamName,
    awayTeamName,
    homeScore,
    awayScore,
    players,
    warnings,
    confidence,
    goalMinutes: goals.map((g) => ({ minute: g.minute, forHome: isGoalForHome(g, homeTeamName, sides) })),
  };
}

function makeRow(
  name: string,
  minutesPlayed: number,
  started: boolean,
  isHome: boolean,
  cameOnAt: number | null = null
): ExtractedPlayerStats {
  return {
    worldfootballId: null,
    nameOnPage: name,
    minutesPlayed,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    isHome,
    startedMatch: started,
    cameOnAt,
  };
}

/** Kom timu pripada gol — po tome čiji je strelac u postavi. */
function isGoalForHome(
  goal: { scorer: string; ownGoal: boolean },
  homeTeamName: string,
  sides: { team: string; starters: { name: string }[]; reserves: { name: string }[] }[]
): boolean | null {
  const scorerLower = goal.scorer.toLowerCase();
  for (const side of sides) {
    const inSide = [...side.starters, ...side.reserves].some((p) =>
      p.name.toLowerCase().includes(scorerLower.replace(/^[a-z]\.\s*/, ""))
    );
    if (inSide) {
      const sideIsHome = homeTeamName.startsWith(side.team) || side.team === homeTeamName;
      // Autogol se pripisuje PROTIVNIKU strelca.
      return goal.ownGoal ? !sideIsHome : sideIsHome;
    }
  }
  return null;
}
