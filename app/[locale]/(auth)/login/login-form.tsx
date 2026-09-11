"use client";

import { useState, type FormEvent } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/PasswordField";
import { navigateAfterAuth, resolveAuthRedirect } from "@/lib/auth-redirect";

export function LoginForm() {
  const searchParams = useSearchParams();
  const locale = useLocale();

  // Ruta /auth/potvrda vraća ovamo kad link iz mejla ne valja — bez ovoga bi
  // korisnik samo video formu za prijavu, bez ijedne reči zašto.
  const linkError = searchParams.get("greska");
  const t = useTranslations("auth");
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(t("wrongCredentials"));
      setLoading(false);
      return;
    }

    // `loading` se namerno NE vraća na false — stranica odlazi.
    navigateAfterAuth(resolveAuthRedirect(searchParams.get("redirect"), locale));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {linkError && !error && (
        <p className="text-danger-400 text-sm bg-danger-400/10 px-3 py-2 rounded">
          {linkError === "link-istekao" ? t("linkExpired") : t("linkBroken")}
        </p>
      )}
      {error && (
        <p className="text-danger-400 text-sm bg-danger-400/10 px-3 py-2 rounded">
          {error}
        </p>
      )}

      <label className="flex flex-col gap-1.5 text-sm">
        {t("email")}
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-chalk-50"
        />
      </label>

      <PasswordField
        label={t("password")}
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        labelSuffix={
          <Link
            href="/zaboravljena-lozinka"
            className="text-xs font-semibold text-slate-400 hover:text-gold-300"
          >
            {t("forgot")}
          </Link>
        }
      />

      <button
        type="submit"
        disabled={loading}
        className="bg-gold-400 text-navy-950 font-bold text-sm px-6 py-3 rounded-lg disabled:opacity-50"
      >
        {loading ? t("signingIn") : t("signIn")}
      </button>
    </form>
  );
}
