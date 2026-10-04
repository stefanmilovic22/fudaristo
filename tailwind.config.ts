import type { Config } from "tailwindcss";

// Design tokeni preuzeti direktno iz fudaristo-mockup.html — jedan izvor
// istine za boje kroz ceo projekat.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    screens: {
      // Prelomna tačka za uske telefone (iPhone SE je 375px). Dresovi na terenu
      // moraju da stanu u jedan red i na njoj, pa im treba korak ispod sm.
      xs: "400px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
    },
    extend: {
      colors: {
        navy: {
          950: "#0D1326",
          // 900 se koristio na 14 mesta (polja za unos, pretraga igrača, admin
          // unos statistike) a NIJE postojao u paleti — Tailwind takvu klasu
          // tiho izbaci, pa su ta polja ostajala bez pozadine: bela kutija sa
          // belim tekstom. Vrednost je između 950 i 800.
          900: "#111933",
          800: "#151E39",
          700: "#1F2E50",
          600: "#2C4468",
        },
        pitch: {
          // Trava je posvetljena da odgovara stvarnom terenu Agia Sofia Arene:
          // ranije je 700 (#175C36) bila skoro tamnozelena i teren je delovao
          // kao noćni snimak. Nove vrednosti su u opsegu koji daje osvetljen
          // travnjak pod reflektorima, a i dalje ostavljaju dovoljno kontrasta
          // za bele linije i za dresove u svetlim bojama klubova.
          700: "#2E8B52",
          600: "#37A160",
          500: "#43B771",
          400: "#57C983",
        },
        gold: {
          400: "#5AB4FF",
          300: "#8CCBFF",
        },
        chalk: {
          50: "#F4F6F8",
        },
        slate: {
          300: "#B7C3D6",
          400: "#93ADCC",
          500: "#64718A",
          600: "#4A5F82",
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
