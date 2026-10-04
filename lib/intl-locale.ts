/**
 * Oznaka jezika za Intl/toLocale*: srpski ("sr") bi bez ovoga bio ispisan
 * ćirilicom (dani u nedelji, meseci), a sajt je latinica — zato "sr-Latn".
 */
export function intlTag(locale: string): string {
  return locale === "sr" ? "sr-Latn" : locale;
}
