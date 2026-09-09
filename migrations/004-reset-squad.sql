-- ============================================================================
-- Fudaristo — migracija 004
-- reset_squad(): briše sačuvan sastav i vraća budžet, tako da korisnik može da
-- gradi tim ispočetka.
--
-- Dozvoljeno SAMO dok je korisnik u fazi prvog građenja tima (nema sastav ni u
-- jednom ranijem kolu) i dok rok tog kola nije prošao. Da je dozvoljeno kasnije,
-- reset bi bio besplatan način da se zaobiđe −4 penal na transfere.
--
-- Pokreni posle 003-security-and-rpc.sql. Bezbedno je pokrenuti više puta.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reset_squad(p_gameweek_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user      UUID := auth.uid();
    v_deadline  TIMESTAMPTZ;
    v_gwnum     INT;
    v_refund    NUMERIC;
    v_removed   INT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Niste prijavljeni.';
    END IF;

    SELECT deadline_at, number INTO v_deadline, v_gwnum
      FROM gameweeks WHERE id = p_gameweek_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Kolo ne postoji.';
    END IF;
    IF v_deadline <= now() THEN
        RAISE EXCEPTION 'Rok za ovo kolo je istekao — tim se više ne može prazniti.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM squads s JOIN gameweeks g ON g.id = s.gameweek_id
         WHERE s.user_id = v_user AND g.number < v_gwnum
    ) THEN
        RAISE EXCEPTION 'Tim se prazni samo pre prvog roka. Kasnije izmene idu kroz transfere.';
    END IF;

    SELECT COALESCE(sum(purchase_price), 0) INTO v_refund
      FROM squads WHERE user_id = v_user AND gameweek_id = p_gameweek_id;

    DELETE FROM squads WHERE user_id = v_user AND gameweek_id = p_gameweek_id;
    GET DIAGNOSTICS v_removed = ROW_COUNT;

    IF v_removed = 0 THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_squad');
    END IF;

    -- Transferi iz ove faze su svi bez penala, pa ih brišemo zajedno sa timom
    -- da istorija ne prikazuje transfere za igrače kojih više nema.
    DELETE FROM transfers WHERE user_id = v_user AND gameweek_id = p_gameweek_id;

    UPDATE users
       SET budget_remaining = round(budget_remaining + v_refund, 1),
           updated_at = now()
     WHERE id = v_user;

    RETURN jsonb_build_object('ok', TRUE, 'removed', v_removed, 'refunded', round(v_refund, 1));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_squad(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_squad(UUID) TO authenticated;

-- ============================================================================
-- KRAJ migracije 004
-- ============================================================================
