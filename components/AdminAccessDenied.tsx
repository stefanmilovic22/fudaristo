import Link from "next/link";
import type { AdminAccess } from "@/lib/admin-guard";

/**
 * Prikazuje se umesto admin panela kad korisnik nema prava. Ranije je ovo bilo
 * tiho `redirect("/moj-tim")` — korisnik bi kliknuo /admin i završio na svom
 * timu bez ijedne reči objašnjenja, pa je izgledalo kao da admin panel ne
 * postoji uopšte.
 *
 * SQL je namerno ispisan: `is_admin` niko ne može sam sebi da postavi
 * (migracija 003 oduzima UPDATE pravo na tu kolonu), pa je SQL Editor jedini
 * način — i to je lako zaboraviti mesecima posle setup-a.
 */
export function AdminAccessDenied({ access }: { access: Extract<AdminAccess, { ok: false }> }) {
  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl mb-1">Admin panel</h2>
      <p className="text-slate-400 text-sm mb-6">Nemaš pristup ovoj stranici.</p>

      {access.reason === "anon" && (
        <p className="text-slate-300 text-sm">
          Nisi prijavljen.{" "}
          <Link href="/login?redirect=/admin" className="text-gold-300 font-semibold">
            Prijavi se
          </Link>{" "}
          pa pokušaj ponovo.
        </p>
      )}

      {access.reason === "no_profile" && (
        <p className="text-slate-300 text-sm">
          Tvoj nalog nema profil u tabeli <code className="text-slate-400">users</code>. To se
          dešava samo ako je registracija prekinuta na pola — odjavi se i registruj ponovo.
        </p>
      )}

      {access.reason === "not_admin" && (
        <div className="bg-navy-800 border border-navy-600 rounded-lg p-5 text-sm">
          <p className="text-slate-300">
            Nalog{" "}
            <span className="font-semibold text-chalk-50">{access.teamName ?? "—"}</span> nema
            admin prava. Iz bezbednosnih razloga niko ne može sam sebi da postavi{" "}
            <code className="text-slate-400">is_admin</code> — kolona je zaključana na nivou
            privilegija (migracija 003), pa je ne mogu odobriti ni RLS politika ni ova
            aplikacija.
          </p>
          <p className="text-slate-300 mt-4">Postavlja se jednom, u Supabase SQL Editor-u:</p>
          <pre className="mt-2 bg-navy-950 border border-navy-700 rounded-md p-3 text-xs overflow-x-auto text-slate-300">
            {`update users set is_admin = true\n where team_name = '${access.teamName ?? "Tvoj Tim"}';`}
          </pre>
          <p className="text-slate-400 mt-4 text-xs">
            Posle toga osveži stranicu — link „Admin” će se pojaviti i u navigaciji.
          </p>
        </div>
      )}

      <p className="mt-6 text-sm">
        <Link href="/moj-tim" className="text-slate-400 hover:text-chalk-50">
          ← Nazad na moj klub
        </Link>
      </p>
    </div>
  );
}
