import type { ReactNode } from "react";

type IconName = "pitch" | "trophy" | "calendar" | "chart" | "users" | "search";

const ICONS: Record<IconName, ReactNode> = {
  pitch: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M12 5v14M3 12h18" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1.5A3 3 0 0 0 7 10.5M17 6h3v1.5a3 3 0 0 1-3 3M9.5 20h5M12 14.5V20" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  chart: <path d="M5 20V10M12 20V4M19 20v-7" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c.5-3.6 3-5.5 6-5.5s5.5 1.9 6 5.5M16 5.2a3 3 0 0 1 0 5.6M18 14.8c1.9.6 3.2 2.3 3.5 5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
};

/**
 * Prazno stanje: ikonica, naslov, objašnjenje i (opciono) dugme/link — umesto
 * golog sivog reda teksta. Server i klijent komponente ga mogu koristiti,
 * jer ne zna za prevode (tekstovi dolaze spolja).
 */
export function EmptyState({
  icon = "pitch",
  title,
  body,
  action,
  className = "",
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-navy-800 border border-gold-400/30 rounded-xl px-5 py-8 flex flex-col items-center text-center ${className}`}
    >
      <span className="w-12 h-12 rounded-full bg-navy-700 grid place-items-center text-gold-300 mb-3" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          {ICONS[icon]}
        </svg>
      </span>
      <h3 className="font-display text-lg leading-tight">{title}</h3>
      {body && <p className="text-slate-400 text-sm mt-1.5 max-w-md">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
