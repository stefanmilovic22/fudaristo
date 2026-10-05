-- ============================================================================
-- Ispravka: meč 3. kola od 7. septembra — domaćin i gost su bili zamenjeni.
-- U bazi je pisalo "Iraklis 0:2 Asteras Tripolis", a pravi meč je
-- "Asteras Tripolis 0:2 Iraklis" (pobedio je Iraklis). Menjaju se KLUBOVI
-- (domaćin ↔ gost), rezultat 0:2 ostaje.
--
-- Provereno poređenjem cele baze sa pravom tabelom (Flashscore, posle 5 kola):
-- ovo je jedini meč zbog koga se tabela razlikovala. Posle ispravke se svih
-- 14 klubova poklapa (odigrano, P/N/I, golovi, bodovi).
-- ============================================================================

BEGIN;

UPDATE fixtures
   SET home_club_id = away_club_id,
       away_club_id = home_club_id
 WHERE id = 'bb64f7df-5a06-4c12-ba05-b26d8ddaa9e8'
   -- bezbednosna provera: menja se samo ako je još u starom (pogrešnom) stanju
   AND home_club_id = (SELECT id FROM clubs WHERE name = 'Iraklis')
   AND away_club_id = (SELECT id FROM clubs WHERE name = 'Asteras Tripolis');

-- Treba da vrati 1 red: Asteras Tripolis 0:2 Iraklis
SELECT h.name AS domacin, f.home_score || ':' || f.away_score AS rezultat, a.name AS gost
  FROM fixtures f
  JOIN clubs h ON h.id = f.home_club_id
  JOIN clubs a ON a.id = f.away_club_id
 WHERE f.id = 'bb64f7df-5a06-4c12-ba05-b26d8ddaa9e8';

COMMIT;
