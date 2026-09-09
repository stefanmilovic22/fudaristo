-- ============================================================================
-- Fudaristo — migracija 007
-- Skupovni (set-based) upisi za scoring engine iz Faze 6.
--
-- ZAŠTO: prva verzija scoring engine-a je radila red-po-red iz Node-a — ~250
-- UPDATE-ova statistike, pa 2 upita po igraču, pa 4 upita + 15 UPDATE-ova po
-- KORISNIKU. Za kolo sa 50 korisnika to je oko 1.800 uzastopnih HTTP poziva ka
-- Supabase-u, tj. 40-60 sekundi — preko Vercel limita (10s podrazumevano na
-- Hobby planu, max 60s uz maxDuration). Ove funkcije rade isti posao u jednom
-- SQL izrazu po koraku, pa ceo obračun staje u ~15 poziva.
--
-- Logika (bodovna tabela, auto-sub, kapiten, čipovi) NAMERNO ostaje u
-- lib/scoring.ts — tamo je testirana i tamo se lako menja. Ove funkcije su
-- samo "upiši ovaj niz", bez ijedne fantasy odluke u sebi.
--
-- Piše ih isključivo service role (admin server action). Zato EXECUTE ide
-- samo toj roli — authenticated ih ne može pozvati ni slučajno.
--
-- Pokreni posle 006-ingestion-and-worldfootball.sql. Bezbedno je pokrenuti
-- više puta.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) score_write_stat_points — fantasy_points za više redova odjednom
-- ----------------------------------------------------------------------------
-- p_rows: [{ "id": "<player_gameweek_stats.id>", "points": 7 }, ...]

CREATE OR REPLACE FUNCTION public.score_write_stat_points(p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
        RETURN 0;
    END IF;

    UPDATE player_gameweek_stats s
       SET fantasy_points = r.points,
           updated_at     = now()
      FROM jsonb_to_recordset(p_rows) AS r(id UUID, points INTEGER)
     WHERE s.id = r.id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;


-- ----------------------------------------------------------------------------
-- 2) score_refresh_player_totals — players.total_points keš
-- ----------------------------------------------------------------------------
-- Osvežava SVE igrače koji imaju red u ovom kolu, i to kao SUM preko CELE
-- sezone (ne inkrementalno) — isti razlog kao ranije: imuno na duplo brojanje
-- kad se kolo obračuna dvaput.

CREATE OR REPLACE FUNCTION public.score_refresh_player_totals(p_gameweek_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE players p
       SET total_points = t.total
      FROM (
            SELECT s.player_id, COALESCE(SUM(s.fantasy_points), 0)::INTEGER AS total
              FROM player_gameweek_stats s
             WHERE s.player_id IN (
                     SELECT DISTINCT player_id
                       FROM player_gameweek_stats
                      WHERE gameweek_id = p_gameweek_id
                   )
             GROUP BY s.player_id
           ) t
     WHERE p.id = t.player_id
       AND p.total_points IS DISTINCT FROM t.total;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;


-- ----------------------------------------------------------------------------
-- 3) score_write_user_points — user_gameweek_points + users.total_points keš
-- ----------------------------------------------------------------------------
-- p_rows: [{ "user_id": "...", "raw_points": 54, "transfer_cost": -4,
--            "chip_type_used": null, "total_points": 62 }, ...]
--
-- upsert po (user_id, gameweek_id) — ponovni obračun prepisuje, ne duplira.
-- Odmah zatim se users.total_points prekalkuliše kao SUM svih kola tog
-- korisnika, opet ne inkrementalno.

