"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

/**
 * Poslednja linija odbrane: greška u samom korenskom layout-u (npr. pada
 * zaglavlje). Tu nema ni jezika ni stilova sajta, pa je poruka trojezična i
 * jednostavna.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0D1326",
          color: "#F4F6F8",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Fudaristo</h1>
          <p style={{ color: "#93ADCC", maxWidth: 420, lineHeight: 1.5 }}>
            Došlo je do greške. / Something went wrong. / Παρουσιάστηκε σφάλμα.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              background: "#5AB4FF",
              color: "#0D1326",
              fontWeight: 700,
              border: 0,
              borderRadius: 8,
              padding: "10px 18px",
              cursor: "pointer",
            }}
          >
            Retry · Pokušaj ponovo · Δοκίμασε ξανά
          </button>
        </div>
      </body>
    </html>
  );
}
