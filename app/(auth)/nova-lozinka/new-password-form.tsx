"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function NewPasswordForm() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Provera se radi ovde, a ne preko `required`, da poruka bude na srpskom i
    // da se ne troši mrežni poziv na nešto što se vidi odmah.
    if (password !== confirm) {
      setError("Lozinke se ne poklapaju.");
      return;
    }
    if (password.length < 6) {
      setError("Lozinka mora imati bar 6 znakova.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setLoading(false);
      setError(
        updateError.message.includes("should be different")
          ? "Nova lozinka mora da se razlikuje od stare."
          : "Lozinka nije promenjena. Zatraži novi link i pokušaj ponovo."
      );
      return;
    }

    // Odjavljuju se SVE ostale sesije. Ako je neko tražio reset zato što mu je
    // nalog kompromitovan, promena lozinke sama po sebi ne izbacuje uljeza —
    // njegov token bi i dalje važio. Trenutna sesija ostaje.
    await supabase.auth.signOut({ scope: "others" });

    router.push("/moj-tim");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p className="text-danger-400 text-sm bg-danger-400/10 px-3 py-2 rounded">{error}</p>
      )}

      <label className="flex flex-col gap-1.5 text-sm">
        Nova lozinka
        <input
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-chalk-50"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        Ponovi lozinku
        <input
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-chalk-50"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="bg-gold-400 text-navy-950 font-bold text-sm px-6 py-3 rounded-lg disabled:opacity-50"
      >
        {loading ? "Čuvam…" : "Sačuvaj lozinku"}
      </button>

      <p className="text-slate-500 text-xs">
        Čuvanjem lozinke odjavljuju se svi ostali uređaji.
      </p>
    </form>
  );
}
