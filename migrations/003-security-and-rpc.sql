-- ============================================================================
-- Fudaristo — migracija 003
-- Zatvara RLS rupu (self-admin / self-budget), premešta sve upise sastava i
-- transfera u atomične SECURITY DEFINER funkcije sa serverskom proverom
-- deadline-a, i dodaje prenos sastava iz kola u kolo.
--
-- Pokreni CEO fajl u Supabase → SQL Editor → New query → Run.
-- Bezbedno je pokrenuti više puta (sve je IF EXISTS / OR REPLACE).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) USERS — korisnik više ne sme sam sebi da menja is_admin/budžet/poene
-- ----------------------------------------------------------------------------
-- Do sada je politika "users_update_own" imala samo USING, bez WITH CHECK, a
-- Supabase po difoltu daje `authenticated` roli UPDATE na SVE kolone. Praktično:
-- svaki ulogovan korisnik je preko anon ključa mogao da uradi
--   update users set is_admin = true, budget_remaining = 999 where id = auth.uid();
--
-- Kolone-privilegije su jači sloj od RLS-a: ne mogu se zaobići ni jednom
-- politikom. SECURITY DEFINER funkcije ispod se izvršavaju kao vlasnik
-- (postgres) pa na njih ovo ograničenje ne utiče.

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

REVOKE UPDATE ON public.users FROM authenticated, anon;
GRANT UPDATE (team_name, team_color, favorite_club_id, updated_at)
    ON public.users TO authenticated;


-- ----------------------------------------------------------------------------
-- 2) SQUADS / TRANSFERS — nikakvo direktno pisanje iz klijenta
-- ----------------------------------------------------------------------------
-- Ranije je klijent mogao da upiše sastav za BILO KOJE kolo, uključujući ono
-- kom je rok istekao (RLS je proveravao samo vlasništvo, ne i deadline).
-- Od sada sve ide kroz save_squad() / make_transfer() ispod, koje rok proveravaju
-- na serveru i rade sve upise u JEDNOJ transakciji.

DROP POLICY IF EXISTS "squads_insert_own" ON public.squads;
DROP POLICY IF EXISTS "squads_update_own" ON public.squads;
DROP POLICY IF EXISTS "squads_delete_own" ON public.squads;
DROP POLICY IF EXISTS "transfers_insert_own" ON public.transfers;

REVOKE INSERT, UPDATE, DELETE ON public.squads FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.transfers FROM authenticated, anon;


-- ----------------------------------------------------------------------------
-- 3) save_squad — upis PRVOG sastava za kolo (15 igrača + formacija + kapiten)
-- ----------------------------------------------------------------------------
-- p_players: [{ player_id, is_starting, squad_order, is_captain, is_vice_captain }]
-- Cena se NE uzima iz klijenta — čita se iz players.price u istoj transakciji.

