import { NextRequest, NextResponse } from "next/server";
import { reportEvent } from "@/lib/monitor";

/**
 * Pregledač javlja grešku koja je srušila stranicu (app/[locale]/error.tsx).
 * Javna ruta, pa je ograničena: najviše 4 KB tela i 8 prijava u minuti po IP
 * adresi (u memoriji instance — dovoljno protiv slučajnog spama; svaka prijava
 * ionako prolazi dedupe u monitor.ts).
 */
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_HITS = 8;

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_HITS) return new NextResponse(null, { status: 429 });
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 500) hits.clear();

  const raw = await request.text();
  if (raw.length > 4096) return new NextResponse(null, { status: 413 });

  try {
    const body = JSON.parse(raw) as Record<string, unknown>;
    await reportEvent({
      level: "error",
      source: "client",
      message: String(body.message ?? "unknown").slice(0, 300),
      details: {
        path: String(body.path ?? "").slice(0, 200),
        digest: body.digest ? String(body.digest).slice(0, 100) : null,
        stack: String(body.stack ?? "").slice(0, 1500),
        userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
      },
    });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  return new NextResponse(null, { status: 204 });
}
