-- ============================================================================
-- Fudaristo — migracija 008
-- Čipovi: aktivacija iz aplikacije + efekat Jokera na cenu transfera.
--
-- Do sad je scoring engine (Faza 6) ISPRAVNO obračunavao Triple Captain i
-- Favorite Club x2 čim bi red postojao u chips_usage — ali ništa u aplikaciji
-- nije umelo da taj red napiše. Ova migracija zatvara krug.
--
-- Pokreni posle 007-scoring-bulk-writes.sql. Bezbedno je pokrenuti više puta.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) BEZBEDNOST: pisanje u chips_usage se oduzima klijentu
-- ----------------------------------------------------------------------------
-- Politika "chips_insert_own" je dozvoljavala INSERT za bilo koje kolo — dakle
-- i za kolo čiji je rok davno prošao, pošto RLS proverava samo vlasništvo, ne
-- i rok. Praktično: korisnik je mogao preko anon ključa da doda Triple Captain
-- na već odigrano kolo i, pri sledećem ponovnom obračunu tog kola, dobije 3x
-- kapitena retroaktivno.
--
-- Isti obrazac kao squads/transfers u migraciji 003: sve pisanje ide kroz
-- funkcije koje rok proveravaju u bazi.

REVOKE INSERT, UPDATE, DELETE ON public.chips_usage FROM authenticated, anon;

DROP POLICY IF EXISTS "chips_insert_own" ON chips_usage;


-- ----------------------------------------------------------------------------
-- 2) GAMEWEEKS.JOKER_WINDOW — u kom kolu se koji Joker sme aktivirati
-- ----------------------------------------------------------------------------
-- Triple Captain i Favorite Club x2 su po GDD-u "slobodno" — bilo koje kolo,
-- jednom po sezoni. Jokeri nisu: #1 je vezan za zimsku pauzu, #2 za prelazak u
-- plej-of. Ta dva trenutka nigde ne postoje kao podatak, pa se ovde uvode kao
-- oznaka na kolu.
--
-- ⚠️ PRETPOSTAVKA, lako se menja: joker_2 se dole automatski postavlja na PRVO
-- kolo koje nije u 'regular' fazi (to JESTE "prelazak u plej-of", izvedeno iz
-- gameweeks.phase). joker_1 ("zimska pauza") se NE može izvesti iz šeme — nema
-- kolone koja pauzu opisuje — pa ga admin bira sam, na /admin. Dok nije
-- izabran, Joker #1 se prosto ne nudi nikome.

ALTER TABLE gameweeks ADD COLUMN IF NOT EXISTS joker_window transfer_chip_type;

ALTER TABLE gameweeks DROP CONSTRAINT IF EXISTS gameweeks_joker_window_check;
ALTER TABLE gameweeks ADD CONSTRAINT gameweeks_joker_window_check
    CHECK (joker_window IS NULL OR joker_window IN ('joker_1', 'joker_2'));

-- Najviše jedno kolo po tipu jokera.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gameweeks_joker_window
    ON gameweeks(joker_window) WHERE joker_window IS NOT NULL;

-- joker_2 = prvo kolo van regularne sezone. Postavlja se samo ako već nije
-- postavljen (da admin ručna izmena ne bude pregažena ponovnim pokretanjem).
UPDATE gameweeks
   SET joker_window = 'joker_2'
 WHERE id = (
        SELECT id FROM gameweeks
         WHERE phase <> 'regular'
           AND NOT EXISTS (SELECT 1 FROM gameweeks g2 WHERE g2.joker_window = 'joker_2')
         ORDER BY number
         LIMIT 1
      );


-- ----------------------------------------------------------------------------
-- 3) activate_chip — jedini način da čip uđe u chips_usage
-- ----------------------------------------------------------------------------
-- Baza već čuva dva pravila preko UNIQUE ograničenja (svaki čip jednom po
-- sezoni; najviše jedan čip po kolu). Ovde se ona hvataju unapred da korisnik
-- dobije razumljivu poruku umesto sirove greške o ograničenju.

