"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const STORAGE_KEY = "fudaristo-welcome-hidden";
const SLIDES = [1, 2, 3, 4] as const;

/**
 * Uvod za nove igrače: kartica sa koracima na vrhu „Moj klub" dok tim nije
 * sastavljen + kratak vodič u 4 koraka. Prikazuje se samo dok se gradi prvi
 * sastav (stranica je renderuje u toj grani). „Sakrij" pamti izbor u
 * pregledaču — bez baze, bez prijave.
 */
export function WelcomeGuide() {
  const t = useTranslations("welcome");
  // null dok se ne pročita izbor, da kartica ne „trepne" pa nestane.
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [slide, setSlide] = useState<number | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  useEffect(() => {
    if (slide === null) return;
    nextBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide === null]);

  function close() {
    setSlide(null);
    opener.current?.focus();
  }

  function hide() {
    setHidden(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // bez trajnog pamćenja — kartica se samo sakrije za ovu posetu
    }
  }

  if (hidden !== false) return null;

  const steps: { done?: boolean; current?: boolean; title: string; sub: string; link?: boolean }[] = [
    { done: true, title: t("step1"), sub: t("step1Sub") },
    { current: true, title: t("step2"), sub: t("step2Sub") },
    { title: t("step3"), sub: t("step3Sub") },
    { title: t("step4"), sub: t("step4Sub"), link: true },
  ];

  return (
    <>
      <section className="bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden mb-5 max-w-3xl">
        <div className="bg-navy-700 border-b border-gold-400/30 px-4 py-2.5 flex items-center justify-between">
          <h3 className="font-display text-sm uppercase tracking-wider text-gold-300">{t("title")}</h3>
          <button type="button" onClick={hide} className="text-xs text-slate-300 hover:text-chalk-50">
            {t("hide")} ×
          </button>
        </div>
        <ol>
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-2.5 border-t border-navy-700 first:border-t-0">
              <span
                className={`w-7 h-7 shrink-0 rounded-full grid place-items-center text-sm font-bold ${
                  s.done
                    ? "bg-pitch-400 text-navy-950"
                    : s.current
                      ? "bg-gold-400 text-navy-950"
                      : "bg-navy-700 text-slate-400"
                }`}
                aria-hidden
              >
                {s.done ? "✓" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-sm">{s.title}</span>
                <span className="block text-slate-400 text-xs">{s.sub}</span>
              </span>
              {s.link && (
                <Link href="/liga" className="shrink-0 text-xs font-semibold text-gold-300 hover:underline">
                  {t("leagueLink")} →
                </Link>
              )}
            </li>
          ))}
        </ol>
        <div className="border-t border-navy-700 px-4 py-2.5">
          <button
            ref={opener}
            type="button"
            onClick={() => setSlide(0)}
            className="text-sm font-semibold text-gold-300 border border-navy-600 hover:border-gold-400/60 rounded-lg px-3.5 py-2 transition-colors"
          >
            {t("guide")} →
          </button>
        </div>
      </section>

      {slide !== null && (
        <div
          className="fixed inset-0 z-[110] bg-black/60 flex items-center justify-center p-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("guideTitle")}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden shadow-2xl"
          >
            <div className="bg-navy-700 border-b border-gold-400/30 px-4 py-2.5 flex items-center justify-between">
              <h3 className="font-display text-sm uppercase tracking-wider text-gold-300">
                {t("guideTitle")} · {t("stepOf", { current: slide + 1, total: SLIDES.length })}
              </h3>
              <button type="button" onClick={close} aria-label={t("close")} className="text-slate-300 hover:text-chalk-50 text-lg leading-none">
                ×
              </button>
            </div>
            <div className="px-5 py-7 text-center">
              <div className="font-display font-bold text-6xl text-gold-300 leading-none">
                {t(`slide${SLIDES[slide]}Big` as "slide1Big")}
              </div>
              <h4 className="font-display text-2xl mt-4 mb-2">{t(`slide${SLIDES[slide]}Title` as "slide1Title")}</h4>
              <p className="text-slate-300 text-sm leading-relaxed">{t(`slide${SLIDES[slide]}Text` as "slide1Text")}</p>
            </div>
            <div className="border-t border-navy-700 px-4 py-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSlide(slide - 1)}
                disabled={slide === 0}
                className="text-sm font-semibold text-gold-300 border border-navy-600 rounded-lg px-3 py-1.5 disabled:opacity-30"
              >
                ← {t("back")}
              </button>
              <span className="flex gap-1.5" aria-hidden>
                {SLIDES.map((n, i) => (
                  <i key={n} className={`w-2 h-2 rounded-full ${i === slide ? "bg-gold-400" : "bg-navy-600"}`} />
                ))}
              </span>
              <button
                ref={nextBtn}
                type="button"
                onClick={() => (slide === SLIDES.length - 1 ? close() : setSlide(slide + 1))}
                className="text-sm font-bold bg-gold-400 text-navy-950 rounded-lg px-3.5 py-1.5"
              >
                {slide === SLIDES.length - 1 ? t("done") : `${t("next")} →`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
