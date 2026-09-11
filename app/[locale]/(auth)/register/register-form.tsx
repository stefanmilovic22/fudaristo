"use client";

import { useState, type FormEvent } from "react";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/PasswordField";
import { navigateAfterAuth, resolveAuthRedirect } from "@/lib/auth-redirect";

type Club = { id: string; name: string };

const PRESET_COLORS = ["#E8B33D", "#3FA46A", "#E2574C", "#4A90D9", "#9B59B6"];

export function RegisterForm({ clubs }: { clubs: Club[] }) {
  const t = useTranslations("register");
  const tAuth = useTranslations("auth");
  const locale = useLocale();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamColor, setTeamColor] = useState(PRESET_COLORS[0]);
  const [favoriteClubId, setFavoriteClubId] = useState(clubs[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

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

    // Brz fidbek pre signUp-a; UNIQUE u bazi je i dalje pravi čuvar.
    const { count } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("team_name", teamName);

    if (count && count > 0) {
      setError(t("nameTaken"));
      setLoading(false);
      return;
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Bez ovoga Supabase u mejl stavlja svoj "Site URL", a on je i dalje
        // http://localhost:3000 — na telefonu to znači sam telefon, pa potvrda
        // pada na ERR_CONNECTION_REFUSED. Origin iz pregledača radi i lokalno
        // i na produkciji, bez podešavanja po okruženju.
        emailRedirectTo: `${window.location.origin}/auth/potvrda?next=/moj-tim`,
        // Trigger on_auth_user_created (migracija 003) čita ove vrednosti iz
        // raw_user_meta_data i od njih pravi red u public.users.
        data: {
          team_name: teamName,
          team_color: teamColor,
          favorite_club_id: favoriteClubId,
        },
      },
    });

    if (signUpError) {
      // Ako trigger padne na UNIQUE ograničenju imena, Supabase to vrati kao
      // uopšteno "Database error saving new user" — bez ovoga bi korisnik
      // dobio poruku iz koje se ne vidi šta da promeni.
      const raw = signUpError.message.toLowerCase();
      setError(
        raw.includes("database error") || raw.includes("duplicate")
          ? t("nameTakenDb")
          : signUpError.message
      );
      setLoading(false);
      return;
    }

    // NAMERNO nema upisa u public.users odavde.
    //
    // Ranije je ovde stajao upsert kao rezerva ako trigger nije postavljen. On
    // je bio uzrok greške "new row violates row-level security policy for table
    // users": `ignoreDuplicates` se prevodi u ON CONFLICT DO NOTHING, ali RLS
    // proveru Postgres radi PRE razrešavanja konflikta. Politika traži
    // auth.uid() = id, a kad je u Supabase-u uključena potvrda mejla, signUp NE
    // vraća sesiju — zahtev ide kao anoniman, auth.uid() je NULL i provera pada.
    // Red je pri tome već postojao, napravio ga je trigger u istoj transakciji.

    if (!signUpData.session) {
      // Nema sesije = uključena je potvrda mejla. Preusmeravanje na /moj-tim bi
      // ga middleware odmah vratio na /login, bez objašnjenja.
      setNeedsConfirmation(true);
      setLoading(false);
      return;
    }

    navigateAfterAuth(resolveAuthRedirect(null, locale));
  }

  if (needsConfirmation) {
    return (
      <div className="bg-navy-800 border border-navy-600 rounded-lg p-5 text-sm">
        <p className="text-chalk-50 font-semibold mb-2">{t("confirmEmailTitle")}</p>
        <p className="text-slate-300 leading-relaxed">
          {t.rich("confirmEmailBody", {
            email: email.trim(),
            b: (chunks) => <span className="text-chalk-50">{chunks}</span>,
          })}
        </p>
      </div>
    );
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
        <div className="flex gap-2">
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
