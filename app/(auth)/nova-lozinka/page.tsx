import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewPasswordForm } from "./new-password-form";

export const metadata = { title: "Nova lozinka — Fudaristo" };

/**
 * Ova stranica NIJE u PROTECTED_PREFIXES u middleware-u, i to je namerno:
 * korisnik ovamo stiže iz mejla, a middleware bi ga na osnovu odsustva sesije
 * poslao na /login pre nego što ruta /auth/potvrda stigne da upiše kolačiće.
 * Proveru radi sama stranica, posle razmene koda.
 */
export default async function NewPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-8">
        <h2 className="font-display text-2xl mb-2">Nova lozinka</h2>
        <div className="bg-navy-800 border border-navy-600 rounded-lg p-5 text-sm">
          <p className="text-slate-300 leading-relaxed">
            Ova stranica se otvara preko linka iz mejla. Link važi jedan sat i može se
            iskoristiti samo jednom — ako si ga već upotrebio ili je istekao, zatraži novi.
          </p>
          <Link
            href="/zaboravljena-lozinka"
            className="inline-block mt-4 text-gold-300 font-semibold"
          >
            Zatraži novi link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-8">
      <h2 className="font-display text-2xl mb-2">Nova lozinka</h2>
      <p className="text-slate-400 text-sm mb-6">
        Postavljaš novu lozinku za <span className="text-chalk-50">{user.email}</span>.
      </p>
      <NewPasswordForm />
    </div>
  );
}
