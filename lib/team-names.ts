/**
 * Poređenje naziva klubova između SofaScore-a i naše baze.
 *
 * SofaScore često ima zvaničniji pun naziv ("APO Levadiakos", "GFS Panetolikos",
 * "Olympiacos Piraeus"), pa obostrana provera "sadrži" hvata većinu slučajeva.
 * Dva kluba se kod SofaScore-a zovu potpuno drugačije nego kod nas i ne mogu se
 * uhvatiti tim pravilom — zato su ovde izričito navedeni:
 *   "NPS Volos"      = naš "Volos NFC"
 *   "Asteras Aktor"  = naš "Asteras Tripolis"
 * Novi slučaj (promena imena kluba) se dodaje u ALIASES.
 */
export function normalizeTeamName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Ako normalizovan naziv SADRŽI `contains`, klub se vodi pod ključem `key`. */
const ALIASES: { contains: string; key: string }[] = [
  { contains: "volos", key: "volos" },
  { contains: "asteras", key: "asteras" },
];

function canonical(normalized: string): string | null {
  return ALIASES.find((a) => normalized.includes(a.contains))?.key ?? null;
}

export function teamNamesMatch(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ca = canonical(na);
  return ca !== null && ca === canonical(nb);
}
