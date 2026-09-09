"use client";

import { useState, useTransition } from "react";
import type { TaskResult } from "@/lib/maintenance";

type TaskKey = "backfill-dry" | "backfill-apply" | "refresh" | "import";

/**
 * Dugmad za tri posla koja su do sad bila samo CLI skripte.
 *
 * Dva pravila koja UI ovde nosi, a skripte nisu mogle:
 *
 * 1. Backfill se prvo pušta kao PROBNI prolaz. Dugme "Upiši" se pojavljuje tek
 *    kad probni prolaz prođe, i piše koliko će mečeva dodirnuti. U terminalu je
 *    ovo bila zastava `--apply` koju je lako zaboraviti (ili, gore, otkucati
 *    bez `--` pa da je npm proguta).
 *
 * 2. Uvoz kalendara traži potvrdu, jer prepisuje termine. Ostala dva posla su
 *    bezopasna i idu na jedan klik.
 *
 * Ispis se prikazuje ceo — koji meč je ažuriran, šta nije upareno, koliko je
 * ostalo. Posao koji zove spoljni API bez ispisa je posao kome se ne veruje.
 */
export function MaintenancePanel({
  actions,
}: {
  actions: {
    backfill: (apply: boolean) => Promise<TaskResult>;
    refresh: () => Promise<TaskResult>;
    importFixtures: () => Promise<TaskResult>;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<TaskKey | null>(null);
  const [result, setResult] = useState<{ task: TaskKey; data: TaskResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);

  function run(task: TaskKey, fn: () => Promise<TaskResult>) {
    setRunning(task);
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        setResult({ task, data: await fn() });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRunning(null);
        setConfirmImport(false);
      }
    });
  }

  const busy = pending || running !== null;

  // "Upiši" se nudi tek posle probnog prolaza koji je nešto našao.
  const dryRunFound =
    result?.task === "backfill-dry" && result.data.remaining > 0 ? result.data.remaining : 0;

  return (
    <section className="bg-navy-800 border border-navy-600 rounded-lg p-5">
      <h3 className="font-display text-lg mb-2">Održavanje kalendara</h3>
      <p className="text-slate-400 text-sm mb-4">
        Isti poslovi kao <code className="text-slate-500">npm run</code> skripte, samo odavde.
        Svi su bezbedni za ponovno pokretanje.
      </p>

      <div className="flex flex-col gap-4">
        <Task
          title="Poveži ručno unete mečeve sa TheSportsDB"
          note="Popunjava api_thesportsdb_id za mečeve iz CSV kalendara. Ne dira ništa drugo — ni termine, ni rezultate."
        >
          <Button
            onClick={() => run("backfill-dry", () => actions.backfill(false))}
            busy={busy}
            loading={running === "backfill-dry"}
          >
            Probni prolaz
          </Button>
          {dryRunFound > 0 && (
            <Button
              variant="primary"
              onClick={() => run("backfill-apply", () => actions.backfill(true))}
              busy={busy}
              loading={running === "backfill-apply"}
            >
              Upiši {dryRunFound}
            </Button>
          )}
        </Task>

        <Task
          title="Osveži rezultate odigranih mečeva"
          note="Rezerva za pojedinačan meč. Za redovan rad je bolji „Pokreni ingestion sada“ — radi po kolu, jednim pozivom, i ne traži api_thesportsdb_id. Ovde se obrađuje najviše 15 mečeva po pokretanju."
        >
          <Button onClick={() => run("refresh", actions.refresh)} busy={busy} loading={running === "refresh"}>
            Osveži rezultate
          </Button>
        </Task>

        <Task
          title="Uvezi kalendar sa TheSportsDB"
          note="⚠️ Pravi kola koja ne postoje i PREPISUJE termine postojećim mečevima. Ako si termine sređivao ručno, ovo ih gazi. Besplatan tier vraća ~2 kola po pozivu, ne celu sezonu."
          danger
        >
          {confirmImport ? (
            <>
              <span className="text-sm text-slate-300 self-center">Prepisati termine?</span>
              <Button
                variant="danger"
                onClick={() => run("import", actions.importFixtures)}
                busy={busy}
                loading={running === "import"}
              >
                Da, uvezi
              </Button>
              <Button onClick={() => setConfirmImport(false)} busy={busy}>
                Odustani
              </Button>
            </>
          ) : (
            <Button onClick={() => setConfirmImport(true)} busy={busy}>
              Uvezi kalendar
            </Button>
          )}
        </Task>
      </div>

      {error && (
        <p className="text-danger-400 text-sm mt-4 border-t border-navy-700 pt-4">{error}</p>
      )}

      {result && (
        <div className="mt-4 border-t border-navy-700 pt-4">
          <p className={`text-sm font-semibold ${result.data.ok ? "text-chalk-50" : "text-danger-400"}`}>
            {result.data.summary}
          </p>
          {result.data.lines.length > 0 && (
            <pre className="mt-2 bg-navy-950 border border-navy-700 rounded-md p-3 text-xs overflow-x-auto text-slate-300 whitespace-pre-wrap">
              {result.data.lines.join("\n")}
            </pre>
          )}
          {result.data.warnings.length > 0 && (
            <ul className="mt-2 text-xs text-gold-300 flex flex-col gap-1">
              {result.data.warnings.map((w, i) => (
                <li key={i}>⚠️ {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Task({
  title,
  note,
  danger,
  children,
}: {
  title: string;
  note: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-4 ${danger ? "border-danger-400/40" : "border-navy-700"}`}>
      <div className="font-display text-sm mb-1">{title}</div>
      <p className="text-xs text-slate-400 leading-relaxed mb-3">{note}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Button({
  children,
  onClick,
  busy,
  loading,
  variant = "plain",
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  loading?: boolean;
  variant?: "plain" | "primary" | "danger";
}) {
  const styles = {
    plain: "bg-navy-700 text-chalk-50 hover:bg-navy-600",
    primary: "bg-gold-400 text-navy-950 hover:bg-gold-300",
    danger: "bg-danger-400 text-chalk-50 hover:opacity-90",
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`font-semibold text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${styles}`}
    >
      {loading ? "Radim…" : children}
    </button>
  );
}
