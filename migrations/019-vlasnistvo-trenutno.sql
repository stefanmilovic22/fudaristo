-- ============================================================================
-- 019 — „Najtraženiji igrači": trenutni sastavi svih menadžera
-- ============================================================================
-- v_player_ownership (012) broji samo korisnike koji IMAJU red za dato kolo.
-- Sastav za novo kolo se pravi tek kad korisnik otvori „Moj klub"
-- (carry_over_squad), pa na početku kola procenat računa samo uzorak onih koji
-- su već svratili — ostali, čiji je sastav ostao isti, ne postoje u tom kolu.
-- Rezultat: lista „kao prošlo kolo" ili, još gore, 100% za igrača koga je kupio
-- jedan jedini korisnik.
--
-- Ovaj pogled za SVAKOG menadžera uzima njegov sastav iz narednog kola (prvo sa
-- rokom u budućnosti) ako ga ima, a inače iz njegovog najnovijeg ranijeg kola —
-- tačno ono što bi mu carry_over_squad prepisao. Procenat je od svih menadžera
-- koji imaju ikakav sastav. Bezbedno za ponovno pokretanje.

CREATE OR REPLACE VIEW public.v_player_ownership_current AS
WITH target AS (
    SELECT id, number
    FROM gameweeks
    WHERE deadline_at > now()
    ORDER BY deadline_at ASC
    LIMIT 1
),
user_latest AS (
    SELECT s.user_id, MAX(g.number) AS gw_number
    FROM squads s
    JOIN gameweeks g ON g.id = s.gameweek_id
    CROSS JOIN target t
    WHERE g.number <= t.number
    GROUP BY s.user_id
),
totals AS (
    SELECT COUNT(*)::int AS total_squads FROM user_latest
),
picks AS (
    SELECT s.player_id, COUNT(*)::int AS picks
    FROM squads s
    JOIN gameweeks g ON g.id = s.gameweek_id
    JOIN user_latest ul ON ul.user_id = s.user_id AND ul.gw_number = g.number
    GROUP BY s.player_id
)
SELECT
    (SELECT id FROM target)     AS gameweek_id,
    (SELECT number FROM target) AS gameweek_number,
    p.player_id,
    p.picks,
    t.total_squads,
    ROUND(100.0 * p.picks / NULLIF(t.total_squads, 0), 1) AS pct
FROM picks p
CROSS JOIN totals t;

GRANT SELECT ON public.v_player_ownership_current TO anon, authenticated;
