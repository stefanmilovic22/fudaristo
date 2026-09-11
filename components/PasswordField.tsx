"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Polje za lozinku sa prekidačem „prikaži / sakrij".
 *
 * Zajednička komponenta jer se isto polje pojavljuje na četiri mesta
 * (prijava, registracija ×2, nova lozinka ×2) — bez nje bi se prekidač i
 * njegova pristupačnost pisali iznova svaki put i vremenom razišli.
 *
 * `aria-pressed` na dugmetu i `aria-label` koji se menja sa stanjem znače da
 * čitač ekrana kaže šta će se desiti, a ne samo „dugme".
 */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  required = true,
  invalid,
  describedBy,
  labelSuffix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  required?: boolean;
  /** Crvena ivica kad se lozinke ne poklapaju. */
  invalid?: boolean;
  describedBy?: string;
  /** Sadržaj desno od naziva polja — npr. link „Zaboravljena?" na prijavi. */
  labelSuffix?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const t = useTranslations("auth");

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {labelSuffix ? (
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={id}>{label}</label>
          {labelSuffix}
        </div>
      ) : (
        <label htmlFor={id}>{label}</label>
      )}

      <div className="relative">
        <input
          id={id}
          // Prebacivanje tipa je jedini način koji radi u svim pregledačima;
          // CSS ne može da otkrije tačkice.
          type={visible ? "text" : "password"}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          // pr-11 pravi mesta dugmetu da ne legne preko teksta.
          className={`w-full bg-navy-800 border rounded-lg pl-3 pr-11 py-2 text-chalk-50 focus:outline-none transition-colors ${
            invalid ? "border-danger-400" : "border-navy-600 focus:border-gold-400"
          }`}
        />

        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("hidePassword") : t("showPassword")}
          aria-pressed={visible}
          // tabIndex -1 bi ga izbacio iz tastature; ostaje dostupan, ali dolazi
          // POSLE polja u redosledu, što je i prirodno.
          className="absolute inset-y-0 right-0 w-11 grid place-items-center text-slate-400 hover:text-chalk-50 transition-colors"
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      </div>
    </div>
  );
}

function Eye() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="w-5 h-5"
      aria-hidden
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="w-5 h-5"
      aria-hidden
    >
      <path
        d="M10.6 6.2A9.6 9.6 0 0 1 12 6c6.4 0 10 6 10 6a18 18 0 0 1-3.1 3.8M6.3 7.7A18 18 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 4.2-.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" strokeLinecap="round" />
      <path d="M3 3l18 18" strokeLinecap="round" />
    </svg>
  );
}
