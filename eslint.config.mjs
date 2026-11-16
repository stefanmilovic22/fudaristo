import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

// Next 16 više nema `next lint` — ESLint se pokreće direktno (`npm run lint`).
const eslintConfig = defineConfig([
  ...nextVitals,
  {
    rules: {
      // Dva nova pravila React Compiler-a prijavljuju obrasce koji su ovde
      // namerni: čitanje localStorage-a / vremena tek posle montiranja (da se
      // server i pregledač ne razlikuju pri hidrataciji). Ostaju kao upozorenja,
      // da novi kod ne prolazi neprimećeno, ali da ne ruše proveru.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "node_modules/**"]),
]);

export default eslintConfig;
