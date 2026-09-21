"use client";

import { useState, type FormEvent } from "react";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/PasswordField";
import { registerAction } from "./actions";
import { useRecaptcha } from "@/lib/use-recaptcha";
import { navigateAfterAuth, resolveAuthRedirect } from "@/lib/auth-redirect";

type Club = { id: string; name: string };

const PRESET_COLORS = [
  "#E8B33D",
  "#3FA46A",
  "#E2574C",
  "#4A90D9",
  "#9B59B6",
  "#26A69A",
  "#E8873D",
  "#E0629B",
  "#A3C94A",
  "#7A8CA3",
];

export function RegisterForm({ clubs }: { clubs: Club[] }) {
  const t = useTranslations("register");
  const tAuth = useTranslations("auth");
  const { execute: executeRecaptcha } = useRecaptcha();
  const locale = useLocale();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamColor, setTeamColor] = useState(PRESET_COLORS[0]);
  const isCustomColor = !PRESET_COLORS.includes(teamColor);
  const [favoriteClubId, setFavoriteClubId] = useState(clubs[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Provera pre bilo kakvog mrežnog poziva — greška u kucanju lozinke se
    // vidi odmah, bez čekanja na odgovor servera.
    if (password !== passwordConfirm) {
      setError(tAuth("passwordsDiffer"));
      return;
    }

    setLoading(true);

    // Akcija ("registracija") se proverava i na serveru — bez toga bi token
    // uzet sa bilo koje druge stranice prošao i ovde.
    const recaptchaToken = await executeRecaptcha("registracija");

    // Nalog pravi server (admin API), bez ijednog mejla — videti actions.ts.
    // Sve provere se tamo ponavljaju; ove ovde su samo za brz odgovor.
    const result = await registerAction({
      email,
      password,
      teamName,
      teamColor,
      favoriteClubId,
      recaptchaToken,
    });

    if (!result.ok) {
      const messages = {
        invalid: t("invalidInput"),
        nameTaken: t("nameTaken"),
        emailTaken: t("emailTaken"),
        throttled: t("throttled"),
        captcha: t("captchaFailed"),
        failed: result.detail ?? t("signUpFailed"),
      } as const;
      setError(messages[result.reason]);
      setLoading(false);
      return;
    }

    // Nalog je već potvrđen, pa prijava prolazi odmah — nema ekrana
    // "potvrdi mejl" i nema čekanja.
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(t("signInFailed"));
      setLoading(false);
      return;
    }

    navigateAfterAuth(resolveAuthRedirect(null, locale));
  }

  const inputClass =
    "bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-chalk-50 focus:border-gold-400 focus:outline-none";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          className={inputClass}
        />
      </label>

      <PasswordField
        label={t("password")}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        minLength={6}
      />

      <div>
        <PasswordField
          label={t("repeatPassword")}
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          autoComplete="new-password"
          minLength={6}
          // Crveno tek kad je drugo polje počelo da se popunjava — inače bi
          // svetlelo dok korisnik još kuca prvi znak.
          invalid={passwordConfirm.length > 0 && password !== passwordConfirm}
          describedBy="lozinka-pomoc"
        />
        {passwordConfirm.length > 0 && password !== passwordConfirm && (
          <p id="lozinka-pomoc" className="text-danger-400 text-xs mt-1.5">
            {tAuth("repeatPasswordHint")}
          </p>
        )}
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        {t("teamName")}
        <input
          type="text"
          required
          minLength={3}
          maxLength={30}
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder={t("teamNamePlaceholder")}
          className={inputClass}
        />
      </label>

      <div className="flex flex-col gap-1.5 text-sm">
        {t("teamColor")}
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setTeamColor(c)}
              className="w-9 h-9 rounded-full border-2 transition-colors"
              style={{
                backgroundColor: c,
                borderColor: teamColor === c ? "#F4F6F8" : "transparent",
              }}
              aria-pressed={teamColor === c}
              aria-label={t("pickColor", { color: c })}
            />
          ))}

          {/* Neograničena paleta: nativni color-input je nevidljiv preko
              cele pločice, samo se vidi trenutno izabrana boja (ili "+" dok
              još nije korišćen) — isti obrazac kao npr. GitHub label boje. */}
          <label
            className="relative w-9 h-9 rounded-full border-2 grid place-items-center cursor-pointer overflow-hidden transition-colors"
            style={{
              backgroundColor: isCustomColor ? teamColor : "#1C2E4A",
              borderColor: isCustomColor ? "#F4F6F8" : "#4A566B",
            }}
            title={t("customColor")}
          >
            {!isCustomColor && (
              <span className="text-slate-300 text-base leading-none" aria-hidden>
                +
              </span>
            )}
            <input
              type="color"
              value={teamColor}
              onChange={(e) => setTeamColor(e.target.value)}
              aria-label={t("customColor")}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        {t("favoriteClub")}
        <select
          required
          value={favoriteClubId}
          onChange={(e) => setFavoriteClubId(e.target.value)}
          className={inputClass}
        >
          {clubs.length === 0 && <option value="">{t("noClubsOption")}</option>}
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={loading || clubs.length === 0 || password !== passwordConfirm}
        className="bg-gold-400 text-navy-950 font-bold text-sm px-6 py-3 rounded-lg disabled:opacity-50"
      >
        {loading ? t("creatingClub") : t("createClub")}
      </button>
    </form>
  );
}
