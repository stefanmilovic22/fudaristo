"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { navigateAfterAuth, resolveAuthRedirect } from "@/lib/auth-redirect";
import { deleteAccountAction } from "./actions";

/**
 * „Obriši nalog“ na dnu Podešavanja. Dva koraka, namerno: prvo dugme samo otvara
 * potvrdu, a brisanje se pokreće tek kad korisnik upiše tačno ime svog tima —
 * radnja je nepovratna i ne sme da se desi jednim slučajnim dodirom.
 */
export function DeleteAccount({ teamName }: { teamName: string }) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim() === teamName && teamName.length > 0;

  async function confirmDelete() {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    let result: Awaited<ReturnType<typeof deleteAccountAction>>;
    try {
      result = await deleteAccountAction(typed);
    } catch {
      result = { ok: false, reason: "failed" };
    }
    if (result.ok) {
      // Puna navigacija: zaglavlje i sve stranice se iscrtavaju bez sesije.
      navigateAfterAuth(resolveAuthRedirect(null, locale, "/"));
      return;
    }
    setError(
      result.reason === "mismatch"
        ? t("deleteMismatch")
        : result.reason === "admin"
          ? t("deleteAdmin")
          : t("deleteFailed")
    );
    setBusy(false);
  }

  return (
    <section className="mt-6 bg-navy-800 rounded-xl ring-1 ring-danger-400/40 p-5">
      <h3 className="font-display text-lg text-danger-400">{t("deleteTitle")}</h3>
      <p className="text-slate-400 text-sm mt-1.5">{t("deleteBody")}</p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 border border-danger-400/70 text-danger-400 font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-danger-400/10"
        >
          {t("deleteOpen")}
        </button>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-slate-300">{t("deleteConfirmLabel", { name: teamName })}</span>
            <input
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                setError(null);
              }}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={40}
              className="bg-navy-900/60 border border-navy-600 rounded-lg px-3 py-2.5 text-chalk-50 focus:border-danger-400 focus:outline-none w-full"
            />
          </label>
          {error && <p className="text-danger-400 text-sm">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={confirmDelete}
              disabled={!matches || busy}
              className="bg-danger-400 text-navy-950 font-bold text-sm px-5 py-2.5 rounded-lg disabled:opacity-40"
            >
              {busy ? t("deleteBusy") : t("deleteConfirm")}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
              disabled={busy}
              className="text-slate-300 text-sm px-3 py-2.5"
            >
              {tCommon("cancel")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
