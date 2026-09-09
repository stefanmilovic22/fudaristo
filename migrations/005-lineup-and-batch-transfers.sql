-- ============================================================================
-- Fudaristo — migracija 005
-- Dve nove funkcije za "My Team" ekran:
--   update_lineup()    — izmena postave, klupe i kapitena nad već sačuvanim timom
--   apply_transfers()  — VIŠE transfera odjednom, atomično (Faza 8)
--
-- Obe rade samo dok rok kola nije prošao. Kao i ranije, klijent nema pravo
-- pisanja u squads/transfers — sve ide kroz ove funkcije.
--
-- Pokreni posle 004-reset-squad.sql. Bezbedno je pokrenuti više puta.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- update_lineup — postava, klupa, kapiten
-- ----------------------------------------------------------------------------
-- p_players: [{ player_id, is_starting, squad_order, is_captain, is_vice_captain }]
--
-- Ne dodaje i ne uklanja igrače: skup poslatih ID-jeva mora biti TAČNO jednak
-- sastavu koji korisnik već ima za to kolo. Za promenu igrača postoji
-- apply_transfers().

CREATE OR REPLACE FUNCTION public.update_lineup(
    p_gameweek_id UUID,
    p_players     JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user     UUID := auth.uid();
    v_deadline TIMESTAMPTZ;
    v_n INT; v_distinct INT; v_owned INT; v_squad_size INT;
    v_start INT; v_sgk INT; v_sdef INT; v_smid INT; v_sfwd INT;
    v_cap INT; v_vice INT; v_capstart INT; v_vicestart INT; v_both INT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni.'; END IF;

    SELECT deadline_at INTO v_deadline FROM gameweeks WHERE id = p_gameweek_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kolo ne postoji.'; END IF;
    IF v_deadline <= now() THEN RAISE EXCEPTION 'Rok za ovo kolo je istekao.'; END IF;

    SELECT count(*) INTO v_squad_size
      FROM squads WHERE user_id = v_user AND gameweek_id = p_gameweek_id;
    IF v_squad_size = 0 THEN RAISE EXCEPTION 'Nemaš sastav za ovo kolo.'; END IF;

    WITH picks AS (
        SELECT (e->>'player_id')::UUID                           AS player_id,
               COALESCE((e->>'is_starting')::BOOLEAN, FALSE)     AS is_starting,
               COALESCE((e->>'is_captain')::BOOLEAN, FALSE)      AS is_captain,
               COALESCE((e->>'is_vice_captain')::BOOLEAN, FALSE) AS is_vice_captain
        FROM jsonb_array_elements(p_players) e
    ), j AS (
        SELECT pk.*, p.position,
               EXISTS (SELECT 1 FROM squads s
                        WHERE s.user_id = v_user
                          AND s.gameweek_id = p_gameweek_id
                          AND s.player_id = pk.player_id) AS owned
        FROM picks pk LEFT JOIN players p ON p.id = pk.player_id
    )
    SELECT count(*),
           count(DISTINCT player_id),
           count(*) FILTER (WHERE owned),
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
      INTO v_n, v_distinct, v_owned, v_start, v_sgk, v_sdef, v_smid, v_sfwd,
           v_cap, v_vice, v_capstart, v_vicestart, v_both
      FROM j;

    IF v_n <> v_squad_size OR v_distinct <> v_squad_size OR v_owned <> v_squad_size THEN
        RAISE EXCEPTION 'Postava mora sadržati tačno tvoj postojeći sastav — za promenu igrača koristi transfere.';
    END IF;
    IF v_start <> 11 THEN RAISE EXCEPTION 'Prva postava mora imati tačno 11 igrača.'; END IF;
    IF v_sgk <> 1 THEN RAISE EXCEPTION 'U prvih 11 mora biti tačno 1 golman.'; END IF;
    IF v_sdef < 3 OR v_sdef > 5 THEN RAISE EXCEPTION 'Odbrana u prvih 11: dozvoljeno 3-5.'; END IF;
    IF v_smid < 2 OR v_smid > 5 THEN RAISE EXCEPTION 'Vezni red u prvih 11: dozvoljeno 2-5.'; END IF;
    IF v_sfwd < 1 OR v_sfwd > 3 THEN RAISE EXCEPTION 'Napad u prvih 11: dozvoljeno 1-3.'; END IF;
    IF v_cap <> 1 OR v_vice <> 1 THEN RAISE EXCEPTION 'Mora biti tačno jedan kapiten i jedan vice-kapiten.'; END IF;
    IF v_both > 0 THEN RAISE EXCEPTION 'Kapiten i vice-kapiten ne mogu biti isti igrač.'; END IF;
    IF v_capstart <> 1 OR v_vicestart <> 1 THEN RAISE EXCEPTION 'Kapiten i vice-kapiten moraju biti u prvih 11.'; END IF;

    UPDATE squads s
       SET is_starting     = COALESCE((e->>'is_starting')::BOOLEAN, FALSE),
           squad_order     = COALESCE((e->>'squad_order')::SMALLINT, s.squad_order),
           is_captain      = COALESCE((e->>'is_captain')::BOOLEAN, FALSE),
           is_vice_captain = COALESCE((e->>'is_vice_captain')::BOOLEAN, FALSE)
      FROM jsonb_array_elements(p_players) e
     WHERE s.user_id = v_user
       AND s.gameweek_id = p_gameweek_id
       AND s.player_id = (e->>'player_id')::UUID;

    RETURN jsonb_build_object('ok', TRUE);
END;
$$;


-- ----------------------------------------------------------------------------
-- apply_transfers — više transfera u jednoj potvrdi
-- ----------------------------------------------------------------------------
-- p_transfers: [{ player_out, player_in }]
--
-- Ceo paket prolazi ili pada zajedno. Budžet i limit od 3 igrača po klubu se
-- proveravaju na KONAČNOM sastavu, ne posle svakog pojedinačnog transfera —
-- tako korisnik može da proda dva igrača iz istog kluba i kupi dva iz drugog, a
-- da ga međukorak ne blokira. To je i razlog zašto je ovo jedna funkcija, a ne
-- petlja nad make_transfer().

CREATE OR REPLACE FUNCTION public.apply_transfers(
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

    v_paid  := CASE WHEN v_pre THEN 0 ELSE greatest(0, v_count - v_free) END;
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
                CASE WHEN v_pre OR i <= v_free THEN 0 ELSE -4 END);

        DELETE FROM squads WHERE id = r.squad_id;

        -- Novi igrač nasleđuje mesto starog: postava/klupa, redosled i traku.
        INSERT INTO squads (user_id, gameweek_id, player_id, is_starting, squad_order,
                            is_captain, is_vice_captain, purchase_price)
        VALUES (v_user, p_gameweek_id, r.in_id, r.is_starting, r.squad_order,
                r.is_captain, r.is_vice_captain, r.in_price);
    END LOOP;

    UPDATE users
       SET budget_remaining = v_new_budget,
           free_transfers = CASE WHEN v_pre THEN free_transfers
                                 ELSE greatest(0, free_transfers - v_count) END,
           updated_at = now()
     WHERE id = v_user;

    RETURN jsonb_build_object(
        'ok', TRUE,
        'transfers', v_count,
        'points_cost', v_points,
        'budget_remaining', v_new_budget,
        'pre_season', v_pre
    );
END;
$$;


REVOKE EXECUTE ON FUNCTION public.update_lineup(UUID, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_transfers(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_lineup(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_transfers(UUID, JSONB) TO authenticated;

-- ============================================================================
-- KRAJ migracije 005
-- ============================================================================
