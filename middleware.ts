import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Zaštićene rute — zahtevaju login. Javne rute (liga, statistike, tim/[id])
// namerno NISU ovde jer sekcija 9 GDD-a kaže da su javno vidljive svima.
const PROTECTED_PREFIXES = ["/moj-tim", "/transferi", "/admin"];

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

/**
 * Middleware hvata SVE rute (videti matcher dole), pa svaka greška ovde ruši
 * ceo sajt sa MIDDLEWARE_INVOCATION_FAILED — ne samo stranicu koja je u
 * pitanju. Zato ovde ništa ne sme da baci izuzetak.
 *
 * Ranije je bilo dva načina da pukne:
 *
 *   1. `process.env.NEXT_PUBLIC_SUPABASE_URL!` — uzvičnik je samo obećanje
 *      TypeScript-u, u runtime-u ne znači ništa. Ako varijabla nije podešena
 *      na Vercel-u (ili je dodata POSLE poslednjeg builda, ili postoji samo za
 *      Production a ovo je Preview deploy), createServerClient dobije
 *      undefined i baci — na svakom zahtevu, za svaku rutu.
 *
 *   2. `supabase.auth.getUser()` obično vraća grešku u objektu umesto da baca,
 *      ali mrežni prekid ka Supabase-u baca pravi izuzetak. Trenutni ispad
 *      Supabase-a je time obarao ceo sajt, uključujući javne stranice kojima
 *      auth uopšte ne treba.
 *
 * Ponašanje sad: kad auth ne radi, JAVNE rute se serviraju normalno, a
 * zaštićene idu na /login. Zatvaramo se, ne otvaramo — nepoznat korisnik nikad
 * ne prolazi kroz grešku.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error(
      "[middleware] Nedostaje NEXT_PUBLIC_SUPABASE_URL i/ili NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Proveri Environment Variables na Vercel-u za OVO okruženje (Production/Preview) " +
        "i redeploy-uj — NEXT_PUBLIC_ varijable se ugrađuju u build."
    );
    return isProtectedPath(request.nextUrl.pathname)
      ? redirectToLogin(request)
      : NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
