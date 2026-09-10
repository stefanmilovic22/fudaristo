"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const supabase = createClient();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Ruta /auth/potvrda vraća ovamo kad link ne valja (istekao, već iskorišćen,
  // ili je mejl klijent prepolovio URL).
  const linkError = searchParams.get("greska") === "link";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      // Supabase prvo proverava token na svojoj strani, pa preusmerava OVDE sa
      // kodom u query stringu. Origin se čita iz pregledača da isti kod radi i
      // lokalno i na produkciji bez podešavanja.
      redirectTo: `${window.location.origin}/auth/potvrda`,
    });

    setLoading(false);

    if (resetError) {
      // Jedina greška koja ovde realno stiže je prekoračenje limita slanja.
      // Nepostojeći email NE pravi grešku — i to je namerno, videti ispod.
      setError(
        resetError.status === 429
          ? "Previše pokušaja. Sačekaj koji minut pa probaj ponovo."
          : "Slanje nije uspelo. Pokušaj ponovo za koji minut."
      );
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div className="bg-navy-800 border border-navy-600 rounded-lg p-5 text-sm">
        <p className="text-chalk-50 font-semibold mb-2">Proveri poštu.</p>
        <p className="text-slate-300 leading-relaxed">
          Ako postoji nalog sa adresom <span className="text-chalk-50">{email.trim()}</span>,
          stigao je link za novu lozinku. Važi jedan sat i može se iskoristiti jednom.
        </p>
        <p className="text-slate-500 text-xs mt-3">
          Ne vidiš poruku? Pogledaj i neželjenu poštu.
        </p>
        <Link href="/login" className="inline-block mt-4 text-gold-300 font-semibold">
          Nazad na prijavu
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {linkError && (
        <p className="text-danger-400 text-sm bg-danger-400/10 px-3 py-2 rounded">
          Link nije važeći ili mu je isteklo vreme. Zatraži novi ispod.
        </p>
      )}
      {error && (
        <p className="text-danger-400 text-sm bg-danger-400/10 px-3 py-2 rounded">{error}</p>
      )}

      <label className="flex flex-col gap-1.5 text-sm">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-chalk-50"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="bg-gold-400 text-navy-950 font-bold text-sm px-6 py-3 rounded-lg disabled:opacity-50"
      >
        {loading ? "Šaljem…" : "Pošalji link"}
      </button>

      <Link href="/login" className="text-slate-400 text-sm hover:text-chalk-50">
        ← Nazad na prijavu
      </Link>
    </form>
  );
}
