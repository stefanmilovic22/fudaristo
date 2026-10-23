/**
 * Izgled dugmadi akcija na „Moj klub" (Poeni po kolima / Planer / Podeli tim).
 * Na telefonu: ikonica iznad kratke oznake, tri jednaka dugmeta u redu; od `sm`
 * naviše: ikonica levo od pune oznake.
 */
export type ActionVariant = "plain" | "plan" | "primary";

const BASE =
  "relative inline-flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 rounded-xl border font-semibold " +
  "px-1 py-2 sm:px-3.5 text-[11px] sm:text-[13px] whitespace-nowrap transition-all duration-150 hover:-translate-y-px " +
  "active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0";

const VARIANT: Record<ActionVariant, string> = {
  plain: "bg-navy-800 border-navy-600 text-slate-200 hover:border-gold-400/60 hover:text-chalk-50",
  plan:
    "border-gold-400/55 text-gold-300 bg-gradient-to-br from-gold-400/15 to-gold-400/[0.03] " +
    "hover:border-gold-400 hover:from-gold-400/25",
  primary: "bg-gold-400 border-gold-400 text-navy-950 font-bold hover:bg-gold-300 hover:border-gold-300",
};

export const actionClass = (variant: ActionVariant) => `${BASE} ${VARIANT[variant]}`;
export const ACTION_ICON = "w-5 h-5 sm:w-4 sm:h-4 shrink-0";
