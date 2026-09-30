import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { localePath } from "@/lib/locale-path";
import { createClient } from "@/lib/supabase/server";
import { getClubsCached } from "@/lib/cached-data";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { SettingsForm } from "./settings-form";

export default async function PodesavanjaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("settings");

  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) {
    redirect(await localePath("/login?redirect=/podesavanja"));
  }

  const [{ data: profile }, clubs] = await Promise.all([
    supabase
      .from("users")
      .select("team_name, team_color, favorite_club_id")
      .eq("id", user.id)
      .single(),
    getClubsCached(),
  ]);

  return (
    <div className="max-w-lg">
      <h2 className="font-display text-2xl mb-1">{t("title")}</h2>
      <p className="text-slate-400 text-sm mb-6">
        {t("subtitle")}
      </p>
      <SettingsForm
        userId={user.id}
        teamName={profile?.team_name ?? ""}
        teamColor={profile?.team_color ?? "#E8B33D"}
        favoriteClubId={profile?.favorite_club_id ?? null}
        clubs={clubs}
      />
    </div>
  );
}
