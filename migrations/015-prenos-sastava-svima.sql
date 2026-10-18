-- Prenos sastava u kolo ZA SVE korisnike pre obračuna.
--
-- Problem: carry_over_squad() (migracija 003) radi samo kad korisnik otvori
-- /moj-tim. Ko za vreme kola nije otvorio aplikaciju nema nijedan red u
-- `squads` za to kolo — obračun ga preskoči (0 poena za kolo) i javna stranica
-- tima piše „Ovaj tim nije imao sastav u N. kolu”, iako ima poene iz ranijih
-- kola. U FPL-u se tim prenosi sam; ovo radi isto, a poziva ga obračun.
--
-- Kopira poslednji raniji sastav (kolo sa manjim brojem) svakom korisniku koji
-- nema sastav za zadato kolo, i daje +1 slobodan transfer (najviše 5), isto kao
-- carry_over_squad. Ko već ima sastav za to kolo se ne dira, pa je bezbedno
-- pokretati više puta. Vraća broj korisnika kojima je sastav prenet.
--
-- Pokreni jednom u Supabase SQL editoru. Posle toga u adminu ponovo klikni
-- „Obračunaj poene” za kolo koje je već obračunato (npr. 7) da se poeni isprave.

CREATE OR REPLACE FUNCTION public.carry_over_all_squads(p_gameweek_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_num   INT;
    v_users INT;
BEGIN
    SELECT number INTO v_num FROM gameweeks WHERE id = p_gameweek_id;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    WITH missing AS (
        SELECT u.id AS user_id,
               (SELECT s.gameweek_id
                  FROM squads s JOIN gameweeks g ON g.id = s.gameweek_id
                 WHERE s.user_id = u.id AND g.number < v_num
                 ORDER BY g.number DESC
                 LIMIT 1) AS prev_gw
          FROM users u
         WHERE NOT EXISTS (
                   SELECT 1 FROM squads s
                    WHERE s.user_id = u.id AND s.gameweek_id = p_gameweek_id)
    ),
    ins AS (
        INSERT INTO squads (user_id, gameweek_id, player_id, is_starting, squad_order,
                            is_captain, is_vice_captain, purchase_price)
        SELECT m.user_id, p_gameweek_id, s.player_id, s.is_starting, s.squad_order,
               s.is_captain, s.is_vice_captain, s.purchase_price
          FROM missing m
          JOIN squads s ON s.user_id = m.user_id AND s.gameweek_id = m.prev_gw
         WHERE m.prev_gw IS NOT NULL
        ON CONFLICT (user_id, gameweek_id, player_id) DO NOTHING
        RETURNING user_id
    )
    UPDATE users
       SET free_transfers = least(5, free_transfers + 1),
           updated_at = now()
     WHERE id IN (SELECT user_id FROM ins);

    GET DIAGNOSTICS v_users = ROW_COUNT;
    RETURN v_users;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.carry_over_all_squads(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.carry_over_all_squads(UUID) TO service_role;

-- Provera (opciono): korisnici koji i dalje nemaju sastav za kolo 7 — treba da
-- su samo oni koji NIKAD nisu imali sastav.
-- SELECT u.id, u.team_name FROM users u
--  WHERE NOT EXISTS (SELECT 1 FROM squads s JOIN gameweeks g ON g.id = s.gameweek_id
--                     WHERE s.user_id = u.id AND g.number = 7);