CREATE OR REPLACE FUNCTION public.save_squad(
    p_gameweek_id UUID,
    p_players     JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user      UUID := auth.uid();
    v_deadline  TIMESTAMPTZ;
    v_budget    NUMERIC;
    v_total     NUMERIC;
    v_n INT; v_distinct INT; v_missing INT; v_inactive INT;
    v_gk INT; v_def INT; v_mid INT; v_fwd INT;
    v_start INT; v_sgk INT; v_sdef INT; v_smid INT; v_sfwd INT;
    v_cap INT; v_vice INT; v_capstart INT; v_vicestart INT; v_both INT;
    v_maxclub INT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Niste prijavljeni.';
    END IF;

    SELECT deadline_at INTO v_deadline FROM gameweeks WHERE id = p_gameweek_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Kolo ne postoji.';
    END IF;
    IF v_deadline <= now() THEN
        RAISE EXCEPTION 'Rok za ovo kolo je istekao.';
    END IF;

    IF EXISTS (SELECT 1 FROM squads WHERE user_id = v_user AND gameweek_id = p_gameweek_id) THEN
        RAISE EXCEPTION 'Već imaš sastav za ovo kolo — izmene idu kroz transfere.';
    END IF;

    SELECT budget_remaining INTO v_budget FROM users WHERE id = v_user;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil tima ne postoji.';
    END IF;

    WITH picks AS (
        SELECT (e->>'player_id')::UUID                            AS player_id,
               COALESCE((e->>'is_starting')::BOOLEAN, FALSE)      AS is_starting,
               COALESCE((e->>'is_captain')::BOOLEAN, FALSE)       AS is_captain,
               COALESCE((e->>'is_vice_captain')::BOOLEAN, FALSE)  AS is_vice_captain
        FROM jsonb_array_elements(p_players) e
    ), j AS (
        SELECT pk.*, p.position, p.price, p.is_active
        FROM picks pk LEFT JOIN players p ON p.id = pk.player_id
    )
    SELECT count(*),
           count(DISTINCT player_id),
           count(*) FILTER (WHERE position IS NULL),
           count(*) FILTER (WHERE position IS NOT NULL AND is_active IS NOT TRUE),
           COALESCE(sum(price), 0),
           count(*) FILTER (WHERE position = 'GK'),
           count(*) FILTER (WHERE position = 'DEF'),
           count(*) FILTER (WHERE position = 'MID'),
           count(*) FILTER (WHERE position = 'FWD'),
           count(*) FILTER (WHERE is_starting),
           count(*) FILTER (WHERE is_starting AND position = 'GK'),
           count(*) FILTER (WHERE is_starting AND position = 'DEF'),
           count(*) FILTER (WHERE is_starting AND position = 'MID'),
           count(*) FILTER (WHERE is_starting AND position = 'FWD'),
           count(*) FILTER (WHERE is_captain),
           count(*) FILTER (WHERE is_vice_captain),
           count(*) FILTER (WHERE is_captain AND is_starting),
           count(*) FILTER (WHERE is_vice_captain AND is_starting),
           count(*) FILTER (WHERE is_captain AND is_vice_captain)
      INTO v_n, v_distinct, v_missing, v_inactive, v_total,
           v_gk, v_def, v_mid, v_fwd,
           v_start, v_sgk, v_sdef, v_smid, v_sfwd,
           v_cap, v_vice, v_capstart, v_vicestart, v_both
      FROM j;

    IF v_missing > 0 THEN RAISE EXCEPTION 'Neki od poslatih igrača ne postoje.'; END IF;
    IF v_inactive > 0 THEN RAISE EXCEPTION 'Tim sadrži igrače koji više nisu aktivni.'; END IF;
    IF v_n <> 15 OR v_distinct <> 15 THEN RAISE EXCEPTION 'Tim mora imati tačno 15 različitih igrača.'; END IF;
    IF v_gk <> 2 OR v_def <> 5 OR v_mid <> 5 OR v_fwd <> 3 THEN
        RAISE EXCEPTION 'Sastav mora biti 2 GK / 5 DEF / 5 MID / 3 FWD.';
    END IF;
    IF v_start <> 11 THEN RAISE EXCEPTION 'Prva postava mora imati tačno 11 igrača.'; END IF;
    IF v_sgk <> 1 THEN RAISE EXCEPTION 'U prvih 11 mora biti tačno 1 golman.'; END IF;
    IF v_sdef < 3 OR v_sdef > 5 THEN RAISE EXCEPTION 'Odbrana u prvih 11: dozvoljeno 3-5.'; END IF;
    IF v_smid < 2 OR v_smid > 5 THEN RAISE EXCEPTION 'Vezni red u prvih 11: dozvoljeno 2-5.'; END IF;
    IF v_sfwd < 1 OR v_sfwd > 3 THEN RAISE EXCEPTION 'Napad u prvih 11: dozvoljeno 1-3.'; END IF;
    IF v_cap <> 1 OR v_vice <> 1 THEN RAISE EXCEPTION 'Mora biti tačno jedan kapiten i jedan vice-kapiten.'; END IF;
    IF v_both > 0 THEN RAISE EXCEPTION 'Kapiten i vice-kapiten ne mogu biti isti igrač.'; END IF;
    IF v_capstart <> 1 OR v_vicestart <> 1 THEN RAISE EXCEPTION 'Kapiten i vice-kapiten moraju biti u prvih 11.'; END IF;

    SELECT COALESCE(max(c), 0) INTO v_maxclub FROM (
        SELECT count(*) AS c
        FROM jsonb_array_elements(p_players) e
        JOIN players p ON p.id = (e->>'player_id')::UUID
        GROUP BY p.club_id
    ) t;
    IF v_maxclub > 3 THEN RAISE EXCEPTION 'Najviše 3 igrača iz istog kluba.'; END IF;

    IF v_total > v_budget + 0.001 THEN
        RAISE EXCEPTION 'Budžet premašen: % od % M.', round(v_total, 1), round(v_budget, 1);
    END IF;

    INSERT INTO squads (user_id, gameweek_id, player_id, is_starting, squad_order,
                        is_captain, is_vice_captain, purchase_price)
    SELECT v_user,
           p_gameweek_id,
           (e->>'player_id')::UUID,
           COALESCE((e->>'is_starting')::BOOLEAN, FALSE),
           COALESCE((e->>'squad_order')::SMALLINT, 1),
           COALESCE((e->>'is_captain')::BOOLEAN, FALSE),
           COALESCE((e->>'is_vice_captain')::BOOLEAN, FALSE),
           p.price
    FROM jsonb_array_elements(p_players) e
    JOIN players p ON p.id = (e->>'player_id')::UUID;

    UPDATE users
       SET budget_remaining = round(v_budget - v_total, 1),
           updated_at = now()
     WHERE id = v_user;

    RETURN jsonb_build_object('ok', TRUE, 'budget_remaining', round(v_budget - v_total, 1));
END;
$$;


-- ----------------------------------------------------------------------------
-- 4) make_transfer — prodaj jednog, kupi jednog, atomično
-- ----------------------------------------------------------------------------
-- Ranije su ovo bila 4 odvojena zahteva iz browsera (insert transfers → delete
-- squads → insert squads → update users). Ako bi treći pao, korisnik bi trajno
-- ostao sa 14 igrača. Sad je sve jedna transakcija: ili prođe sve, ili ništa.

