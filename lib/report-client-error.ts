/**
 * Javlja grešku iz pregledača serveru (/api/report-error) — da znamo kad
 * korisniku pukne stranica, a ne samo kad nam on javi. Nikad ne baca: ako
 * prijava ne uspe, korisnik ne sme da dobije još jednu grešku povrh prve.
 */
export function reportClientError(error: Error & { digest?: string }) {
  try {
    const body = JSON.stringify({
      message: String(error?.message ?? "").slice(0, 500),
      stack: String(error?.stack ?? "").slice(0, 1500),
      digest: error?.digest ?? null,
      path: typeof window !== "undefined" ? window.location.pathname : null,
    });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/report-error", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/report-error", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
    }
  } catch {
    // namerno ćutimo
  }
}
