-- Ručna rekalkulacija cena igrača (admin).
--
-- apply_price_changes upisuje nove cene i istoriju u JEDNOJ transakciji: ili se
-- primene sve, ili ni jedna. Pozivaju je samo admin akcije (service role) —
-- korisnici i anon nemaju pravo izvršavanja. Igrači koji su već u timovima
-- ostaju po kupovnoj ceni (squads.purchase_price), pa promena cene utiče samo
-- na buduće kupovine.
--
-- p_changes: JSON niz oblika
--   [{"player_id": "...", "new_price": 7.1, "net_transfers": 11}, ...]
--
-- Pokreni jednom u Supabase SQL editoru. Ponovno pokretanje je bezopasno.

CREATE OR REPLACE FUNCTION public.apply_price_changes(p_gameweek_id UUID, p_changes JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r        RECORD;
    v_old    NUMERIC(4,1);
    v_new    NUMERIC(4,1);
    v_now    TIMESTAMPTZ := now();
    v_count  INT := 0;
BEGIN
    IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' THEN
        RAISE EXCEPTION 'p_changes mora biti JSON niz';
    END IF;
    IF jsonb_array_length(p_changes) > 500 THEN
        RAISE EXCEPTION 'Previše promena odjednom (najviše 500)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM gameweeks WHERE id = p_gameweek_id) THEN
        RAISE EXCEPTION 'Kolo ne postoji';
    END IF;

    FOR r IN
        SELECT (e->>'player_id')::UUID                       AS pid,
               (e->>'new_price')::NUMERIC                    AS np,
               COALESCE((e->>'net_transfers')::INT, 0)       AS net
          FROM jsonb_array_elements(p_changes) e
    LOOP
        IF r.np IS NULL OR r.np < 1.0 OR r.np > 20.0 THEN
            RAISE EXCEPTION 'Cena % je van dozvoljenog opsega (1.0–20.0)', r.np;
        END IF;
        v_new := round(r.np, 1);

        SELECT price INTO v_old FROM players WHERE id = r.pid FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Igrač % ne postoji', r.pid;
        END IF;
        IF v_old = v_new THEN
            CONTINUE; -- bez promene
        END IF;

        UPDATE players SET price = v_new, updated_at = v_now WHERE id = r.pid;
        INSERT INTO player_price_history (player_id, gameweek_id, old_price, new_price, net_transfers, changed_at)
        VALUES (r.pid, p_gameweek_id, v_old, v_new, r.net, v_now);
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('ok', TRUE, 'applied', v_count, 'changed_at', v_now);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_price_changes(UUID, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_price_changes(UUID, JSONB) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_price_changes(UUID, JSONB) TO service_role;
