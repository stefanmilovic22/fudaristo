import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

/** Linijske ikonice u istom stilu kao u glavnoj navigaciji (MainNav.tsx). */
export const ChartIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);
export const SwapIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </svg>
);
export const ShareIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
);

export const PriceIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
  </svg>
);
export const TvIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);
