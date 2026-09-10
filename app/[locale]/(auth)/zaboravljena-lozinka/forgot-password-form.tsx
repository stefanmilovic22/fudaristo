"use client";

import { useState, type FormEvent } from "react";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const supabase = createClient();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Ruta /auth/potvrda vraća ovamo kad link ne valja (istekao, već iskorišćen,
  // ili je mejl klijent prepolovio URL).
  const linkError = searchParams.get("greska") === "link";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      // Supabase prvo proverava token na svojoj strani, pa preusmerava OVDE sa
      // kodom u query stringu. Origin se čita iz pregledača da isti kod radi i
      // lokalno i na produkciji bez podešavanja.
      redirectTo: `${window.location.origin}/auth/potvrda`,
    });

    setLoading(false);

    if (resetError) {
      // Jedina greška koja ovde realno stiže je prekoračenje limita slanja.
      // Nepostojeći email NE pravi grešku — i to je namerno, videti ispod.
      setError(
        resetError.status === 429
          ? t("tooManyAttempts")
          : t("sendFailed")
      );
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div className="bg-navy-800 border border-navy-600 rounded-lg p-5 text-sm">
        <p className="text-chalk-50 font-semibold mb-2">{t("checkMail")}</p>
        <p className="text-slate-300 leading-relaxed">
          {t.rich("checkMailBody", {
            email: email.trim(),
            b: (chunks) => <span className="text-chalk-50">{chunks}</span>,
          })}
        </p>
        <p className="text-slate-500 text-xs mt-3">{t("checkSpam")}</p>
        <Link href="/login" className="inline-block mt-4 text-gold-300 font-semibold">
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {linkError && (
        <p className="text-danger-400 text-sm bg-danger-400/10 px-3 py-2 rounded">
          {t("linkInvalid")}
        </p>
      )}
      {error && (
        <p className="text-danger-400 text-sm bg-danger-400/10 px-3 py-2 rounded">{error}</p>
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

      <button
        type="submit"
        disabled={loading}
        className="bg-gold-400 text-navy-950 font-bold text-sm px-6 py-3 rounded-lg disabled:opacity-50"
      >
        {loading ? t("sending") : t("sendLink")}
      </button>

      <Link href="/login" className="text-slate-400 text-sm hover:text-chalk-50">
        ← {t("backToLogin")}
      </Link>
    </form>
  );
}
