"use client";

import { useEffect } from "react";
import { isStaleDeploymentError, STALE_DEPLOYMENT_MESSAGE } from "@/lib/stale-deployment";

/**
 * Granica greške za ceo admin deo.
 *
 * Obrasci na ovoj stranici koriste `action={serverAction}` (bez klijentskog
 * try/catch, da rade i bez JavaScript-a). Njihova greška završava ovde. Bez
 * ove datoteke korisnik dobija Next-ov podrazumevani ekran sa engleskim
 * tekstom i heksadecimalnim ID-jem akcije, iz kog se ne vidi šta da radi.
 *
 * Najčešći uzrok baš ovde je zastareo deploy: admin drži stranicu otvorenu,
 * ja objavim novu verziju, i prvi sledeći klik puca. Zato taj slučaj ima svoju
 * poruku i dugme.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const stale = isStaleDeploymentError(error);

  useEffect(() => {
    console.error("[admin]", error);
  }, [error]);

  return (
    <div className="max-w-2xl py-6">
      <h2 className="font-display text-2xl mb-3">
        {stale ? "Stranica je zastarela" : "Nešto je puklo"}
      </h2>

      <div className="bg-navy-800 border border-danger-400/40 rounded-lg p-5 text-sm">
        <p className="text-slate-300 leading-relaxed">
          {stale ? STALE_DEPLOYMENT_MESSAGE : error.message}
        </p>

        {!stale && error.digest && (
          <p className="text-slate-500 text-xs mt-3">
            Oznaka za log: <code>{error.digest}</code>
          </p>
        )}

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2 rounded-lg hover:bg-gold-300 transition-colors"
          >
            Osveži stranicu
          </button>

          {/* `reset` ponovo iscrtava isti segment bez punog učitavanja. Kod
              zastarelog deploya to NE pomaže — treba nov JavaScript — pa se
              nudi samo za ostale greške. */}
          {!stale && (
            <button
              type="button"
              onClick={reset}
              className="border border-navy-600 text-slate-300 font-semibold text-sm px-4 py-2 rounded-lg hover:text-chalk-50 transition-colors"
            >
              Pokušaj ponovo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
