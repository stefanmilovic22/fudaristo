import { routing } from "@/i18n/routing";

/**
 * Kuda ide korisnik posle prijave, registracije ili promene lozinke.
 *
 * DVA problema koja ovo rešava:
 *
 * 1. OTVORENO PREUSMERENJE. `?redirect=` dolazi iz adrese, pa je do sad bio
 *    proizvoljan string. `?redirect=https://tudji-sajt` bi odveo korisnika
 *    napolje odmah posle uspešne prijave — savršen mamac za phishing, jer se
 *    dešava na pravom domenu i posle pravog logina. Prima se samo putanja koja
 *    počinje jednom kosom crtom; `//tudji-sajt` je takođe adresa, ne putanja,
 *    pa i on pada.
 *
 * 2. GUBITAK JEZIKA. Podrazumevana putanja nema prefiks, pa bi korisnik sa
 *    /sr/login završio na engleskom. Prefiks se dodaje samo ako ga nema —
 *    `redirect` koji je postavio middleware ga već nosi.
 */
export function resolveAuthRedirect(
  raw: string | null,
  locale: string,
  fallback = "/moj-tim"
) {
  const isInternalPath = raw !== null && /^\/(?!\/)/.test(raw);
  const path = isInternalPath ? raw : fallback;

  const firstSegment = path.split("/")[1];
  if ((routing.locales as readonly string[]).includes(firstSegment)) return path;

  return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}

/**
 * Puna navigacija, ne `router.push`.
 *
 * `router.push()` praćen sa `router.refresh()` je izgledao ispravno ali je
 * ostavljao dugme zauvek u stanju "Prijavljujem...": refresh ponovo iscrta
 * TRENUTNU stranicu (zaglavlje se osveži i prikaže prijavljenog korisnika),
 * a push se pri tome odbaci — korisnik ostane na /login, a `setLoading(false)`
 * se nikad ne izvrši jer se očekivalo da stranica ode.
 *
 * Uz to, klijentska navigacija odmah posle prijave ume da stigne do
 * middleware-a pre nego što pregledač pošalje tek upisani kolačić sesije, pa
 * middleware vrati korisnika na /login — ista slika, drugi uzrok.
 *
 * Puna navigacija rešava oba: pregledač šalje kolačiće, server iscrta ciljanu
 * stranicu, a stanje dugmeta nestaje sa starom stranicom.
 */
export function navigateAfterAuth(path: string) {
  window.location.assign(path);
}
