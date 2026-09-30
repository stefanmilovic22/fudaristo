"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Birač boje u samoj stranici (bez nativnog prozora).
 *
 * Nativni <input type="color"> otvara prozor operativnog sistema koji hvata
 * sve klikove — pa se ne može zatvoriti klikom sa strane, samo na X. Ovaj
 * prozorčić je običan element stranice: zatvara se klikom izvan, tasterom
 * Escape i izborom gotove boje.
 */

const PRESET_COLORS = [
  "#E8B33D", "#3FA46A", "#E2574C", "#4A90D9", "#9B59B6",
  "#26A69A", "#E8873D", "#E0629B", "#A3C94A", "#7A8CA3",
];

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, Math.round(l * 100)];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h =
    max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return [h, Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) =>
    lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`.toUpperCase();
}

export function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (hex: string) => void;
  label: string;
}) {
  const t = useTranslations("colorPicker");
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value);
  const boxRef = useRef<HTMLDivElement>(null);
  const [h, s, l] = hexToHsl(value);

  useEffect(() => setHexInput(value), [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function commitHex(v: string) {
    setHexInput(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toUpperCase());
  }

  const slider =
    "w-full h-3 rounded-full appearance-none cursor-pointer border border-navy-600 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-chalk-50 [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-navy-950 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-chalk-50";

  return (
    <div className="relative inline-block" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        className="w-12 h-11 rounded-lg border border-navy-600 cursor-pointer"
        style={{ backgroundColor: value }}
      />

      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="absolute left-0 top-full mt-2 z-40 w-64 bg-navy-800 border border-navy-600 rounded-lg p-3 shadow-lg shadow-black/40 flex flex-col gap-3"
        >
          <div className="grid grid-cols-5 gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                aria-label={c}
                aria-pressed={value.toUpperCase() === c}
                className="w-full aspect-square rounded-full border-2"
                style={{
                  backgroundColor: c,
                  borderColor: value.toUpperCase() === c ? "#F4F6F8" : "transparent",
                }}
              />
            ))}
          </div>

          <input
            type="range"
            min={0}
            max={360}
            value={h}
            onChange={(e) => onChange(hslToHex(+e.target.value, s || 60, l || 50))}
            className={slider}
            style={{
              background:
                "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
            }}
            aria-label={t("hue")}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={s}
            onChange={(e) => onChange(hslToHex(h, +e.target.value, l))}
            className={slider}
            style={{
              background: `linear-gradient(to right,${hslToHex(h, 0, l)},${hslToHex(h, 100, l)})`,
            }}
            aria-label={t("saturation")}
          />
          <input
            type="range"
            min={10}
            max={90}
            value={l}
            onChange={(e) => onChange(hslToHex(h, s, +e.target.value))}
            className={slider}
            style={{
              background: `linear-gradient(to right,${hslToHex(h, s, 10)},${hslToHex(h, s, 50)},${hslToHex(h, s, 90)})`,
            }}
            aria-label={t("lightness")}
          />

          <input
            value={hexInput}
            onChange={(e) => commitHex(e.target.value)}
            maxLength={7}
            spellCheck={false}
            className="bg-navy-900/60 border border-navy-600 rounded-lg px-3 py-2 text-chalk-50 text-sm font-mono focus:border-gold-400 focus:outline-none w-full"
            aria-label={t("hex")}
          />
        </div>
      )}
    </div>
  );
}
