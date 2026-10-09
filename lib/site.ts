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

/**
 * Društvene mreže. Za sada su upisane POČETNE STRANE mreža kao privremeno
 * rešenje (da se odeljak „Media” vidi); zameni ih punim URL-om naloga čim bude
 * otvoren. Prazno polje ("") sakriva tu mrežu. Primer:
 *   instagram: "https://www.instagram.com/fudaristo"
 */
export const SOCIAL_LINKS = {
  instagram: "https://www.instagram.com/", // TODO: zameni nalogom, npr. https://www.instagram.com/fudaristo
  facebook: "https://www.facebook.com/", // TODO: zameni stranicom
  x: "https://x.com/", // TODO: zameni nalogom
  tiktok: "https://www.tiktok.com/", // TODO: zameni nalogom
} as const;

export type SocialKey = keyof typeof SOCIAL_LINKS;
