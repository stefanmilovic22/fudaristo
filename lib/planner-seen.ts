"use client";

import { useEffect, useState } from "react";

/**
 * „NOVO" oznake oko planera nestaju čim korisnik prvi put otvori planer.
 * Pamti se samo u ovom pregledaču (localStorage) — bez baze i bez prijave.
 */
const KEY = "fudaristo-planner-seen";
const TIP_KEY = "fudaristo-planner-tip-hidden";
const EVENT = "fudaristo-planner-seen-change";

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function write(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // bez trajnog pamćenja oznaka se samo sakrije za ovu posetu
  }
  window.dispatchEvent(new Event(EVENT));
}

export function markPlannerSeen() {
  write(KEY);
}

export function hidePlannerTip() {
  write(TIP_KEY);
}

/** null dok se ne pročita (da oznaka ne „trepne"), pa true/false. */
function useFlag(key: string): boolean | null {
  const [value, setValue] = useState<boolean | null>(null);
  useEffect(() => {
    const update = () => setValue(read(key));
    update();
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, [key]);
  return value;
}

export const usePlannerSeen = () => useFlag(KEY);
export const usePlannerTipHidden = () => useFlag(TIP_KEY);
