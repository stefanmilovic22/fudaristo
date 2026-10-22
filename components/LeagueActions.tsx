"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { INVITE_CODE_LENGTH, normalizeInviteCode } from "@/lib/leagues";

/**
 * Dugmad „Napravi ligu“ i „Pridruži se kodom“ sa prozorima za unos. Oba pozivaju
 * funkcije u bazi (migracija 016) koje proveravaju sva ograničenja, pa greške
 * koje vrate samo prevodimo u poruku.
 */
export function LeagueActions({ initialJoinOpen = false }: { initialJoinOpen?: boolean }) {
  const t = useTranslations("league");
  const [open, setOpen] = useState<"create" | "join" | null>(initialJoinOpen ? "join" : null);

  return (
    <>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen("join")}
          className="border border-gold-300 text-gold-300 hover:bg-gold-400/10 rounded-lg px-3.5 py-2 text-sm font-bold whitespace-nowrap transition-colors"
        >
          {t("joinWithCode")}
        </button>
        <button
          type="button"
          onClick={() => setOpen("create")}
          className="bg-gold-400 text-navy-950 hover:bg-gold-300 rounded-lg px-3.5 py-2 text-sm font-bold whitespace-nowrap transition-colors"
        >
          + {t("createLeague")}
        </button>
      </div>
      {open === "create" && <CreateDialog onClose={() => setOpen(null)} />}
      {open === "join" && <JoinDialog onClose={() => setOpen(null)} />}
    </>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-navy-950/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md bg-navy-800 border border-gold-400/60 rounded-xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between bg-navy-700 border-b border-gold-400/30 px-4 py-2.5">
          <h3 className="font-display text-sm uppercase tracking-wider text-gold-300">{title}</h3>
          <button type="button" onClick={onClose} aria-label="×" className="text-slate-400 hover:text-chalk-50 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2.5 text-base text-chalk-50 placeholder:text-slate-500 focus:outline-none focus:border-gold-400";
const submitCls =
  "mt-4 w-full bg-gold-400 text-navy-950 font-bold rounded-lg px-4 py-2.5 hover:bg-gold-300 transition-colors disabled:opacity-50";

function CreateDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("league");
  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => inputRef.current?.focus(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc("create_league", { p_name: name });
    if (rpcError || !data?.ok) {
      const reason = data?.reason as string | undefined;
      setError(
        reason === "name_invalid" ? t("errNameInvalid") : reason === "limit" ? t("errLimit") : t("errGeneric")
      );
      setBusy(false);
      return;
    }
    router.push(`/liga/${data.id}`);
    router.refresh();
  }

  return (
    <Dialog title={t("createLeague")} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="text-sm text-slate-400" htmlFor="league-name">
          {t("leagueName")}
        </label>
        <input
          id="league-name"
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder={t("leagueNamePlaceholder")}
          className={`${inputCls} mt-1.5`}
        />
        <p className="text-xs text-slate-500 mt-1.5">{t("leagueNameHint")}</p>
        {error && <p className="text-sm text-danger-400 mt-2">{error}</p>}
        <button type="submit" disabled={busy || name.trim().length < 3} className={submitCls}>
          {busy ? t("creating") : t("createLeague")}
        </button>
      </form>
    </Dialog>
  );
}

function JoinDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("league");
  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => inputRef.current?.focus(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc("join_league", { p_code: code });
    if (rpcError || !data?.ok) {
      const reason = data?.reason as string | undefined;
      setError(reason === "not_found" ? t("errNotFound") : reason === "full" ? t("errFull") : t("errGeneric"));
      setBusy(false);
      return;
    }
    router.push(`/liga/${data.id}`);
    router.refresh();
  }

  return (
    <Dialog title={t("joinLeague")} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="text-sm text-slate-400" htmlFor="league-code">
          {t("inviteCode")}
        </label>
        <input
          id="league-code"
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(normalizeInviteCode(e.target.value))}
          maxLength={INVITE_CODE_LENGTH}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="K7QM2A"
          className={`${inputCls} mt-1.5 tracking-[0.3em] font-bold uppercase`}
        />
        {error && <p className="text-sm text-danger-400 mt-2">{error}</p>}
        <button type="submit" disabled={busy || code.length < INVITE_CODE_LENGTH} className={submitCls}>
          {busy ? t("joining") : t("join")}
        </button>
      </form>
    </Dialog>
  );
}
