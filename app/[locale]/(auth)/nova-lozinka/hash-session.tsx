"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Sesija iz linka za reset lozinke stiže u HASH delu adrese
 * (#access_token=...&refresh_token=...) — server je ne vidi. Ovde se upisuje u
 * kolačiće, pa se stranica učita ponovo da je server prepozna.
 *
 * Dok se hash proverava, sadržaj je sakriven (isti HTML na serveru i u prvom
 * renderu, pa nema greške hidratacije); bez hash-a se odmah prikazuje.
 */
export function HashSession({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) {
      setChecking(false);
      return;
    }
    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) {
          setChecking(false);
          return;
        }
        // Bez hash-a, da token ne ostane u adresi i istoriji.
        window.location.replace(window.location.pathname + window.location.search);
      })
      .catch(() => setChecking(false));
  }, []);

  return <div style={{ visibility: checking ? "hidden" : "visible" }}>{children}</div>;
}
