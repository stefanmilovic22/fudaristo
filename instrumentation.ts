/**
 * Next poziva onRequestError za SVAKU neuhvaćenu grešku na serveru (stranice,
 * server akcije, rute) — ovde ih prosleđujemo praćenju (lib/monitor.ts).
 * Radi samo u Node okruženju; Edge (middleware) nema pristup servisnom ključu.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string }
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportEvent } = await import("@/lib/monitor");
  const e = err as { message?: string; digest?: string; stack?: string };
  await reportEvent({
    level: "error",
    source: `server:${context.routeType}:${context.routePath}`,
    message: e?.message ?? String(err),
    details: { path: request.path, method: request.method, digest: e?.digest, stack: e?.stack?.slice(0, 1500) },
  });
}
