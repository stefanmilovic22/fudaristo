/**
 * Grbovi klubova (slike). Ključ je skraćenica kluba (clubs.short_name), pa grb
 * radi svuda gde se prikazuje ClubBadge, bez dodatnih polja u bazi i upita.
 * Klub bez grba i dalje ima krug u boji kluba sa skraćenicom.
 *
 * Nova slika: public/crests/<klub>.png (kvadrat, providna pozadina, oko 160 px),
 * pa red ovde.
 */
const CLUB_CREST: Record<string, string> = {
  AST: "/crests/asteras.png",
  KAL: "/crests/kalamata.png",
  LEV: "/crests/levadiakos.png",
  AEK: "/crests/aek.png",
  OLY: "/crests/olympiacos.png",
  IRA: "/crests/iraklis.png",
};

export function crestFor(short: string | null | undefined): string | null {
  return (short && CLUB_CREST[short.trim().toUpperCase()]) || null;
}
