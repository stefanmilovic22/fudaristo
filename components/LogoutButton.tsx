"use client";

import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { navigateAfterAuth, resolveAuthRedirect } from "@/lib/auth-redirect";

export function LogoutButton() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    // Puna navigacija iz istog razloga kao kod prijave: server mora da iscrta
    // stranicu BEZ sesije, a klijentski keš rutera bi i dalje držao staru.
    navigateAfterAuth(resolveAuthRedirect(null, locale, "/login"));
  }

  return (
    <button
      onClick={handleLogout}
      className="text-xs text-slate-400 hover:text-chalk-50 transition-colors"
    >
      {t("logout")}
    </button>
  );
}