CREATE OR REPLACE FUNCTION public.make_transfer(
    p_gameweek_id UUID,
    p_player_out  UUID,
    p_player_in   UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user      UUID := auth.uid();
    v_deadline  TIMESTAMPTZ;
    v_gwnum     INT;
    v_out       squads%ROWTYPE;
    v_out_pos   player_position;
    v_in_pos    player_position;
    v_in_price  NUMERIC;
    v_in_club   UUID;
    v_in_active BOOLEAN;
    v_budget    NUMERIC;
    v_free      INT;
    v_new_budget NUMERIC;
    v_clubcount INT;
    v_pre       BOOLEAN;
    v_cost      SMALLINT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni.'; END IF;
    IF p_player_out = p_player_in THEN RAISE EXCEPTION 'Isti igrač na obe strane transfera.'; END IF;

    SELECT deadline_at, number INTO v_deadline, v_gwnum FROM gameweeks WHERE id = p_gameweek_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kolo ne postoji.'; END IF;
    IF v_deadline <= now() THEN RAISE EXCEPTION 'Rok za ovo kolo je istekao.'; END IF;

    SELECT * INTO v_out FROM squads
     WHERE user_id = v_user AND gameweek_id = p_gameweek_id AND player_id = p_player_out;
    IF NOT FOUND THEN RAISE EXCEPTION 'Taj igrač nije u tvom sastavu za ovo kolo.'; END IF;

    IF EXISTS (SELECT 1 FROM squads
                WHERE user_id = v_user AND gameweek_id = p_gameweek_id AND player_id = p_player_in) THEN
        RAISE EXCEPTION 'Taj igrač je već u tvom timu.';
    END IF;

    SELECT position INTO v_out_pos FROM players WHERE id = p_player_out;
    SELECT position, price, club_id, is_active
      INTO v_in_pos, v_in_price, v_in_club, v_in_active
      FROM players WHERE id = p_player_in;

    IF v_in_pos IS NULL THEN RAISE EXCEPTION 'Igrač kog kupuješ ne postoji.'; END IF;
    IF NOT v_in_active THEN RAISE EXCEPTION 'Taj igrač više nije aktivan u ligi.'; END IF;
    IF v_in_pos <> v_out_pos THEN RAISE EXCEPTION 'Zamena mora biti na istoj poziciji.'; END IF;

    SELECT count(*) INTO v_clubcount
      FROM squads s JOIN players p ON p.id = s.player_id
     WHERE s.user_id = v_user
       AND s.gameweek_id = p_gameweek_id
       AND s.player_id <> p_player_out
       AND p.club_id = v_in_club;
    IF v_clubcount + 1 > 3 THEN RAISE EXCEPTION 'Najviše 3 igrača iz istog kluba.'; END IF;

    SELECT budget_remaining, free_transfers INTO v_budget, v_free FROM users WHERE id = v_user;
    v_new_budget := round(v_budget + v_out.purchase_price - v_in_price, 1);
    IF v_new_budget < 0 THEN
        RAISE EXCEPTION 'Nedovoljno budžeta za ovaj transfer (nedostaje % M).', round(-v_new_budget, 1);
    END IF;

    -- GDD sekcija 4: pre PRVOG deadline-a tog korisnika — neograničeni transferi
    -- bez penala. Isto pravilo kao lib/gameweek.ts → isBuildingFirstSquad, samo
    -- sad provereno na serveru (klijent ne odlučuje o svom penalu).
    SELECT NOT EXISTS (
        SELECT 1 FROM squads s JOIN gameweeks g ON g.id = s.gameweek_id
         WHERE s.user_id = v_user AND g.number < v_gwnum
    ) INTO v_pre;

    v_cost := CASE WHEN v_pre THEN 0 WHEN v_free > 0 THEN 0 ELSE -4 END;

    INSERT INTO transfers (user_id, gameweek_id, player_out_id, player_in_id, points_cost)
    VALUES (v_user, p_gameweek_id, p_player_out, p_player_in, v_cost);

    DELETE FROM squads WHERE id = v_out.id;

    INSERT INTO squads (user_id, gameweek_id, player_id, is_starting, squad_order,
                        is_captain, is_vice_captain, purchase_price)
    VALUES (v_user, p_gameweek_id, p_player_in, v_out.is_starting, v_out.squad_order,
            v_out.is_captain, v_out.is_vice_captain, v_in_price);

    UPDATE users
       SET budget_remaining = v_new_budget,
           free_transfers = CASE WHEN v_pre THEN free_transfers ELSE greatest(0, free_transfers - 1) END,
           updated_at = now()
     WHERE id = v_user;

    RETURN jsonb_build_object(
        'ok', TRUE,
        'points_cost', v_cost,
        'budget_remaining', v_new_budget,
        'pre_season', v_pre
    );
END;
$$;


-- ----------------------------------------------------------------------------
-- 5) carry_over_squad — prenos sastava iz prethodnog kola
-- ----------------------------------------------------------------------------
-- Bez ovoga, čim prođe deadline kola N, /moj-tim ne nalazi redove za kolo N+1
-- i nudi squad builder ISPOČETKA (a builder je do sada uvek kretao od punih
-- 100M). Rezultat: nov tim i resetovan budžet svake nedelje.
--
-- Poziva se sa /moj-tim pre čitanja sastava. Radi tačno jednom po kolu jer
-- posle prvog uspešnog poziva korisnik ima sastav za to kolo.

