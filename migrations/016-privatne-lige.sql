-- Privatne lige (liga sa šifrom pozivnice).
--
-- Tabele leagues / league_memberships i funkcija league_standings već postoje
-- (schema.sql). Ovde se samo:
--  1) popravlja pravilo pristupa — staro pravilo za league_memberships čita iz
--     iste tabele pa PostgreSQL baca "infinite recursion detected in policy";
--     zamenjuje se funkcijom is_league_member (SECURITY DEFINER);
--  2) dodaju funkcije: napravi ligu, pogledaj ligu po šifri, pridruži se,
--     napusti ligu. Upis ide ISKLJUČIVO kroz njih (direktan INSERT je ukinut),
--     pa se ograničenja (broj liga, broj članova, šifra) ne mogu zaobići.
--
-- Ograničenja: najviše 5 liga koje jedan korisnik napravi, najviše 100 članova
-- po ligi. Globalna liga se ne dira.
--
-- Pokreni jednom u Supabase SQL editoru. Ponovno pokretanje je bezopasno.

CREATE OR REPLACE FUNCTION public.is_league_member(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM league_memberships
         WHERE league_id = p_league_id AND user_id = auth.uid()
    );
$$;

DROP POLICY IF EXISTS "leagues_select" ON leagues;
DROP POLICY IF EXISTS "leagues_insert_own" ON leagues;
DROP POLICY IF EXISTS "memberships_select" ON league_memberships;
DROP POLICY IF EXISTS "memberships_insert_own" ON league_memberships;

-- Globalna liga je vidljiva svima, privatne samo članovima.
CREATE POLICY "leagues_select" ON leagues FOR SELECT
    USING (is_global = TRUE OR public.is_league_member(id));

-- Članstva vide samo članovi te lige.
CREATE POLICY "memberships_select" ON league_memberships FOR SELECT
    USING (public.is_league_member(league_id));

-- ----------------------------------------------------------------------------
-- Napravi ligu
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_league(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user     UUID := auth.uid();
    v_name     TEXT := btrim(coalesce(p_name, ''));
    v_alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- bez I, O, 0, 1
    v_code     TEXT;
    v_id       UUID;
    v_tries    INT := 0;
BEGIN
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_authenticated');
    END IF;
    IF char_length(v_name) < 3 OR char_length(v_name) > 40 THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'name_invalid');
    END IF;
    IF (SELECT count(*) FROM leagues WHERE created_by = v_user AND NOT is_global) >= 5 THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'limit');
    END IF;

    LOOP
        v_code := '';
        FOR i IN 1..6 LOOP
            v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::INT, 1);
        END LOOP;
        BEGIN
            INSERT INTO leagues (name, invite_code, is_global, created_by)
            VALUES (v_name, v_code, FALSE, v_user)
            RETURNING id INTO v_id;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            v_tries := v_tries + 1;
            IF v_tries > 10 THEN
                RETURN jsonb_build_object('ok', FALSE, 'reason', 'code_failed');
            END IF;
        END;
    END LOOP;

    INSERT INTO league_memberships (league_id, user_id) VALUES (v_id, v_user);
    RETURN jsonb_build_object('ok', TRUE, 'id', v_id, 'invite_code', v_code);
END;
$$;

-- ----------------------------------------------------------------------------
-- Pregled lige po šifri (stranica poziva). Vraća samo naziv i broj članova.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.league_preview(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code TEXT := upper(btrim(coalesce(p_code, '')));
    v_row  RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_authenticated');
    END IF;
    SELECT l.id, l.name,
           (SELECT count(*) FROM league_memberships lm WHERE lm.league_id = l.id) AS members,
           EXISTS (SELECT 1 FROM league_memberships lm
                    WHERE lm.league_id = l.id AND lm.user_id = auth.uid()) AS already
      INTO v_row
      FROM leagues l
     WHERE l.invite_code = v_code AND NOT l.is_global;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
    END IF;
    RETURN jsonb_build_object('ok', TRUE, 'id', v_row.id, 'name', v_row.name,
                              'members', v_row.members, 'already_member', v_row.already);
END;
$$;

-- ----------------------------------------------------------------------------
-- Pridruži se ligi kodom
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_league(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_code TEXT := upper(btrim(coalesce(p_code, '')));
    v_id   UUID;
BEGIN
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_authenticated');
    END IF;
    SELECT id INTO v_id FROM leagues WHERE invite_code = v_code AND NOT is_global;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
    END IF;
    IF EXISTS (SELECT 1 FROM league_memberships WHERE league_id = v_id AND user_id = v_user) THEN
        RETURN jsonb_build_object('ok', TRUE, 'id', v_id, 'already', TRUE);
    END IF;
    IF (SELECT count(*) FROM league_memberships WHERE league_id = v_id) >= 100 THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'full');
    END IF;
    INSERT INTO league_memberships (league_id, user_id) VALUES (v_id, v_user)
    ON CONFLICT (league_id, user_id) DO NOTHING;
    RETURN jsonb_build_object('ok', TRUE, 'id', v_id, 'already', FALSE);
END;
$$;

-- ----------------------------------------------------------------------------
-- Napusti ligu (kad izađe poslednji član, liga se briše)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_league(p_league_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_authenticated');
    END IF;
    IF EXISTS (SELECT 1 FROM leagues WHERE id = p_league_id AND is_global) THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'global');
    END IF;
    DELETE FROM league_memberships WHERE league_id = p_league_id AND user_id = v_user;
    IF NOT EXISTS (SELECT 1 FROM league_memberships WHERE league_id = p_league_id) THEN
        DELETE FROM leagues WHERE id = p_league_id AND NOT is_global;
    END IF;
    RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_league_member(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_league(TEXT)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.league_preview(TEXT)  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.join_league(TEXT)     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.leave_league(UUID)    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_league_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_league(TEXT)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.league_preview(TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_league(TEXT)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_league(UUID)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.league_standings(UUID) TO authenticated;
