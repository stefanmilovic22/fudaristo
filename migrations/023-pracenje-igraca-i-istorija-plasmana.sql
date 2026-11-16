-- ============================================================================
-- Fudaristo — migracija 023
-- 1) Lista praćenih igrača (zvezdica na stranici Igrači)
-- 2) Istorija poena i plasmana po kolima (grafik na stranici tima)
-- Bezbedno je pokrenuti više puta. Pokreni posle 022.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) player_watchlist
-- ----------------------------------------------------------------------------
-- Svako vidi i menja SAMO svoje redove (RLS). Gornja granica od 50 praćenih
-- igrača po korisniku je u okidaču, ne u aplikaciji — da je ne zaobiđe niko ko
-- piše direktno preko javnog ključa.

CREATE TABLE IF NOT EXISTS public.player_watchlist (
    user_id    UUID        NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
    player_id  UUID        NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, player_id)
);

ALTER TABLE public.player_watchlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "watchlist_select_own" ON public.player_watchlist;
DROP POLICY IF EXISTS "watchlist_insert_own" ON public.player_watchlist;
DROP POLICY IF EXISTS "watchlist_delete_own" ON public.player_watchlist;

CREATE POLICY "watchlist_select_own" ON public.player_watchlist
    FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "watchlist_insert_own" ON public.player_watchlist
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "watchlist_delete_own" ON public.player_watchlist
    FOR DELETE USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.player_watchlist FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.player_watchlist TO authenticated;

CREATE OR REPLACE FUNCTION public.watchlist_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF (SELECT count(*) FROM public.player_watchlist WHERE user_id = NEW.user_id) >= 50 THEN
        RAISE EXCEPTION 'watchlist_full' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_watchlist_limit ON public.player_watchlist;
CREATE TRIGGER trg_watchlist_limit
    BEFORE INSERT ON public.player_watchlist
    FOR EACH ROW EXECUTE FUNCTION public.watchlist_limit();

CREATE INDEX IF NOT EXISTS idx_watchlist_player ON public.player_watchlist (player_id);


-- ----------------------------------------------------------------------------
-- 2) user_performance_history — poeni, prosek i plasman posle svakog kola
-- ----------------------------------------------------------------------------
-- Plasman posle kola N = mesto po zbiru poena do kola N, među SVIM korisnicima
-- (ko nije imao sastav u nekom kolu tamo ima 0 poena, kao i u
-- v_global_league_standings) — poslednji red se zato poklapa sa trenutnom
-- globalnom rang listom. Prosek kola računa samo korisnike koji su ga igrali.
--
-- SECURITY INVOKER: čita samo tabele koje su i inače javne (users,
-- user_gameweek_points, gameweeks), pa ne otvara ništa novo.

CREATE OR REPLACE FUNCTION public.user_performance_history(p_user UUID)
RETURNS TABLE (
    gameweek_number INT,
    points          INT,
    avg_points      NUMERIC,
    total_points    INT,
    rank            INT,
    managers        INT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH base AS (
        SELECT g.number AS gw,
               u.id     AS user_id,
               COALESCE(ugp.total_points, 0) AS pts,
               (ugp.user_id IS NOT NULL)     AS played
          FROM public.gameweeks g
          CROSS JOIN public.users u
          LEFT JOIN public.user_gameweek_points ugp
                 ON ugp.gameweek_id = g.id AND ugp.user_id = u.id
         WHERE g.status = 'finalized'
    ),
    cum AS (
        SELECT gw, user_id, pts, played,
               SUM(pts) OVER (PARTITION BY user_id ORDER BY gw) AS cp
          FROM base
    ),
    ranked AS (
        SELECT gw, user_id, pts, cp,
               RANK()  OVER (PARTITION BY gw ORDER BY cp DESC) AS rnk,
               AVG(pts) FILTER (WHERE played) OVER (PARTITION BY gw) AS avg_pts,
               COUNT(*) OVER (PARTITION BY gw) AS n
          FROM cum
    )
    SELECT gw::INT, pts::INT, ROUND(COALESCE(avg_pts, 0), 1), cp::INT, rnk::INT, n::INT
      FROM ranked
     WHERE user_id = p_user
     ORDER BY gw;
$$;

REVOKE EXECUTE ON FUNCTION public.user_performance_history(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.user_performance_history(UUID) TO authenticated;


-- ----------------------------------------------------------------------------
-- PROVERA
-- ----------------------------------------------------------------------------
--   SELECT * FROM public.user_performance_history('<tvoj user id>');
--   -- poslednji red: rank treba da bude isti kao na stranici Liga → Globalna.
--
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'player_watchlist';