CREATE OR REPLACE FUNCTION public.carry_over_squad(p_gameweek_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user   UUID := auth.uid();
    v_gwnum  INT;
    v_prev   UUID;
    v_copied INT;
BEGIN
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_authenticated');
    END IF;

    SELECT number INTO v_gwnum FROM gameweeks WHERE id = p_gameweek_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_gameweek');
    END IF;

    IF EXISTS (SELECT 1 FROM squads WHERE user_id = v_user AND gameweek_id = p_gameweek_id) THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'already_has_squad');
    END IF;

    SELECT s.gameweek_id INTO v_prev
      FROM squads s JOIN gameweeks g ON g.id = s.gameweek_id
     WHERE s.user_id = v_user AND g.number < v_gwnum
     ORDER BY g.number DESC
     LIMIT 1;

    IF v_prev IS NULL THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_previous_squad');
    END IF;

    BEGIN
        INSERT INTO squads (user_id, gameweek_id, player_id, is_starting, squad_order,
                            is_captain, is_vice_captain, purchase_price)
        SELECT v_user, p_gameweek_id, player_id, is_starting, squad_order,
               is_captain, is_vice_captain, purchase_price
          FROM squads
         WHERE user_id = v_user AND gameweek_id = v_prev;
        GET DIAGNOSTICS v_copied = ROW_COUNT;
    EXCEPTION WHEN unique_violation THEN
        -- Paralelni poziv je već prekopirao sastav — nije greška.
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'already_has_squad');
    END;

    -- Jedan slobodan transfer po kolu, kumulativno do 5 (CHECK u schema.sql).
    -- ⚠️ Ako po GDD-u ovo pripada scoring engine-u (Faza 6), obriši ovaj UPDATE.
    UPDATE users
       SET free_transfers = least(5, free_transfers + 1),
           updated_at = now()
     WHERE id = v_user;

    RETURN jsonb_build_object('ok', TRUE, 'copied', v_copied, 'from_gameweek', v_prev);
END;
$$;


-- ----------------------------------------------------------------------------
-- 6) Prava izvršavanja — samo prijavljeni korisnici
-- ----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.save_squad(UUID, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.make_transfer(UUID, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.carry_over_squad(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_squad(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.make_transfer(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.carry_over_squad(UUID) TO authenticated;


-- ----------------------------------------------------------------------------
-- 7) Profil se pravi na serveru pri registraciji
-- ----------------------------------------------------------------------------
-- Do sada je red u public.users upisivao BROWSER, posle signUp(). Ako taj drugi
-- zahtev padne (izgubljena mreža, zatvoren tab), korisnik ostaje sa auth nalogom
-- bez profila — ne može ni da napravi tim (FK na users), ni da se registruje
-- ponovo sa istim mejlom. Trigger to radi u istoj transakciji kao i sam signUp.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, team_name, team_color, favorite_club_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'team_name', 'Tim ' || left(NEW.id::TEXT, 8)),
        COALESCE(NEW.raw_user_meta_data->>'team_color', '#1E88E5'),
        NULLIF(NEW.raw_user_meta_data->>'favorite_club_id', '')::UUID
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================================
-- KRAJ migracije 003
-- ============================================================================