CREATE OR REPLACE FUNCTION public.score_write_user_points(
    p_gameweek_id UUID,
    p_rows        JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
    v_users UUID[];
BEGIN
    IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
        RETURN 0;
    END IF;

    SELECT array_agg(DISTINCT r.user_id)
      INTO v_users
      FROM jsonb_to_recordset(p_rows) AS r(user_id UUID);

    INSERT INTO user_gameweek_points
        (user_id, gameweek_id, raw_points, transfer_cost, chip_type_used, total_points, calculated_at)
    SELECT r.user_id, p_gameweek_id, r.raw_points, r.transfer_cost,
           NULLIF(r.chip_type_used, '')::transfer_chip_type, r.total_points, now()
      FROM jsonb_to_recordset(p_rows)
        AS r(user_id UUID, raw_points INTEGER, transfer_cost INTEGER,
             chip_type_used TEXT, total_points INTEGER)
    ON CONFLICT (user_id, gameweek_id) DO UPDATE
        SET raw_points     = EXCLUDED.raw_points,
            transfer_cost  = EXCLUDED.transfer_cost,
            chip_type_used = EXCLUDED.chip_type_used,
            total_points   = EXCLUDED.total_points,
            calculated_at  = EXCLUDED.calculated_at;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- ZASEBAN izraz, ne CTE: data-modifying CTE i naredni SELECT nad istom
    -- tabelom vide snimak od početka izraza, pa upravo upisani redovi ne bi
    -- ušli u zbir.
    UPDATE users usr
       SET total_points = t.total,
           updated_at   = now()
      FROM (
            SELECT g.user_id, COALESCE(SUM(g.total_points), 0)::INTEGER AS total
              FROM user_gameweek_points g
             WHERE g.user_id = ANY(v_users)
             GROUP BY g.user_id
           ) t
     WHERE usr.id = t.user_id;

    RETURN v_count;
END;
$$;


-- ----------------------------------------------------------------------------
-- 4) score_write_auto_subs — trag o automatskim izmenama
-- ----------------------------------------------------------------------------
-- p_rows: [{ "user_id": "...", "player_id": "..." }, ...] — SAMO oni koji su
-- ušli. Sve ostalo u kolu se prvo vraća na FALSE, da ispravka već obračunatog
-- kola obriše stari trag ako se stanje promenilo.

CREATE OR REPLACE FUNCTION public.score_write_auto_subs(
    p_gameweek_id UUID,
    p_rows        JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE squads
       SET auto_subbed_in = FALSE
     WHERE gameweek_id = p_gameweek_id
       AND auto_subbed_in;

    IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
        RETURN 0;
    END IF;

    UPDATE squads s
       SET auto_subbed_in = TRUE
      FROM jsonb_to_recordset(p_rows) AS r(user_id UUID, player_id UUID)
     WHERE s.gameweek_id = p_gameweek_id
       AND s.user_id     = r.user_id
       AND s.player_id   = r.player_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;


-- ----------------------------------------------------------------------------
-- 5) v_gameweek_stat_review — koliko redova statistike je potvrđeno, po kolu
-- ----------------------------------------------------------------------------
-- /admin je ovo ranije računao tako što je povukao SVE player_gameweek_stats
-- redove i brojao u Node-u. Supabase podrazumevano vraća najviše 1000 redova
-- po zahtevu, a kroz sezonu ih bude ~6.000 — brojevi na dashboard-u bi tiho
-- postali pogrešni već posle par kola. Agregacija je posao baze.

CREATE OR REPLACE VIEW public.v_gameweek_stat_review AS
SELECT gameweek_id,
       COUNT(*)::INTEGER                                    AS total,
       COUNT(*) FILTER (WHERE is_admin_reviewed)::INTEGER   AS reviewed
  FROM player_gameweek_stats
 GROUP BY gameweek_id;

GRANT SELECT ON public.v_gameweek_stat_review TO authenticated;


-- ----------------------------------------------------------------------------
-- Dozvole — samo service role (admin server action), nikad browser
-- ----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.score_write_stat_points(JSONB)          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.score_refresh_player_totals(UUID)       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.score_write_user_points(UUID, JSONB)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.score_write_auto_subs(UUID, JSONB)      FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.score_write_stat_points(JSONB)           TO service_role;
GRANT EXECUTE ON FUNCTION public.score_refresh_player_totals(UUID)        TO service_role;
GRANT EXECUTE ON FUNCTION public.score_write_user_points(UUID, JSONB)     TO service_role;
GRANT EXECUTE ON FUNCTION public.score_write_auto_subs(UUID, JSONB)       TO service_role;

-- ============================================================================
-- KRAJ migracije 007
-- ============================================================================
