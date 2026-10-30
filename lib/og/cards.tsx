/* eslint-disable @next/next/no-img-element */
import type { CSSProperties, ReactNode } from "react";
import { LOGO_DATA_URI } from "@/lib/og/logo";
import type { ShareDot } from "@/lib/team-share";

/**
 * Izgled slika koje pravi ImageResponse (Satori): pregled linka 1200×630 i
 * „Podeli tim" 1080×1350. Satori zna samo flexbox i deo CSS-a, pa je svaki
 * element sa više od jednog deteta `display: flex`, a teren je od običnih
 * pravougaonika (nema CSS grid-a ni repeating gradijenata).
 *
 * Boje su iste kao na sajtu (tailwind.config.ts).
 */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const SHARE_SIZE = { width: 1080, height: 1350 } as const;

const NAVY_950 = "#0D1326";
const NAVY_900 = "#111933";
const NAVY_700 = "#1F2E50";
const BLUE_300 = "#8CCBFF";
const BLUE_400 = "#5AB4FF";
const SLATE_400 = "#93ADCC";
const CHALK = "#F4F6F8";
const GRASS_A = "#2E8B52";
const GRASS_B = "#37A160";

const f: CSSProperties = { display: "flex" };

function Brand({ size, tagline }: { size: number; tagline?: string }) {
  return (
    <div style={{ ...f, alignItems: "center" }}>
      <img src={LOGO_DATA_URI} width={size} height={size} alt="" />
      <div style={{ ...f, flexDirection: "column", marginLeft: size * 0.3 }}>
        <div style={{ ...f, fontSize: size * 0.5, fontWeight: 700, letterSpacing: size * 0.06, color: CHALK }}>
          FUDARISTO
        </div>
        {tagline ? (
          <div style={{ ...f, fontSize: size * 0.3, fontWeight: 600, color: SLATE_400, marginTop: 2 }}>{tagline}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Dres kao siluta u boji kluba. */
function Shirt({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        d="M8 3 L3.5 5.2 L1 9.6 L5.2 11.4 L7 9.8 V21 H17 V9.8 L18.8 11.4 L23 9.6 L20.5 5.2 L16 3 C15 5 9 5 8 3 Z"
        fill={color}
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function fitSize(text: string, big: number, small: number, limit: number) {
  return text.length > limit ? small : big;
}

function Frame({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        ...f,
        position: "relative",
        width: "100%",
        height: "100%",
        fontFamily: "Fira",
        color: CHALK,
        background: `linear-gradient(135deg, ${NAVY_900} 0%, ${NAVY_700} 100%)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Zeleni deo sa dresovima za pregled linka (u boji kluba, bez imena igrača). */
function MiniPitch({ rows, width, height }: { rows: ShareDot[][]; width: number; height: number }) {
  const shown = rows.some((r) => r.length > 0) ? rows : [[], [], [], []];
  const rowY = [0.1, 0.3, 0.52, 0.76];
  return (
    <div
      style={{
        ...f,
        position: "absolute",
        right: 0,
        top: 0,
        width,
        height,
        background: GRASS_A,
        borderLeft: "6px solid rgba(255,255,255,0.35)",
      }}
    >
      <div style={{ ...f, position: "absolute", left: 0, right: 0, top: height / 2, height: 4, background: "rgba(255,255,255,0.25)" }} />
      <div
        style={{
          ...f,
          position: "absolute",
          left: width / 2 - 70,
          top: height / 2 - 70,
          width: 140,
          height: 140,
          borderRadius: 70,
          border: "4px solid rgba(255,255,255,0.25)",
        }}
      />
      {shown.map((row, i) => (
        <div
          key={i}
          style={{ ...f, position: "absolute", left: 0, right: 0, top: height * rowY[i], justifyContent: "space-around" }}
        >
          {row.map((d, j) => (
            <Shirt key={j} color={d.color} size={74} />
          ))}
        </div>
      ))}
    </div>
  );
}

export type TeamCardText = {
  tagline: string;
  teamName: string;
  subtitle: string;
  totalLabel: string;
  totalValue: string;
  gwLabel: string | null;
  gwValue: string | null;
};

export function TeamCard({ text, rows }: { text: TeamCardText; rows: ShareDot[][] }) {
  return (
    <Frame>
      <div style={{ ...f, flexDirection: "column", justifyContent: "space-between", padding: "52px 56px", width: 760 }}>
        <Brand size={72} />
        <div style={{ ...f, flexDirection: "column" }}>
          <div
            style={{
              ...f,
              fontSize: fitSize(text.teamName, 92, 64, 14),
              fontWeight: 700,
              lineHeight: 1.05,
              maxWidth: 650,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {text.teamName}
          </div>
          <div style={{ ...f, fontSize: 34, fontWeight: 600, color: SLATE_400, marginTop: 12 }}>{text.subtitle}</div>
        </div>
        <div style={{ ...f, alignItems: "flex-end" }}>
          <div style={{ ...f, flexDirection: "column" }}>
            <div style={{ ...f, fontSize: 96, fontWeight: 700, color: BLUE_300, lineHeight: 1 }}>{text.totalValue}</div>
            <div style={{ ...f, fontSize: 28, fontWeight: 600, color: SLATE_400 }}>{text.totalLabel}</div>
          </div>
          {text.gwValue ? (
            <div style={{ ...f, flexDirection: "column", marginLeft: 56 }}>
              <div style={{ ...f, fontSize: 96, fontWeight: 700, color: BLUE_300, lineHeight: 1 }}>{text.gwValue}</div>
              <div style={{ ...f, fontSize: 28, fontWeight: 600, color: SLATE_400 }}>{text.gwLabel}</div>
            </div>
          ) : null}
        </div>
      </div>
      <MiniPitch rows={rows} width={440} height={630} />
    </Frame>
  );
}

export type LeagueCardText = {
  tagline: string;
  badge: string;
  name: string;
  members: string;
  cta: string;
};

export function LeagueCard({ text }: { text: LeagueCardText }) {
  return (
    <Frame>
      <div style={{ ...f, flexDirection: "column", justifyContent: "space-between", padding: "52px 56px", width: 1200 }}>
        <Brand size={72} />
        <div style={{ ...f, flexDirection: "column" }}>
          <div
            style={{
              ...f,
              alignSelf: "flex-start",
              fontSize: 28,
              fontWeight: 600,
              color: BLUE_300,
              border: `2px solid ${BLUE_400}`,
              borderRadius: 999,
              padding: "4px 20px",
              marginBottom: 22,
            }}
          >
            {text.badge}
          </div>
          <div
            style={{
              ...f,
              fontSize: fitSize(text.name, 112, 74, 16),
              fontWeight: 700,
              lineHeight: 1.05,
              maxWidth: 1080,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {text.name}
          </div>
          <div style={{ ...f, fontSize: 38, fontWeight: 600, color: SLATE_400, marginTop: 14 }}>{text.members}</div>
        </div>
        <div
          style={{
            ...f,
            alignSelf: "flex-start",
            fontSize: 38,
            fontWeight: 700,
            color: NAVY_950,
            background: BLUE_400,
            borderRadius: 16,
            padding: "14px 34px",
          }}
        >
          {text.cta}
        </div>
      </div>
    </Frame>
  );
}

export function SiteCard({ title, tagline }: { title: string; tagline: string }) {
  return (
    <Frame>
      <div style={{ ...f, flexDirection: "column", justifyContent: "center", padding: "0 80px", width: 760 }}>
        <img src={LOGO_DATA_URI} width={150} height={150} alt="" />
        <div style={{ ...f, fontSize: 116, fontWeight: 700, letterSpacing: 8, marginTop: 28 }}>{title}</div>
        <div style={{ ...f, fontSize: 38, fontWeight: 600, color: SLATE_400, marginTop: 10 }}>{tagline}</div>
      </div>
      <MiniPitch rows={[]} width={440} height={630} />
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// „Podeli tim" — 1080×1350
//
// Teren je prerađen iz components/Pitch.tsx i components/Jersey.tsx (tribina,
// reklamna traka sa golom, trava u prugama, linije, kartice sa dresovima), samo
// u pikselima umesto u Tailwind-u. Ako se izgled terena menja tamo, menja se i
// ovde — Satori ne može da koristi same komponente.
// ---------------------------------------------------------------------------

export type ShareCardText = {
  tagline: string;
  teamName: string;
  gwLine: string | null;
  rankLine: string | null;
  url: string;
  totalValue: string;
  totalLabel: string;
  noSquad: string;
};

const SHIRT_PATH =
  "M34 4 L22 8 L4 20 L14 36 L24 31 L24 70 Q50 75 76 70 L76 31 L86 36 L96 20 L78 8 L66 4 Q50 16 34 4 Z";

const GRASS = { lightOdd: "#8FD957", lightEven: "#82CC4D", darkOdd: "#6FBA42", darkEven: "#62AA3A" };
const LINE = "#F2F3E8";

/** Da li tekst na ovoj boji treba da bude taman ili svetao (isto kao Jersey.tsx). */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#0B1526";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#0B1526" : "#F4F6F8";
}

function GrassTexture({ w, h }: { w: number; h: number }) {
  // Jedan <svg> sa pravougaonicima i zaobljenim isecanjem unutar njega. Ranije su
  // tribina i teren imali `overflow: hidden` sa zaobljenim ivicama, a Satori/resvg
  // tada za SVAKI element unutra (80 pravougaonika, 11 kartica…) pravi posebno
  // isečenu sliku — slika je zbog toga trajala 6–9 sekundi umesto manje od jedne.
  const rows = 10;
  const cols = 8;
  const cw = w / cols;
  const rh = h / rows;
  const rects = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dark = r % 2 === 1;
      const odd = c % 2 === 0;
      const color = dark ? (odd ? GRASS.darkOdd : GRASS.darkEven) : odd ? GRASS.lightOdd : GRASS.lightEven;
      rects.push(<rect key={`${r}-${c}`} x={c * cw} y={r * rh} width={cw + 0.5} height={rh + 0.5} fill={color} />);
    }
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", left: 0, top: 0 }}>
      <defs>
        <clipPath id="grass-round">
          <rect x={0} y={0} width={w} height={h} rx={12} ry={12} />
        </clipPath>
      </defs>
      <g clipPath="url(#grass-round)">{rects}</g>
    </svg>
  );
}

/** Linije terena — iste kao u Pitch.tsx (viewBox 100×140), preračunate u piksele. */
function PitchLines({ w, h }: { w: number; h: number }) {
  const X = (v: number) => (v * w) / 100;
  const Y = (v: number) => (v * h) / 140;
  const sw = 3.5;
  const arc = (x1: number, y1: number, r: number, sweep: 0 | 1, x2: number, y2: number) =>
    `M ${X(x1)} ${Y(y1)} A ${X(r)} ${Y(r)} 0 0 ${sweep} ${X(x2)} ${Y(y2)}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", left: 0, top: 0 }}>
      <g fill="none" stroke={LINE} strokeWidth={sw}>
        <rect x={X(3)} y={Y(3)} width={X(94)} height={Y(134)} />
        <line x1={X(3)} y1={Y(70)} x2={X(97)} y2={Y(70)} />
        <ellipse cx={X(50)} cy={Y(70)} rx={X(13)} ry={Y(13)} />
        <rect x={X(24)} y={Y(3)} width={X(52)} height={Y(20)} />
        <rect x={X(38)} y={Y(3)} width={X(24)} height={Y(8)} />
        <path d={arc(38, 23, 13, 0, 62, 23)} />
        <rect x={X(24)} y={Y(117)} width={X(52)} height={Y(20)} />
        <rect x={X(38)} y={Y(129)} width={X(24)} height={Y(8)} />
        <path d={arc(38, 117, 13, 1, 62, 117)} />
        <path d={arc(3, 7, 4, 0, 7, 3)} />
        <path d={arc(93, 3, 4, 0, 97, 7)} />
        <path d={arc(3, 133, 4, 1, 7, 137)} />
        <path d={arc(93, 137, 4, 1, 97, 133)} />
      </g>
      <g fill={LINE}>
        <ellipse cx={X(50)} cy={Y(70)} rx={X(0.9)} ry={Y(0.9)} />
        <ellipse cx={X(50)} cy={Y(16)} rx={X(0.9)} ry={Y(0.9)} />
        <ellipse cx={X(50)} cy={Y(124)} rx={X(0.9)} ry={Y(0.9)} />
      </g>
    </svg>
  );
}

/** Gol sa mrežom (viewBox 120×38 kao u Pitch.tsx; mreža je ucrtana linijama jer Satori ne zna <pattern>). */
function Goal({ width }: { width: number }) {
  const height = (width * 38) / 120;
  const k = width / 120;
  let net = "";
  for (let x = 8; x <= 112; x += 6) net += `M ${x * k} ${4 * k} V ${38 * k} `;
  for (let y = 4; y <= 38; y += 6) net += `M ${8 * k} ${y * k} H ${112 * k} `;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect x={8 * k} y={4 * k} width={104 * k} height={34 * k} fill="rgba(10,13,18,0.6)" />
      <path d={net} stroke="rgba(255,255,255,0.5)" strokeWidth={1.4} fill="none" />
      <path
        d={`M ${8 * k} ${38 * k} V ${4 * k} H ${112 * k} V ${38 * k}`}
        fill="none"
        stroke="rgba(255,255,255,0.92)"
        strokeWidth={5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AdBrand() {
  return (
    <div style={{ ...f, alignItems: "center", justifyContent: "center", width: "23%", height: "100%" }}>
      <img src={LOGO_DATA_URI} width={44} height={44} alt="" />
      <div style={{ ...f, marginLeft: 8, fontSize: 30, fontWeight: 700, letterSpacing: 1.5, color: NAVY_950 }}>FUDARISTO</div>
    </div>
  );
}

const CARD_W = 138;
const SHIRT_W = 96;
const SHIRT_H = (SHIRT_W * 76) / 100;

function Badge({ label, tone, left, top }: { label: string; tone: "blue" | "chalk"; left: number; top: number }) {
  return (
    <div
      style={{
        ...f,
        position: "absolute",
        left,
        top,
        width: 32,
        height: 32,
        borderRadius: 16,
        border: `4px solid ${NAVY_950}`,
        background: tone === "blue" ? BLUE_400 : CHALK,
        color: NAVY_950,
        fontSize: 16,
        fontWeight: 700,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {label}
    </div>
  );
}

function PlayerCard({ dot, isGk, photo }: { dot: ShareDot; isGk: boolean; photo: string | null }) {
  const ink = inkOn(dot.color);
  return (
    <div style={{ ...f, position: "relative", flexDirection: "column", width: CARD_W }}>
      <div
        style={{
          ...f,
          flexDirection: "column",
          width: CARD_W,
          borderRadius: 17,
          background: "rgba(255,255,255,0.12)",
          border: "2px solid rgba(255,255,255,0.18)",
          paddingTop: 10,
        }}
      >
        <div style={{ ...f, justifyContent: "center", width: "100%" }}>
          {photo ? (
            <div
              style={{
                ...f,
                width: SHIRT_W,
                height: 104,
                overflow: "hidden",
                border: isGk ? "4px dashed #8CCBFF" : "0",
              }}
            >
              <img src={photo} width={SHIRT_W} alt="" />
            </div>
          ) : (
            <div style={{ ...f, position: "relative", width: SHIRT_W, height: SHIRT_H }}>
              <svg width={SHIRT_W} height={SHIRT_H} viewBox="0 0 100 76">
                <path
                  d={SHIRT_PATH}
                  fill={dot.color}
                  stroke={isGk ? "#F0C868" : "rgba(255,255,255,0.4)"}
                  strokeWidth={isGk ? 4 : 2.5}
                  strokeLinejoin="round"
                  strokeDasharray={isGk ? "7 4" : undefined}
                />
              </svg>
              <div
                style={{
                  ...f,
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: SHIRT_H * 0.3,
                  justifyContent: "center",
                  fontSize: 25,
                  fontWeight: 700,
                  color: ink,
                  opacity: 0.88,
                }}
              >
                {dot.short}
              </div>
            </div>
          )}
        </div>
        <div
          style={{
            ...f,
            width: "100%",
            marginTop: 6,
            justifyContent: "center",
            background: CHALK,
            color: NAVY_950,
            fontSize: 18,
            fontWeight: 700,
            padding: "3px 6px",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {dot.name}
        </div>
        <div
          style={{
            ...f,
            width: "100%",
            justifyContent: "center",
            background: "rgba(13,19,38,0.9)",
            color: CHALK,
            fontSize: 18,
            fontWeight: 600,
            padding: "3px 6px",
            borderRadius: "0 0 15px 15px",
          }}
        >
          {dot.detail ?? dot.points * dot.multiplier}
        </div>
      </div>
      {isGk ? <Badge label="GK" tone="blue" left={4} top={-12} /> : null}
      {dot.isCaptain ? <Badge label="C" tone="blue" left={-10} top={-12} /> : null}
      {!dot.isCaptain && dot.isViceCaptain ? <Badge label="V" tone="chalk" left={-10} top={-12} /> : null}
    </div>
  );
}

export function ShareCard({
  text,
  rows,
  photos,
}: {
  text: ShareCardText;
  rows: ShareDot[][];
  /** Fotografije dresova kao data URI, po adresi iz baze (preuzima ih ruta). */
  photos: Record<string, string>;
}) {
  const PAD = 48;
  const standTop = 296;
  const standH = 884;
  const standW = SHARE_SIZE.width - PAD * 2;
  const TOP = 150; // tribina sa golom i reklamnom trakom
  const GAP = 24;
  const grassW = standW - GAP * 2;
  const grassH = standH - TOP - GAP;
  const hasSquad = rows.some((r) => r.length > 0);
  // Kartice sa fotografijom dresa su viši od vektorskih; kad ih ima u skoro svakom
  // redu, smanji razmak da donji red ne štrči ispod terena (teren više ne seče
  // sadržaj — zaobljeno isecanje je usporavalo sliku nekoliko puta).
  const photoRows = rows.filter((r) => r.some((d) => d.photoUrl && photos[d.photoUrl])).length;
  const padding = photoRows >= 3 ? "10px 0 4px" : "34px 0 26px";

  return (
    <Frame style={{ flexDirection: "column", background: `linear-gradient(180deg, ${NAVY_900} 0%, ${NAVY_950} 100%)` }}>
      <div style={{ ...f, position: "absolute", left: PAD, top: 44 }}>
        <Brand size={64} tagline={text.tagline} />
      </div>
      <div
        style={{
          ...f,
          position: "absolute",
          left: PAD,
          top: 134,
          width: standW,
          fontSize: fitSize(text.teamName, 92, 66, 16),
          fontWeight: 700,
          lineHeight: 1.1,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        {text.teamName}
      </div>
      {text.gwLine ? (
        <div style={{ ...f, position: "absolute", left: PAD, top: 240, fontSize: 36, fontWeight: 600, color: SLATE_400 }}>
          {text.gwLine}
        </div>
      ) : null}

      {/* Tribina + reklamna traka + gol + travnjak, kao u Pitch.tsx */}
      <div
        style={{
          ...f,
          position: "absolute",
          left: PAD,
          top: standTop,
          width: standW,
          height: standH,
          borderRadius: 24,
          background: "#0A0D12",
          border: "3px solid rgba(90,180,255,0.5)",
        }}
      >
        <div
          style={{
            ...f,
            position: "absolute",
            left: GAP,
            right: GAP,
            top: TOP - 66,
            height: 66,
            borderRadius: "10px 10px 0 0",
            background: "linear-gradient(90deg, #8FDCFF 0%, #5AB4FF 45%, #3E86F0 100%)",
            justifyContent: "space-between",
            padding: "0 2%",
          }}
        >
          <AdBrand />
          <AdBrand />
        </div>
        <div style={{ ...f, position: "absolute", left: (standW - 440) / 2, top: TOP - (440 * 38) / 120 }}>
          <Goal width={440} />
        </div>

        <div
          style={{
            ...f,
            position: "absolute",
            left: GAP,
            top: TOP,
            width: grassW,
            height: grassH,
            borderRadius: 14,
            border: "2px solid rgba(90,180,255,0.25)",
          }}
        >
          <GrassTexture w={grassW - 4} h={grassH - 4} />
          <PitchLines w={grassW} h={grassH} />
          {hasSquad ? (
            <div
              style={{
                ...f,
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                flexDirection: "column",
                justifyContent: "space-around",
                padding,
              }}
            >
              {rows.map((row, i) => (
                <div key={i} style={{ ...f, justifyContent: "center" }}>
                  {row.map((d, j) => (
                    <div key={j} style={{ ...f, margin: "0 14px" }}>
                      <PlayerCard dot={d} isGk={i === 0} photo={d.photoUrl ? (photos[d.photoUrl] ?? null) : null} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                ...f,
                position: "absolute",
                left: 0,
                right: 0,
                top: grassH / 2 - 24,
                justifyContent: "center",
                fontSize: 38,
                fontWeight: 700,
                color: NAVY_950,
              }}
            >
              {text.noSquad}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          ...f,
          position: "absolute",
          left: PAD,
          right: PAD,
          bottom: 40,
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <div style={{ ...f, flexDirection: "column" }}>
          {text.rankLine ? (
            <div style={{ ...f, fontSize: 34, fontWeight: 600, color: CHALK }}>{text.rankLine}</div>
          ) : null}
          <div style={{ ...f, fontSize: 28, fontWeight: 600, color: SLATE_400, marginTop: 4 }}>{text.url}</div>
        </div>
        <div style={{ ...f, flexDirection: "column", alignItems: "flex-end" }}>
          <div style={{ ...f, fontSize: 84, fontWeight: 700, color: BLUE_300, lineHeight: 1 }}>{text.totalValue}</div>
          <div style={{ ...f, fontSize: 28, fontWeight: 600, color: SLATE_400 }}>{text.totalLabel}</div>
        </div>
      </div>
    </Frame>
  );
}
