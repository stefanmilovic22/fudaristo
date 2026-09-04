import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// Koristi se u Server Components, Server Actions i Route Handlers.
// Čita/piše auth kolačiće preko Next.js cookies() API-ja da sesija
// ostane sinhronizovana između klijenta i servera.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll pozvan iz Server Component-a bez middleware-a koji
            // osvežava sesiju — bezbedno je ignorisati ako middleware.ts
            // već radi refresh (videti middleware.ts u root-u).
          }
        },
      },
    }
  );
}

// Poseban klijent za admin/cron operacije — zaobilazi RLS.
// NIKAD ne importuj ovo u kod koji se izvršava u browseru.
export function createServiceRoleClient() {
  const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
