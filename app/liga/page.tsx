import { createClient } from "@/lib/supabase/server";

export default async function LigaPage() {
  const supabase = await createClient();
  // Faza 9: koristi v_global_league_standings view iz schema.sql
  const { data, error } = await supabase
    .from("v_global_league_standings")
    .select("*")
    .limit(20);

  return (
    <div>
      <h2 className="font-display text-2xl mb-4">Globalna liga</h2>
      {error && (
        <p className="text-danger-400 text-sm">
          Baza još nije povezana ili tabele ne postoje — pokreni schema.sql (Faza 0, korak 4).
        </p>
      )}
      {!error && (!data || data.length === 0) && (
        <p className="text-slate-400">Još nema korisnika u ligi.</p>
      )}
      {!error && data && data.length > 0 && (
        <ul className="text-slate-300 text-sm">
          {data.map((row: any) => (
            <li key={row.user_id}>
              #{row.rank} — {row.team_name} — {row.total_points} pts
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
