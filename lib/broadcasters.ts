/**
 * Gde se prenosi Super liga Grčke 2026/27 — po zemljama, grupisano u regione.
 * Ručno održavan, preliminaran spisak (izvor: LiveSoccerTV, stranica takmičenja
 * po zemlji, poslednja provera 23.10.2026). Prava prenosa se menjaju, pa se na
 * stranici uvek prikazuje upozorenje.
 *
 * Nova zemlja = jedan novi red u odgovarajućem regionu. `country` je ISO 3166-1
 * oznaka (naziv i zastava se prave sami, na jeziku posetioca). Redosled unutar
 * regiona je redosled prikaza.
 */
export type RegionId = "balkan" | "europe" | "americas" | "africa" | "asiaOceania";

export type CountryBroadcasters = {
  country: string;
  region: RegionId;
  broadcasters: string[];
};

/** Redosled regiona na stranici. */
export const REGIONS: RegionId[] = ["balkan", "europe", "americas", "africa", "asiaOceania"];

/** Isti kanali za više zemalja odjednom. */
const many = (region: RegionId, countries: string[], broadcasters: string[]): CountryBroadcasters[] =>
  countries.map((country) => ({ country, region, broadcasters }));

export const BROADCASTERS: CountryBroadcasters[] = [
  // --- Balkan i jugoistočna Evropa ---
  { country: "RS", region: "balkan", broadcasters: ["Arena Sport", "Arena Premium", "Nova Sport", "Arena Cloud"] },
  { country: "BA", region: "balkan", broadcasters: ["Arena Sport", "Moja TV", "Arena Cloud"] },
  { country: "HR", region: "balkan", broadcasters: ["Sport Klub", "Nova Sport", "MAXtv", "MAXtv To Go"] },
  { country: "ME", region: "balkan", broadcasters: ["Arena Sport", "Nova Sport", "Arena Cloud"] },
  { country: "MK", region: "balkan", broadcasters: ["MaxTV Go", "Arena Sport", "Nova Sport", "Arena Cloud"] },
  { country: "AL", region: "balkan", broadcasters: ["SuperSport", "DigitAlb"] },
  { country: "BG", region: "balkan", broadcasters: ["Diema Sport 2", "Diema Sport 3", "Nova Sport", "PLAY Diema Xtra"] },
  { country: "GR", region: "balkan", broadcasters: ["Novasports", "Cosmote Sport", "SKAI"] },
  { country: "CY", region: "balkan", broadcasters: ["Novasports", "Cytavision Sports", "Cablenet", "PrimeTel"] },

  // --- Ostatak Evrope ---
  ...many("europe", ["GB", "IE", "FR", "NL", "DK", "NO", "SE"], ["Triller TV+"]),
  { country: "PL", region: "europe", broadcasters: ["Sportklub Poland"] },
  ...many("europe", ["IT", "SM"], ["Como TV"]),
  ...many(
    "europe",
    ["DE", "ES", "PT", "CH", "AT", "BE", "FI", "CZ", "SK", "HU", "RO", "IS", "LU"],
    ["Go Greek TV"]
  ),

  // --- Severna i Južna Amerika ---
  ...many("americas", ["US", "CA"], ["SportPlus", "ANT1 Satellite"]),
  ...many(
    "americas",
    ["MX", "BZ", "CR", "CU", "DO", "GT", "HN", "NI", "PA", "SV", "AR", "BO", "CL", "CO"],
    ["Claro Sports"]
  ),
  { country: "BR", region: "americas", broadcasters: ["Zapping", "Claro TV+", "Sky+"] },

  // --- Afrika ---
  ...many(
    "africa",
    ["ZA", "NG", "GH", "KE", "UG", "TZ", "RW", "CD", "CM", "GN", "MG", "MW", "MZ", "SL", "ZM", "BI"],
    ["StarTimes"]
  ),

  // --- Azija, Bliski istok i Okeanija ---
  { country: "TR", region: "asiaOceania", broadcasters: ["Saran Holding"] },
  ...many("asiaOceania", ["JP", "IN", "TH", "KR", "AE", "SA", "QA", "EG", "KW"], ["Go Greek TV"]),
  { country: "AU", region: "asiaOceania", broadcasters: ["ANT1 Pacific", "SportPlus"] },
  { country: "NZ", region: "asiaOceania", broadcasters: ["Go Greek TV"] },
];

/** Zastava kao emoji iz ISO oznake zemlje (GR → 🇬🇷). */
export function flagEmoji(country: string): string {
  return [...country.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("");
}
