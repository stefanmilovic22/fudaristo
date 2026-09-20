import "server-only";
import { sleep } from "./thesportsdb";

/**
 * Automatsko pronalaženje worldfootball.net izveštaja za mečeve iz baze.
 *
 * Do sada je admin za SVAKI meč morao da otvori worldfootball, nađe utakmicu i
 * nalepi URL — sedam puta po kolu. URL sadrži interni ID meča (ma12319882),
 * koji se ne može izvesti iz imena timova, pa se do njega dolazi samo čitanjem
 * spiska mečeva sezone. To je jedan zahtev za celo kolo, umesto sedam ručnih
 * traženja.
 */

/**
 * Naši nazivi klubova → worldfootball slugovi.
 *
 * Ručno, ne izvedeno iz imena: "Iraklis 1908" je kod njih "aep-iraklis-fc",
 * "Kifisia" je "ae-kifisias", "Aris" je "aris-saloniki". Nijedno pravilo
 * transliteracije to ne pogađa, a pogrešan slug bi tiho uparivao pogrešan meč.
 */
const CLUB_SLUGS: Record<string, string> = {
  "AEK Athens": "aek-athen",
  Aris: "aris-saloniki",
  "Asteras Tripolis": "asteras-tripolis",
  Atromitos: "atromitos",
  "Iraklis 1908": "aep-iraklis-fc",
  Kalamata: "ps-kalamata",
  Kifisia: "ae-kifisias",
  Levadiakos: "levadiakos",
  OFI: "ofi-heraklion",
  Olympiacos: "olympiacos-fc",
  Panathinaikos: "panathinaikos-ao",
  Panetolikos: "panetolikos",
  PAOK: "paok-saloniki",
  Volos: "volos-nfc",
};

const SEASON_PAGE = "https://www.worldfootball.net/competition/co122/greece-super-league/all-matches/";

/**
 * Zaglavlja pregledača. Sa "Fudaristo-admin/1.0" je worldfootball vraćao
 * HTTP 403 — mnogi sajtovi odbijaju zahteve koji se ne predstavljaju kao
 * pregledač. Ovo NIJE garancija: blokada ume da bude i po IP opsegu (Vercel je
 * data centar), i tada nijedno zaglavlje ne pomaže. Zato URL više nije uslov
 * za pripremu statistike, nego pogodnost.
 */
export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
};

/** /match-report/co122/super-league/ma12319882/olympiacos-fc_ofi-heraklion/ */
const REPORT_HREF =
  /\/match-report\/co122\/super-league\/ma\d+\/([a-z0-9-]+)_([a-z0-9-]+)\/?/g;

export type ReportIndex = {
  /** ključ: "<home-slug>|<away-slug>" */
  byPair: Map<string, string>;
  totalFound: number;
};

/**
 * Povlači spisak mečeva sezone i vadi sve linkove ka izveštajima.
 *
 * Uparivanje ide po PARU SLUGOVA, ne po datumu — termin se pomera (odloženi
 * mečevi), a par ne. Isti par se u sezoni javlja jednom po smeru, pa je ključ
 * jedinstven.
 */
export async function fetchReportIndex(): Promise<ReportIndex> {
  const res = await fetch(SEASON_PAGE, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Spisak mečeva nije dostupan (HTTP ${res.status}).`);

  const html = await res.text();
  const byPair = new Map<string, string>();

  for (const match of html.matchAll(REPORT_HREF)) {
    const [path, home, away] = match;
    const key = `${home}|${away}`;
    // Prvi nalaz je merodavan: stranica isti link ponavlja (tekst + prazan
    // link uz grb), a ponavljanja su identična.
    if (!byPair.has(key)) {
      byPair.set(key, `https://www.worldfootball.net${path.endsWith("/") ? path : path + "/"}`);
    }
  }

  return { byPair, totalFound: byPair.size };
}

export function slugForClub(clubName: string): string | null {
  return CLUB_SLUGS[clubName] ?? null;
}

/**
 * URL izveštaja za jedan meč, ili null uz razlog.
 */
export function findReportUrl(
  index: ReportIndex,
  homeClubName: string,
  awayClubName: string
): { url: string } | { url: null; reason: string } {
  const home = slugForClub(homeClubName);
  const away = slugForClub(awayClubName);

  if (!home || !away) {
    return {
      url: null,
      reason: `Nepoznat klub za worldfootball: ${!home ? homeClubName : awayClubName} — dodaj ga u CLUB_SLUGS.`,
    };
  }

  const url = index.byPair.get(`${home}|${away}`);
  if (!url) {
    return { url: null, reason: `Meč ${homeClubName} — ${awayClubName} nije nađen na spisku sezone.` };
  }
  return { url };
}

/** Razmak između zahteva ka worldfootball-u — ne tucamo im server u petlji. */
export const POLITE_DELAY_MS = 900;
export { sleep };