CREATE OR REPLACE FUNCTION public.activate_chip(
    p_gameweek_id UUID,
    p_chip        transfer_chip_type
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user     UUID := auth.uid();
    v_deadline TIMESTAMPTZ;
    v_window   transfer_chip_type;
    v_used_gw  INT;
    v_other    transfer_chip_type;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni.'; END IF;

    SELECT deadline_at, joker_window INTO v_deadline, v_window
      FROM gameweeks WHERE id = p_gameweek_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kolo ne postoji.'; END IF;
    IF v_deadline <= now() THEN RAISE EXCEPTION 'Rok za ovo kolo je istekao.'; END IF;

    -- Jokeri samo u svom prozoru.
    IF p_chip IN ('joker_1', 'joker_2') AND v_window IS DISTINCT FROM p_chip THEN
        RAISE EXCEPTION 'Taj Joker se ne može aktivirati u ovom kolu.';
    END IF;

    -- Već iskorišćen ove sezone?
    SELECT g.number INTO v_used_gw
      FROM chips_usage c JOIN gameweeks g ON g.id = c.gameweek_id
     WHERE c.user_id = v_user AND c.chip_type = p_chip;
    IF FOUND THEN
        RAISE EXCEPTION 'Taj čip je već iskorišćen u % kolu.', v_used_gw;
    END IF;

    -- Drugi čip već aktivan u ovom kolu?
    SELECT chip_type INTO v_other
      FROM chips_usage WHERE user_id = v_user AND gameweek_id = p_gameweek_id;
    IF FOUND THEN
        RAISE EXCEPTION 'U ovom kolu je već aktivan drugi čip (%). Otkaži ga pa probaj ponovo.', v_other;
    END IF;

    INSERT INTO chips_usage (user_id, gameweek_id, chip_type)
    VALUES (v_user, p_gameweek_id, p_chip);

    RETURN jsonb_build_object('ok', TRUE, 'chip', p_chip);
END;
$$;


-- ----------------------------------------------------------------------------
-- 4) cancel_chip — predomišljanje pre roka
-- ----------------------------------------------------------------------------
-- Triple Captain i Favorite Club x2 se smeju otkazati slobodno pre roka: oni
-- utiču samo na obračun, koji se dešava posle roka, pa otkazivanje ne ostavlja
-- trag.
--
-- Joker NE sme, ako je već korišćen: cena transfera se upisuje u trenutku
-- transfera. Ko aktivira Joker, napravi 10 besplatnih transfera pa otkaže čip,
-- zadržao bi i transfere i čip. Zato se otkazivanje odbija čim za to kolo
-- postoji ijedan transfer.

CREATE OR REPLACE FUNCTION public.cancel_chip(p_gameweek_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user     UUID := auth.uid();
    v_deadline TIMESTAMPTZ;
    v_chip     transfer_chip_type;
    v_transfers INT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni.'; END IF;

    SELECT deadline_at INTO v_deadline FROM gameweeks WHERE id = p_gameweek_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kolo ne postoji.'; END IF;
    IF v_deadline <= now() THEN RAISE EXCEPTION 'Rok za ovo kolo je istekao.'; END IF;

    SELECT chip_type INTO v_chip
      FROM chips_usage WHERE user_id = v_user AND gameweek_id = p_gameweek_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_chip');
    END IF;

    IF v_chip IN ('joker_1', 'joker_2') THEN
        SELECT count(*) INTO v_transfers
          FROM transfers WHERE user_id = v_user AND gameweek_id = p_gameweek_id;
        IF v_transfers > 0 THEN
            RAISE EXCEPTION
                'Joker se ne može otkazati — već si napravio % transfer(a) pod njim.', v_transfers;
        END IF;
    END IF;

    DELETE FROM chips_usage WHERE user_id = v_user AND gameweek_id = p_gameweek_id;

    RETURN jsonb_build_object('ok', TRUE, 'chip', v_chip);
END;
$$;


-- ----------------------------------------------------------------------------
-- 5) make_transfer i apply_transfers — Joker poništava cenu transfera
-- ----------------------------------------------------------------------------
-- Obe funkcije su prepisane u celini (CREATE OR REPLACE) iz migracija 003 i
-- 005; jedina razlika je v_joker. Scoring engine se ne dira — on samo SABIRA
-- transfers.points_cost i nikad nije odlučivao o penalu.

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
    v_joker     BOOLEAN;
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

    -- Joker (wildcard): dok je aktivan u ovom kolu, svaki transfer je besplatan
    -- i slobodni transferi se NE troše. Aktivira se preko activate_chip(), koji
    -- proverava i da li je kolo uopšte joker-prozor.
    SELECT EXISTS (
        SELECT 1 FROM chips_usage
         WHERE user_id = v_user AND gameweek_id = p_gameweek_id
           AND chip_type IN ('joker_1', 'joker_2')
    ) INTO v_joker;

    v_cost := CASE WHEN v_pre OR v_joker THEN 0 WHEN v_free > 0 THEN 0 ELSE -4 END;

    INSERT INTO transfers (user_id, gameweek_id, player_out_id, player_in_id, points_cost)
    VALUES (v_user, p_gameweek_id, p_player_out, p_player_in, v_cost);

    DELETE FROM squads WHERE id = v_out.id;

    INSERT INTO squads (user_id, gameweek_id, player_id, is_starting, squad_order,
                        is_captain, is_vice_captain, purchase_price)
    VALUES (v_user, p_gameweek_id, p_player_in, v_out.is_starting, v_out.squad_order,
            v_out.is_captain, v_out.is_vice_captain, v_in_price);

    UPDATE users
       SET budget_remaining = v_new_budget,
           free_transfers = CASE WHEN v_pre OR v_joker THEN free_transfers
                                 ELSE greatest(0, free_transfers - 1) END,
           updated_at = now()
     WHERE id = v_user;

    RETURN jsonb_build_object(
        'ok', TRUE,
        'points_cost', v_cost,
        'budget_remaining', v_new_budget,
        'pre_season', v_pre,
        'joker', v_joker
    );
