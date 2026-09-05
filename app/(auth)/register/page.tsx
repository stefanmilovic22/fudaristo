import { createClient } from "@/lib/supabase/server";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  const supabase = await createClient();
  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="max-w-md mx-auto py-8">
      <h2 className="font-display text-2xl mb-2">Napravi svoj klub</h2>
      <p className="text-slate-400 text-sm mb-6">
        Traje manje od minuta — bez email verifikacije.
      </p>
      {(!clubs || clubs.length === 0) && (
        <p className="text-danger-400 text-sm mb-4">
          Nema klubova u bazi još — pokreni <code>faza1-run-in-supabase.sql</code> u
          Supabase SQL Editor-u pre registracije.
        </p>
      )}
      <RegisterForm clubs={clubs ?? []} />
    </div>
  );
}
