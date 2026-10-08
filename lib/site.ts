/** Kontakt adresa sajta. Kad stigne domen, menja se samo ovde. */
export const CONTACT_EMAIL = "grckenovosti@gmail.com";

/**
 * Adresa po temi na stranici Kontakt. Za sada sve idu na istu adresu; kad
 * stigne domen, svaka tema može da dobije svoju (npr. nalog@, podrska@) —
 * dovoljno je promeniti vrednost ovde.
 */
export const CONTACT_EMAILS = {
  account: CONTACT_EMAIL,
  bugs: CONTACT_EMAIL,
  ideas: CONTACT_EMAIL,
  privacy: CONTACT_EMAIL,
  business: CONTACT_EMAIL,
  general: CONTACT_EMAIL,
} as const;

export type ContactTopic = keyof typeof CONTACT_EMAILS;
