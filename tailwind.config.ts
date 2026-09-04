import type { Config } from "tailwindcss";

// Design tokeni preuzeti direktno iz coacheleven-mockup.html — jedan izvor
// istine za boje kroz ceo projekat.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#0B1526",
          800: "#142238",
          700: "#1C2E4A",
          600: "#28405F",
        },
        pitch: {
          700: "#175C36",
          600: "#1E7A46",
          500: "#278F53",
        },
        gold: {
          400: "#E8B33D",
          300: "#F0C868",
        },
        chalk: {
          50: "#F4F6F8",
        },
        slate: {
          300: "#B7C3D6",
          400: "#8494AC",
          500: "#64718A",
        },
        danger: {
          400: "#E2574C",
        },
      },
      fontFamily: {
        display: ["var(--font-oswald)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
