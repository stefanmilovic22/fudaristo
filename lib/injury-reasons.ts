/**
 * Vrsta povrede / suspenzije iz SofaScore-a stiže kao tekst ("Knock Injury",
 * "red_card_suspension"). U bazi ostaje izvorni tekst; ovde se pretvara u ključ
 * za prevod (messages → "injuryReasons") i, kad prevoda nema, u čitljiv
 * engleski tekst umesto ružnog "yellow_or_red_card_suspension".
 */
export function reasonKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/['’]/g, "") // "Coach's decision" -> "coachs decision"
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function humanizeReason(raw: string): string {
  const s = raw.replace(/[_\s]+/g, " ").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
