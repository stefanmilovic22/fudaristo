import { cache } from "react";
import { createClient } from "./server";

export type CurrentUser = { id: string; email: string | null };

/**
 * Prijavljen korisnik za OVAJ zahtev — jedan proračun, koliko god
 * komponenata (layout + stranica) ga tražilo.
 *
 * `getClaims()` proverava potpis JWT-a lokalno (bez mrežnog poziva ka
 * Supabase Auth-u) kad projekat koristi asimetrične ključeve; inače sam
 * pada na `getUser()`. Bezbednost je ista — token se kriptografski proverava
 * u oba slučaja — samo je brže. Ne koristi se za admin akcije: lib/admin-guard.ts
 * namerno i dalje zove `getUser()`.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // createClient() čita kolačiće — MORA biti van try/catch: Next tako označava
  // stranicu kao dinamičku bacanjem posebnog izuzetka, koji se ne sme progutati.
  const supabase = await createClient();
  try {
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims?.sub) return null;
    return { id: claims.sub, email: (claims.email as string | undefined) ?? null };
  } catch {
    return null;
  }
});