END;
$$;CREATE OR REPLACE FUNCTION public.apply_transfers(
    p_gameweek_id UUID,
    p_transfers   JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user      UUID := auth.uid();
    v_deadline  TIMESTAMPTZ;
    v_gwnum     INT;
    v_count     INT;
    v_bad       INT;
    v_budget    NUMERIC;
    v_free      INT;
    v_refund    NUMERIC;
    v_cost      NUMERIC;
    v_new_budget NUMERIC;
    v_pre       BOOLEAN;
    v_joker     BOOLEAN;
    v_paid      INT;
    v_points    INT;
    v_maxclub   INT;
    r           RECORD;
    i           INT := 0;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni.'; END IF;

    SELECT deadline_at, number INTO v_deadline, v_gwnum FROM gameweeks WHERE id = p_gameweek_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kolo ne postoji.'; END IF;
    IF v_deadline <= now() THEN RAISE EXCEPTION 'Rok za ovo kolo je istekao.'; END IF;

    -- DROP pre CREATE: ako bi neko pozvao funkciju dvaput u istoj transakciji,
    -- ON COMMIT DROP još nije odradio posao i CREATE bi pukao.
    DROP TABLE IF EXISTS _tr;
    CREATE TEMP TABLE _tr ON COMMIT DROP AS
    SELECT (e->>'player_out')::UUID AS out_id,
           (e->>'player_in')::UUID  AS in_id
      FROM jsonb_array_elements(p_transfers) e;

    SELECT count(*) INTO v_count FROM _tr;
    IF v_count = 0 THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_transfers');
    END IF;

    -- Nijedan igrač ne sme da se pojavi dvaput, ni sa iste ni sa suprotne strane
    -- (lanac "prodaj pa opet prodaj istog" nema smisla i UI ga ne pravi).
    SELECT count(*) INTO v_bad FROM (
        SELECT out_id AS id FROM _tr UNION ALL SELECT in_id FROM _tr
    ) t GROUP BY id HAVING count(*) > 1;
    IF COALESCE(v_bad, 0) > 0 THEN
        RAISE EXCEPTION 'Isti igrač se pojavljuje u više transfera.';
    END IF;

    -- Svaki prodati igrač mora biti u sastavu
    SELECT count(*) INTO v_bad FROM _tr t
     WHERE NOT EXISTS (SELECT 1 FROM squads s
                        WHERE s.user_id = v_user AND s.gameweek_id = p_gameweek_id
                          AND s.player_id = t.out_id);
    IF v_bad > 0 THEN RAISE EXCEPTION 'Jedan od igrača koje prodaješ nije u tvom sastavu.'; END IF;

    -- Svaki kupljeni mora postojati, biti aktivan, i ne sme već biti u timu
    SELECT count(*) INTO v_bad FROM _tr t
      LEFT JOIN players p ON p.id = t.in_id
     WHERE p.id IS NULL OR NOT p.is_active;
    IF v_bad > 0 THEN RAISE EXCEPTION 'Jedan od igrača koje kupuješ ne postoji ili nije aktivan.'; END IF;

    SELECT count(*) INTO v_bad FROM _tr t
     WHERE EXISTS (SELECT 1 FROM squads s
                    WHERE s.user_id = v_user AND s.gameweek_id = p_gameweek_id
                      AND s.player_id = t.in_id);
    IF v_bad > 0 THEN RAISE EXCEPTION 'Jedan od igrača koje kupuješ je već u tvom timu.'; END IF;

    -- Pozicija mora da se poklopi
    SELECT count(*) INTO v_bad
      FROM _tr t
      JOIN players po ON po.id = t.out_id
      JOIN players pi ON pi.id = t.in_id
     WHERE po.position <> pi.position;
    IF v_bad > 0 THEN RAISE EXCEPTION 'Svaka zamena mora biti na istoj poziciji.'; END IF;

    -- Budžet na KONAČNOM sastavu
    SELECT budget_remaining, free_transfers INTO v_budget, v_free FROM users WHERE id = v_user;

    SELECT COALESCE(sum(s.purchase_price), 0) INTO v_refund
      FROM _tr t JOIN squads s
        ON s.user_id = v_user AND s.gameweek_id = p_gameweek_id AND s.player_id = t.out_id;

    SELECT COALESCE(sum(p.price), 0) INTO v_cost
      FROM _tr t JOIN players p ON p.id = t.in_id;

    v_new_budget := round(v_budget + v_refund - v_cost, 1);
    IF v_new_budget < 0 THEN
        RAISE EXCEPTION 'Nedovoljno budžeta — nedostaje % M.', round(-v_new_budget, 1);
    END IF;

    -- Max 3 po klubu na KONAČNOM sastavu
    SELECT COALESCE(max(c), 0) INTO v_maxclub FROM (
        SELECT count(*) AS c FROM (
            SELECT p.club_id
              FROM squads s JOIN players p ON p.id = s.player_id
             WHERE s.user_id = v_user AND s.gameweek_id = p_gameweek_id
               AND s.player_id NOT IN (SELECT out_id FROM _tr)
            UNION ALL
            SELECT p.club_id FROM _tr t JOIN players p ON p.id = t.in_id
        ) final GROUP BY club_id
    ) t;
    IF v_maxclub > 3 THEN RAISE EXCEPTION 'Najviše 3 igrača iz istog kluba.'; END IF;

    -- Penali: pre prvog roka sve besplatno; inače prvih v_free bez penala, ostalo -4
    SELECT NOT EXISTS (
        SELECT 1 FROM squads s JOIN gameweeks g ON g.id = s.gameweek_id
         WHERE s.user_id = v_user AND g.number < v_gwnum
    ) INTO v_pre;

    SELECT EXISTS (
        SELECT 1 FROM chips_usage
         WHERE user_id = v_user AND gameweek_id = p_gameweek_id
           AND chip_type IN ('joker_1', 'joker_2')
    ) INTO v_joker;

    v_paid  := CASE WHEN v_pre OR v_joker THEN 0 ELSE greatest(0, v_count - v_free) END;
    v_points := -4 * v_paid;

    -- Upis: redosled je bitan samo utoliko što stari red mora da nestane pre
    -- nego što novi uđe (UNIQUE na user+gameweek+player).
    FOR r IN
        SELECT t.out_id, t.in_id, s.id AS squad_id, s.is_starting, s.squad_order,
               s.is_captain, s.is_vice_captain, p.price AS in_price
          FROM _tr t
          JOIN squads s ON s.user_id = v_user AND s.gameweek_id = p_gameweek_id
                       AND s.player_id = t.out_id
          JOIN players p ON p.id = t.in_id
    LOOP
        i := i + 1;

        INSERT INTO transfers (user_id, gameweek_id, player_out_id, player_in_id, points_cost)
        VALUES (v_user, p_gameweek_id, r.out_id, r.in_id,
                CASE WHEN v_pre OR v_joker OR i <= v_free THEN 0 ELSE -4 END);

        DELETE FROM squads WHERE id = r.squad_id;

        -- Novi igrač nasleđuje mesto starog: postava/klupa, redosled i traku.
        INSERT INTO squads (user_id, gameweek_id, player_id, is_starting, squad_order,
                            is_captain, is_vice_captain, purchase_price)
        VALUES (v_user, p_gameweek_id, r.in_id, r.is_starting, r.squad_order,
                r.is_captain, r.is_vice_captain, r.in_price);
    END LOOP;

    UPDATE users
       SET budget_remaining = v_new_budget,
           free_transfers = CASE WHEN v_pre OR v_joker THEN free_transfers
                                 ELSE greatest(0, free_transfers - v_count) END,
           updated_at = now()
     WHERE id = v_user;

    RETURN jsonb_build_object(
        'ok', TRUE,
        'transfers', v_count,
        'points_cost', v_points,
        'budget_remaining', v_new_budget,
        'pre_season', v_pre,
        'joker', v_joker
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- Dozvole
-- ----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.activate_chip(UUID, transfer_chip_type) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_chip(UUID)                       FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.activate_chip(UUID, transfer_chip_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_chip(UUID)                       TO authenticated;

-- ============================================================================
-- KRAJ migracije 008
-- ============================================================================
