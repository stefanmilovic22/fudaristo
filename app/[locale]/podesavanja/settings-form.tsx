"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

type Club = { id: string; name: string; primary_color: string };

export function SettingsForm({
  userId,
  teamName: initialName,
  teamColor: initialColor,
  favoriteClubId: initialClub,
  clubs,
}: {
  userId: string;
  teamName: string;
  teamColor: string;
  favoriteClubId: string | null;
  clubs: Club[];
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const supabase = createClient();

  const [teamName, setTeamName] = useState(initialName);
  const [teamColor, setTeamColor] = useState(initialColor);
  const [favoriteClubId, setFavoriteClubId] = useState<string | null>(initialClub);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    teamName !== initialName || teamColor !== initialColor || favoriteClubId !== initialClub;

  async function save() {
    if (!teamName.trim()) {
      setError(t("nameEmpty"));
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);

    // Ove tri kolone su jedine na kojima korisnik ima UPDATE pravo (migracija
    // 003) — budžet, poeni i is_admin menja isključivo sistem.
    const { error: updateError } = await supabase
      .from("users")
      .update({
        team_name: teamName.trim(),
        team_color: teamColor,
        favorite_club_id: favoriteClubId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      setError(
        updateError.code === "23505"
          ? t("nameTaken")
          : updateError.message
      );
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  const inputClass =
    "bg-navy-900/60 border border-navy-600 rounded-lg px-3 py-2.5 text-chalk-50 focus:border-gold-400 focus:outline-none w-full";

  return (
    <div className="bg-navy-800 rounded-xl ring-1 ring-black/25 p-5 flex flex-col gap-5">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-slate-300">Ime tima</span>
        <input
          value={teamName}
          onChange={(e) => {
            setTeamName(e.target.value);
            setSaved(false);
          }}
          maxLength={40}
          className={inputClass}
        />
      </label>

      <div className="flex flex-col gap-1.5 text-sm">
        <span className="text-slate-300">Boja tima</span>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={teamColor}
            onChange={(e) => {
              setTeamColor(e.target.value);
              setSaved(false);
            }}
            className="w-12 h-11 rounded-lg bg-navy-900/60 border border-navy-600 cursor-pointer"
            aria-label="Boja tima"
          />
          <span
            className="w-11 h-11 rounded-full flex items-center justify-center font-display font-bold text-navy-950"
            style={{ backgroundColor: teamColor }}
          >
            {(teamName || "??").slice(0, 2).toUpperCase()}
          </span>
          <span className="text-slate-400 text-xs">Ovako izgleda grb tvog tima.</span>
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-slate-300">Omiljeni klub</span>
        <select
          value={favoriteClubId ?? ""}
          onChange={(e) => {
            setFavoriteClubId(e.target.value || null);
            setSaved(false);
          }}
          className={inputClass}
        >
          <option value="">Bez omiljenog kluba</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-slate-400 text-xs">
          {t("favoriteNote")}
        </span>
      </label>

      {error && <p className="text-danger-400 text-sm">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="bg-gold-400 text-navy-950 font-bold text-sm px-5 py-2.5 rounded-lg disabled:opacity-40"
        >
          {saving ? tCommon("saving") : t("save")}
        </button>
        {saved && !dirty && <span className="text-gold-300 text-sm">{t("saved")}</span>}
      </div>
    </div>
  );
}
