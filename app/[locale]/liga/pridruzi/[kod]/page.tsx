import { Link, redirect } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeInviteCode, INVITE_CODE_LENGTH } from "@/lib/leagues";
import { ClubBadge } from "@/components/ClubBadge";
import { JoinInviteButton } from "@/components/LeagueMemberButtons";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "league" });
  return { title: `${t("invitePageTitle")} — Fudaristo` };
}

/**
 * Stranica na koju vodi link-pozivnica (/liga/pridruzi/ŠIFRA). Šifra je u
 * putanji, a ne u upitu, jer prijava (middleware) čuva samo putanju — neprijavljen
 * korisnik se posle prijave vraća tačno ovde.
 */
export default async function JoinInvitePage({ params }: { params: Promise<{ locale: string; kod: string }> }) {
  const { locale, kod } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("league");
  const code = normalizeInviteCode(decodeURIComponent(kod));

  const supabase = await createClient();
  const { data } =
    code.length === INVITE_CODE_LENGTH
      ? await supabase.rpc("league_preview", { p_code: code })
      : { data: { ok: false } };

  if (data?.ok && data.already_member) redirect({ href: `/liga/${data.id}`, locale });

  return (
    <div className="max-w-md mx-auto">
      <Link href="/liga?tab=moje" className="text-slate-400 text-sm hover:text-chalk-50">
        ← {t("pageTitle")}
      </Link>
      <section className="mt-3 bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden">
        <div className="bg-navy-700 border-b border-gold-400/30 px-4 py-2.5">
          <h3 className="font-display text-sm uppercase tracking-wider text-gold-300">{t("invitePageTitle")}</h3>
        </div>
        {data?.ok ? (
          <div className="px-5 py-6 text-center">
            <ClubBadge
              short={String(data.name).slice(0, 2).toUpperCase()}
              color="#5AB4FF"
              size={64}
              className="!rounded-2xl mx-auto"
            />
            <h2 className="font-display text-2xl mt-3">{data.name}</h2>
            <p className="text-slate-400 text-sm mt-1 mb-5">{t("membersCount", { count: Number(data.members) })}</p>
            <JoinInviteButton code={code} />
          </div>
        ) : (
          <div className="px-5 py-8 text-center">
            <p className="text-slate-300">{t("errNotFound")}</p>
            <Link href="/liga?tab=moje" className="inline-block mt-4 text-gold-300 font-semibold hover:underline">
              {t("backToLeagues")}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
