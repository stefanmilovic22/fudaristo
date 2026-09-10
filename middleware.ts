import { createServerClient, type CookieOptions } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

// Zaštićene rute — zahtevaju login. Javne (liga, statistike, raspored,
// tim/[id]) namerno NISU ovde: GDD sekcija 9 kaže da su vidljive svima.
const PROTECTED_PREFIXES = ["/moj-tim", "/transferi", "/admin"];

/**
 * Skida prefiks jezika sa putanje pre provere zaštite.
 *
 * Bez ovoga bi /sr/moj-tim prošao neproverem, jer ne počinje sa "/moj-tim" —
 * tiha rupa u kojoj bi zaštićena stranica bila dostupna svakome ko doda
 * prefiks jezika. Provera se radi nad putanjom BEZ prefiksa.
 */
function stripLocale(pathname: string) {
  const segments = pathname.split("/");
  if (segments.length > 1 && (routing.locales as readonly string[]).includes(segments[1])) {
    return "/" + segments.slice(2).join("/");
  }
  return pathname;
}

function isProtectedPath(pathname: string) {
  const bare = stripLocale(pathname);
  return PROTECTED_PREFIXES.some((prefix) => bare === prefix || bare.startsWith(prefix + "/"));
}

function redirectToLogin(request: NextRequest) {
  // Prefiks jezika se čuva da korisnik posle prijave ostane na svom jeziku.
  const segments = request.nextUrl.pathname.split("/");
  const prefix =
    segments.length > 1 && (routing.locales as readonly string[]).includes(segments[1])
      ? `/${segments[1]}`
      : "";
  const loginUrl = new URL(`${prefix}/login`, request.url);
  loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

/**
 * Middleware hvata SVE rute, pa svaka greška ovde ruši ceo sajt sa
 * MIDDLEWARE_INVOCATION_FAILED — ne samo stranicu u pitanju. Zato ništa ovde
 * ne sme da baci izuzetak.
 *
 * Redosled je bitan: PRVO next-intl, koji odlučuje jezik i pravi odgovor sa
 * prepisanom putanjom, pa TEK ONDA Supabase, koji na taj isti odgovor kači
 * kolačiće sesije. Obrnuto bi značilo da intl napravi nov odgovor i baci
 * osvežene kolačiće — korisnik bi se povremeno odjavljivao bez razloga.
 */
export async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error(
      "[middleware] Nedostaje NEXT_PUBLIC_SUPABASE_URL i/ili NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Proveri Environment Variables na Vercel-u za OVO okruženje (Production/Preview) " +
        "i redeploy-uj — NEXT_PUBLIC_ varijable se ugrađuju u build."
    );
    return isProtectedPath(request.nextUrl.pathname) ? redirectToLogin(request) : response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (e) {
    console.error("[middleware] auth.getUser() je pukao:", e instanceof Error ? e.message : e);
    // user ostaje null → zaštićene rute idu na login, javne prolaze
  }

  if (isProtectedPath(request.nextUrl.pathname) && !user) {
    return redirectToLogin(request);
  }

  return response;
}

export const config = {
  matcher: [
    // Sve osim statike, API ruta i /auth/potvrda (link iz mejla — ne sme da
    // dobije prefiks jezika, jer je adresa upisana u Supabase podešavanjima).
    "/((?!api|auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
