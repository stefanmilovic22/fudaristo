import { createBrowserClient } from "@supabase/ssr";

// Koristi se u Client Components ("use client"). Za Server Components i
// Route Handlers koristi lib/supabase/server.ts umesto ovog.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
