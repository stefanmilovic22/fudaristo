"use server";

import { revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/supabase/current-user";

/**
 * Poziva se posle snimanja sastava / transfera: osvežava karticu „Najtraženiji
 * igrači" odmah, umesto da čeka isteku keša od 5 minuta (inače promena izgleda
 * kao da se nije desila). Samo za prijavljene i najviše jednom u 20 s po
 * instanci — keš se tako ne može nasumično rušiti, a osveženje ionako
 * obuhvata sve prethodne izmene.
 */
let lastRefresh = 0;
const MIN_GAP_MS = 20_000;

export async function refreshOwnershipAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const now = Date.now();
  if (now - lastRefresh < MIN_GAP_MS) return;
  lastRefresh = now;
  revalidateTag("ownership", { expire: 0 });
}
