import { FIRA_600_BASE64, FIRA_700_BASE64 } from "@/lib/og/fonts-data";

/**
 * Fira Sans Extra Condensed (isti naslovni font kao na sajtu) za slike koje
 * pravi ImageResponse. ImageResponse ne zna da povuče next/font, a čitanje
 * fajlova sa diska nije pouzdano na Vercel-u (fajl ne uđe u funkciju) — zato
 * je font ugrađen kao base64 u fonts-data.ts. Pokriva latinicu, ćirilicu i grčki.
 */
type OgFont = { name: string; data: ArrayBuffer; weight: 600 | 700; style: "normal" };

function decode(b64: string): ArrayBuffer {
  const buf = Buffer.from(b64, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

let fonts: OgFont[] | null = null;

export function getOgFonts(): OgFont[] {
  fonts ??= [
    { name: "Fira", data: decode(FIRA_600_BASE64), weight: 600, style: "normal" },
    { name: "Fira", data: decode(FIRA_700_BASE64), weight: 700, style: "normal" },
  ];
  return fonts;
}
