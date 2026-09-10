"use client";

import { useTranslations, useLocale } from "next-intl";
import { navigateAfterAuth, resolveAuthRedirect } from "@/lib/auth-redirect";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Club = { id: string; name: string };

const PRESET_COLORS = ["#E8B33D", "#3FA46A", "#E2574C", "#4A90D9", "#9B59B6"];

export function RegisterForm({ clubs }: { clubs: Club[] }) {
  const t = useTranslations("register");
  const locale = useLocale();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamColor, setTeamColor] = useState(PRESET_COLORS[0]);
  const [favoriteClubId, setFavoriteClubId] = useState(clubs[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Brz fidbek pre signUp-a (baza i dalje enforce-uje UNIQUE kao backstop)
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
        data: {
          team_name: teamName,
          team_color: teamColor,
          favorite_club_id: favoriteClubId,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // signUp sam po sebi ne pravi red u public.users — to je odvojena tabela
    // sa fantasy poljima (budžet, tim, itd.). Od migracije 003 to radi trigger
    // on_auth_user_created, u istoj transakciji kao i signUp, pa korisnik ne
    // može više da završi sa auth nalogom bez profila ako ovaj drugi zahtev
    // padne. Ovaj upis ostaje kao fallback ako migracija još nije pokrenuta —
    // ignoreDuplicates znači da ne smeta kad je trigger već odradio posao.
    const { error: profileError } = await supabase
      .from("users")
      .upsert(
        {
          id: signUpData.user!.id,
          team_name: teamName,
          team_color: teamColor,
          favorite_club_id: favoriteClubId,
        },
        { onConflict: "id", ignoreDuplicates: true }
      );

    if (profileError) {
      setError(t("profileFailed", { message: profileError.message }));
      setLoading(false);
      return;
    }

    navigateAfterAuth(resolveAuthRedirect(null, locale));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p className="text-danger-400 text-sm bg-danger-400/10 px-3 py-2 rounded">
          {error}
        </p>
      )}

      <label className="flex flex-col gap-1.5 text-sm">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-chalk-50"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        Lozinka
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-chalk-50"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        Naziv tvog kluba
        <input
          type="text"
          required
          minLength={3}
          maxLength={30}
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="npr. Olimpos United"
          className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-chalk-50"
        />
      </label>

      <div className="flex flex-col gap-1.5 text-sm">
        Boja kluba
        <div className="flex gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setTeamColor(c)}
              className="w-8 h-8 rounded-full border-2 transition-colors"
              style={{
                backgroundColor: c,
                borderColor: teamColor === c ? "#F4F6F8" : "transparent",
              }}
              aria-label={`Izaberi boju ${c}`}
            />
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        Omiljeni klub
        <select
          required
          value={favoriteClubId}
          onChange={(e) => setFavoriteClubId(e.target.value)}
          className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-chalk-50"
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
        disabled={loading || clubs.length === 0}
        className="bg-gold-400 text-navy-950 font-bold text-sm px-6 py-3 rounded-lg disabled:opacity-50"
      >
        {loading ? "Kreiram klub..." : "Napravi klub"}
      </button>
    </form>
  );
}
