import { getTranslations, setRequestLocale } from "next-intl/server";
import { InfoShell } from "@/components/InfoShell";
import { CONTACT_EMAILS, type ContactTopic } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  return { title: `${t("title")} — Fudaristo` };
}

type Topic = { key: ContactTopic; title: string; body: string; subject: string };

/** mailto sa već upisanim predmetom; adresa se ne ispisuje uz svaku temu. */
const mailto = (topic: ContactTopic, subject: string) =>
  `mailto:${CONTACT_EMAILS[topic]}?subject=${encodeURIComponent(`[Fudaristo] ${subject}`)}`;

export default async function KontaktPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contact");
  // „Opšti upiti” je poslednja stavka u istoj listi.
  const topics: Topic[] = [
    ...(t.raw("topics") as Topic[]),
    { key: "general", title: t("generalTitle"), body: t("generalBody"), subject: t("generalSubject") },
  ];

  return (
    <InfoShell>
      <h1 className="font-display text-3xl sm:text-4xl font-semibold leading-tight">{t("title")}</h1>
      <p className="text-slate-300 mt-3 leading-relaxed">{t("lead")}</p>

      {/* Adresa se navodi samo jednom, ovde. */}
      <p className="mt-5 text-sm text-slate-400">
        {t("writeTo")}{" "}
        <a
          href={`mailto:${CONTACT_EMAILS.general}`}
          className="font-bold text-gold-300 hover:text-gold-400 underline-offset-2 hover:underline break-all"
        >
          {CONTACT_EMAILS.general}
        </a>
      </p>

      <h2 className="font-display text-2xl mt-8 mb-2">{t("specificTitle")}</h2>
      <p className="text-sm text-slate-400 mb-4">{t("specificIntro")}</p>
      <ul className="bg-navy-800 border border-navy-700 rounded-xl divide-y divide-navy-700 overflow-hidden">
        {topics.map((topic) => (
          <li key={topic.key}>
            <a
              href={mailto(topic.key, topic.subject)}
              className="group flex items-center gap-3 p-4 sm:p-5 hover:bg-navy-700/40 transition-colors"
            >
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-chalk-50">{topic.title}</span>
                <span className="block text-sm text-slate-300 mt-1 leading-relaxed">{topic.body}</span>
              </span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-5 h-5 shrink-0 text-gold-300 group-hover:translate-x-0.5 transition-transform"
                aria-hidden
              >
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </li>
        ))}
      </ul>

      <aside className="mt-8 rounded-xl border border-gold-400/30 bg-gold-400/10 p-4 sm:p-5">
        <h3 className="font-bold text-gold-300">{t("noteTitle")}</h3>
        <p className="text-sm text-slate-300 mt-1 leading-relaxed">{t("noteBody")}</p>
      </aside>
    </InfoShell>
  );
}
