/**
 * Dodaje otisak sadržaja (?v=…) na adresu slike dresa ili grba.
 *
 * Otisci se računaju pri izgradnji (next.config.ts → NEXT_PUBLIC_ASSET_VERSIONS)
 * i isti su na serveru i u pregledaču, pa nema razlike pri hidrataciji. Adresa
 * koja nije u spisku (spoljna slika, nepoznat fajl) vraća se neizmenjena.
 *
 * Zašto: /jerseys i /crests se u pregledaču čuvaju 7 dana. Kad se slika zameni
 * pod istim imenom, stara ostaje u kešu; sa otiskom izmenjena slika dobija novu
 * adresu, a neizmenjene se i dalje ne preuzimaju ponovo.
 */
const VERSIONS: Record<string, string> = (() => {
  try {
    return JSON.parse(process.env.NEXT_PUBLIC_ASSET_VERSIONS ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
})();

export function assetUrl<T extends string | null | undefined>(url: T): T {
  if (!url) return url;
  const bare = url.split("?")[0];
  const version = VERSIONS[bare];
  return (version ? `${bare}?v=${version}` : url) as T;
}
