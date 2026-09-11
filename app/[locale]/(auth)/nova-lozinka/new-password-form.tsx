"use client";

import { useState, type FormEvent } from "react";
import { useTranslations, useLocale } from "next-intl";
import { navigateAfterAuth, resolveAuthRedirect } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/PasswordField";

export function NewPasswordForm() {
  const locale = useLocale();
  const t = useTranslations("auth");
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Provera se radi ovde, a ne preko `required`, da poruka bude na srpskom i
    // da se ne troši mrežni poziv na nešto što se vidi odmah.
    if (password !== confirm) {
      setError(t("passwordsDiffer"));
      return;
    }
    if (password.length < 6) {
      setError(t("passwordTooShort"));
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setLoading(false);
      setError(
        updateError.message.includes("should be different")
          ? t("passwordSame")
          : t("passwordFailed")
      );
      return;
    }

    // Odjavljuju se SVE ostale sesije. Ako je neko tražio reset zato što mu je
    // nalog kompromitovan, promena lozinke sama po sebi ne izbacuje uljeza —
    // njegov token bi i dalje važio. Trenutna sesija ostaje.
    await supabase.auth.signOut({ scope: "others" });

    navigateAfterAuth(resolveAuthRedirect(null, locale));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p className="text-danger-400 text-sm bg-danger-400/10 px-3 py-2 rounded">{error}</p>
      )}

      <PasswordField
        label={t("newPassword")}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        minLength={6}
      />

      <div>
        <PasswordField
          label={t("repeatPassword")}
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          minLength={6}
          invalid={confirm.length > 0 && password !== confirm}
          describedBy="nova-lozinka-pomoc"
        />
        {confirm.length > 0 && password !== confirm && (
          <p id="nova-lozinka-pomoc" className="text-danger-400 text-xs mt-1.5">
            {t("repeatPasswordHint")}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || password !== confirm}
        className="bg-gold-400 text-navy-950 font-bold text-sm px-6 py-3 rounded-lg disabled:opacity-50"
      >
        {loading ? t("saving") : t("savePassword")}
      </button>

      <p className="text-slate-500 text-xs">
        {t("signsOutOthers")}
      </p>
    </form>
  );
}
