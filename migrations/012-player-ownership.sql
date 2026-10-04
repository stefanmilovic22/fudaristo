-- Najtraženiji igrači: koliki procenat sastava u kolu sadrži svakog igrača.
-- Pogled je zbirni (bez podataka o korisnicima) pa sme da se čita bez prijave;
-- squads ima čitanje za sve (RLS "squads_select_all"), a pogled radi sa pravima
-- vlasnika, kao i ostali v_* pogledi u ovoj bazi.

CREATE OR REPLACE VIEW public.v_player_ownership AS
SELECT
    s.gameweek_id,
    g.number                         AS gameweek_number,
    s.player_id,
    COUNT(*)::int                    AS picks,
    t.total_squads::int              AS total_squads,
    ROUND(100.0 * COUNT(*) / NULLIF(t.total_squads, 0), 1) AS pct
FROM squads s
JOIN gameweeks g ON g.id = s.gameweek_id
JOIN (
    SELECT gameweek_id, COUNT(DISTINCT user_id) AS total_squads
    FROM squads
    GROUP BY gameweek_id
) t ON t.gameweek_id = s.gameweek_id
GROUP BY s.gameweek_id, g.number, s.player_id, t.total_squads;

GRANT SELECT ON public.v_player_ownership TO anon, authenticated;
