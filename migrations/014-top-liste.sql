-- Strelci i asistenti: do 50 igrača sa bar jednim golom / asistencijom
-- (umesto prvih 5). Isti stupci kao ranije, pa se pogledi samo zamenjuju.
-- Pokreni jednom u Supabase SQL editoru. Ponovno pokretanje je bezopasno.
-- (Dok se ne pokrene, sajt radi i prikazuje samo prvih 5 iz starih pogleda.)

CREATE OR REPLACE VIEW v_top_scorers AS
SELECT
    p.id, p.first_name, p.last_name, c.name AS club_name,
    SUM(pgs.goals) AS total_goals
FROM players p
JOIN clubs c ON c.id = p.club_id
JOIN player_gameweek_stats pgs ON pgs.player_id = p.id
GROUP BY p.id, p.first_name, p.last_name, c.name
HAVING SUM(pgs.goals) > 0
ORDER BY total_goals DESC, p.last_name, p.first_name
LIMIT 50;

CREATE OR REPLACE VIEW v_top_assists AS
SELECT
    p.id, p.first_name, p.last_name, c.name AS club_name,
    SUM(pgs.assists) AS total_assists
FROM players p
JOIN clubs c ON c.id = p.club_id
JOIN player_gameweek_stats pgs ON pgs.player_id = p.id
GROUP BY p.id, p.first_name, p.last_name, c.name
HAVING SUM(pgs.assists) > 0
ORDER BY total_assists DESC, p.last_name, p.first_name
LIMIT 50;

GRANT SELECT ON v_top_scorers, v_top_assists TO anon, authenticated;
