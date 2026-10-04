/**
 * Boja teksta čitljiva na datoj pozadini: tamna na svetlim bojama, bela na
 * tamnim (npr. crn grb PAOK-a dobija bela slova). Prag i formula su isti kao
 * za dresove (Jersey.tsx).
 */
export function readableInk(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return "#0D1326";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? "#0D1326" : "#FFFFFF";
}
