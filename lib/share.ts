import { routing } from "@/i18n/routing";

/** Putanja do javne stranice tima, sa prefiksom jezika kad nije podrazumevani. */
export function teamPath(userId: string, locale: string) {
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  return `${prefix}/tim/${userId}`;
}

export function normalizeLang(raw: string | null | undefined): "en" | "sr" | "el" {
  return (routing.locales as readonly string[]).includes(raw ?? "") ? (raw as "en" | "sr" | "el") : routing.defaultLocale;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
