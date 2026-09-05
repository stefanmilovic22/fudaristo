import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function MojTimPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/moj-tim");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("team_name, team_color, budget_remaining, favorite_club_id, clubs(name)")
    .eq("id", user.id)
    .single();

  const favoriteClubName = (profile?.clubs as unknown as { name: string } | null)?.name;

  return (
    <div>
      <h2 className="font-display text-2xl mb-4">Moj klub</h2>

      <div className="bg-navy-800 rounded-xl p-5 max-w-sm mb-6 flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center font-display font-bold text-navy-950 text-lg"
          style={{ backgroundColor: profile?.team_color ?? "#E8B33D" }}
        >
          {(profile?.team_name ?? "??").slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="font-display text-lg">{profile?.team_name}</div>
          <div className="text-slate-400 text-sm">
            Navija za: {favoriteClubName ?? "—"}
          </div>
          <div className="text-slate-400 text-sm">
            Budžet: {profile?.budget_remaining}M
          </div>
        </div>
      </div>

      <p className="text-slate-400">Pitch view i squad builder dolaze u Fazi 3.</p>
    </div>
  );
}
