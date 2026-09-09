import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Moja podešavanja — Fudaristo" };

export default async function PodesavanjaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/podesavanja");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("team_name, team_color, favorite_club_id")
    .eq("id", user.id)
    .single();

  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, name, primary_color")
    .order("name");

  return (
    <div className="max-w-lg">
      <h2 className="font-display text-2xl mb-1">Moja podešavanja</h2>
      <p className="text-slate-400 text-sm mb-6">
        Ime i boja tima se prikazuju drugim igračima na tabeli lige.
      </p>
      <SettingsForm
        userId={user.id}
        teamName={profile?.team_name ?? ""}
        teamColor={profile?.team_color ?? "#E8B33D"}
        favoriteClubId={profile?.favorite_club_id ?? null}
        clubs={clubs ?? []}
      />
    </div>
  );
}
