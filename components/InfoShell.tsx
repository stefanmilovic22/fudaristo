import type { ReactNode } from "react";
import { InfoNav } from "@/components/InfoNav";

/** Okvir informativnih stranica: bočni spisak + sadržaj. */
export function InfoShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-5 lg:gap-10 max-w-4xl mx-auto py-2 sm:py-4">
      <InfoNav />
      <div className="min-w-0 max-w-2xl">{children}</div>
    </div>
  );
}
