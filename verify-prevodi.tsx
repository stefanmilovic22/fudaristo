/**
 * Provera da se SVAKA poruka stvarno renderuje, na sva tri jezika.
 *
 * TypeScript ovo ne hvata: t.rich() prima objekat sa proizvoljnim vrednostima,
 * pa je greška "Functions are not valid as a child" izlazila tek u pregledaču.
 * Ovde se poruke zaista prevode i renderuju u string.
 */
import React from "react";
import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import en from "./messages/en.json";
import sr from "./messages/sr.json";
import el from "./messages/el.json";

const CATALOGS = { en, sr, el } as const;

/** Poruke sa oznakama — moraju da prime i vrednosti i funkcije za oznake. */
const RICH: Record<string, Record<string, unknown>> = {
  "home.welcomeBack": { teamName: "Arsenal FC", b: (c: React.ReactNode) => <span>{c}</span> },
  "auth.checkMailBody": { email: "a@b.c", b: (c: React.ReactNode) => <span>{c}</span> },
  "auth.newPasswordFor": { email: "a@b.c", b: (c: React.ReactNode) => <span>{c}</span> },
  "team.selling": { name: "M. Pelkas", price: "5.0M", budget: "7.5M", b: (c: React.ReactNode) => <b>{c}</b> },
  "builder.swapHelpActive": { name: "M. Pelkas", b: (c: React.ReactNode) => <b>{c}</b> },
};

/** Vrednosti za obične zamenike, po ključu. */
const VALUES: Record<string, Record<string, unknown>> = {
  "league.showMe": { rank: 3 },
  "league.teamsShown": { shown: 5, total: 40 },
  "league.colGameweek": { number: 4 },
  "league.noSearchMatch": { query: "abc" },
  "stats.subtitleWithGw": { number: 4 },
  "chips.badgeWith": { number: 4, chip: "Triple Captain" },
  "chips.badgeNone": { number: 4 },
  "chips.spent": { number: 7 },
  "chips.blockedByOther": { chip: "Triple Captain" },
  "picker.choose": { position: "GK" },
  "picker.count": { count: 3 },
  "pitch.remove": { name: "Pelkas" },
  "pitch.add": { label: "GK" },
  "pitch.formation": { label: "4-4-2" },
  "common.gameweekN": { number: 4 },
  "register.profileFailed": { message: "boom" },
  "adminDenied.accountNoAdmin": { team: "Arsenal FC" },
  "publicTeam.noSquad": { number: 4 },
  "publicTeam.squadFrom": { number: 4 },
  "publicTeam.points": { points: 62 },
  "publicTeam.transferCost": { cost: -4 },
  "publicTeam.rankAndPoints": { rank: 3, points: 62 },
  "publicTeam.supports": { club: "PAOK" },
  "team.notEnoughFor": { formation: "3-5-2", position: "DEF", need: 5, have: 4 },
  "team.formationApplied": { formation: "3-5-2" },
  "team.xiSize": { size: 11, count: 10 },
  "team.budgetNegative": { amount: "-1.0M" },
  "team.maxPerClub": { max: 3, club: "PAOK", count: 4 },
  "team.transfersSavedLineupNot": { message: "boom" },
  "team.savedTransfers": { count: 2 },
  "team.confirmTransfers": { count: 2 },
  "team.buildTitle": { number: 4 },
  "team.deadlineAndBudget": { deadline: "12.09.", budget: "100.0" },
  "builder.thingsMissing": { count: 4 },
  "errors.loadFailed": { what: "x" },
};

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null
      ? flatten(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`]
  );
}

let pass = 0;
const failures: string[] = [];

for (const [locale, messages] of Object.entries(CATALOGS)) {
  const t = createTranslator({ locale, messages: messages as never });
  for (const key of flatten(messages as unknown as Record<string, unknown>)) {
    try {
      const args = RICH[key] ?? VALUES[key] ?? {};
      const out = key in RICH
        ? renderToStaticMarkup(<>{t.rich(key as never, args as never)}</>)
        : String(t(key as never, args as never));

      if (out.includes("function") || out.includes("[object Object]")) {
        failures.push(`${locale}/${key}: renderovano kao "${out.slice(0, 60)}"`);
      } else {
        pass++;
      }
    } catch (e) {
      failures.push(`${locale}/${key}: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  }
}

console.log(`${pass} poruka renderovano`);
if (failures.length) {
  console.log(`\n${failures.length} problema:`);
  failures.forEach((f) => console.log("  " + f));
  process.exit(1);
}
console.log("Sve tri lokalizacije se renderuju bez greške.");
