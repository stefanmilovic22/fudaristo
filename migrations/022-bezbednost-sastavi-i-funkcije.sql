-- ============================================================================
-- Fudaristo — migracija 022
-- Dve bezbednosne rupe u bazi. Bezbedno je pokrenuti više puta.
--
-- 1) SASTAV ZA NAREDNO KOLO JE BIO ČITLJIV SVIMA
--    Politika "squads_select_all" (schema.sql) je dozvoljavala čitanje SVIH
--    redova u squads — a javni (anon) ključ je u pregledaču. Ko zna adresu
--    baze mogao je da pročita tuđi sastav i kapitena PRE roka, iako aplikacija
--    to nigde ne prikazuje (stranica /tim/[id] pokazuje samo zaključana kola).
--
--    Od sada: svoj sastav uvek, tuđi tek kad kolu prođe rok.
--
--    Šta ovo NE dira:
--      - v_player_ownership, v_player_ownership_current i ostali v_* pogledi
--        rade sa pravima vlasnika (nisu security_invoker), pa i dalje broje
--        sve sastave;
--      - SECURITY DEFINER funkcije (save_squad, apply_transfers, carry_over…)
--        i service role (obračun, cron, slika za deljenje) zaobilaze RLS;
--      - sve stranice koje čitaju TUĐ sastav (/tim/[id], /poredi/[id]) traže
--        samo zaključana kola — provereno u kodu pre ove migracije.
--
-- 2) FUNKCIJE ZA OBRAČUN NISU BILE ZATVORENE ZA KORISNIKE
--    Migracije 007 i 015 su uradile samo REVOKE ... FROM PUBLIC. Na Supabase-u
--    role anon i authenticated dobijaju EXECUTE posebno (podrazumevane
--    privilegije šeme public), pa REVOKE FROM PUBLIC njima ništa ne oduzima.
--    Prijavljen korisnik je zato mogao da pozove npr. score_write_user_points
--    i upiše sebi poene. Migracija 017 je to već radila ispravno za
--    apply_price_changes; ovde se isto primenjuje na ostale.
--
-- Pokreni posle 021-nacionalnost.sql.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) squads — čitanje samo svog sastava ili sastava zaključanog kola
-- ----------------------------------------------------------------------------
-- (select auth.uid()) i nekorelisan podupit nad gameweeks se izračunavaju
-- jednom po upitu, ne po redu.

DROP POLICY IF EXISTS "squads_select_all" ON public.squads;
DROP POLICY IF EXISTS "squads_select_own_or_locked" ON public.squads;

CREATE POLICY "squads_select_own_or_locked" ON public.squads
    FOR SELECT
    USING (
        user_id = (SELECT auth.uid())
        OR gameweek_id IN (
            SELECT g.id FROM public.gameweeks g WHERE g.deadline_at <= now()
        )
    );


-- ----------------------------------------------------------------------------
-- 2) Funkcije koje sme da zove SAMO service role
-- ----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.score_write_stat_points(JSONB)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.score_refresh_player_totals(UUID)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.score_write_user_points(UUID, JSONB)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.score_write_auto_subs(UUID, JSONB)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.carry_over_all_squads(UUID)           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_price_changes(UUID, JSONB)      FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.score_write_stat_points(JSONB)         TO service_role;
GRANT EXECUTE ON FUNCTION public.score_refresh_player_totals(UUID)      TO service_role;
GRANT EXECUTE ON FUNCTION public.score_write_user_points(UUID, JSONB)   TO service_role;
GRANT EXECUTE ON FUNCTION public.score_write_auto_subs(UUID, JSONB)     TO service_role;
GRANT EXECUTE ON FUNCTION public.carry_over_all_squads(UUID)            TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_price_changes(UUID, JSONB)       TO service_role;


-- ----------------------------------------------------------------------------
-- PROVERA (pokreni posebno, posle migracije)
-- ----------------------------------------------------------------------------
-- a) Politika nad squads — treba da postoji samo "squads_select_own_or_locked":
--
--   SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'squads';
--
-- b) Prava nad funkcijama — kolone anon i auth treba da budu FALSE u svim
--    redovima, service TRUE:
--
--   SELECT p.proname,
--          has_function_privilege('anon', p.oid, 'execute')          AS anon,
--          has_function_privilege('authenticated', p.oid, 'execute') AS auth,
--          has_function_privilege('service_role', p.oid, 'execute')  AS service
--     FROM pg_proc p
--    WHERE p.pronamespace = 'public'::regnamespace
--      AND p.proname IN ('score_write_stat_points', 'score_refresh_player_totals',
--                        'score_write_user_points', 'score_write_auto_subs',
--                        'carry_over_all_squads', 'apply_price_changes');
