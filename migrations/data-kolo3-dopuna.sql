-- ============================================================================
-- Fudaristo — dopuna kola 3
-- Četiri meča odigrana 6. septembra 2026. koja nedostaju u kalendaru:
--   Atromitos    1 : 1  Kalamata
--   OFI          2 : 0  Kifisia
--   Levadiakos   0 : 2  Panetolikos
--   Panathinaikos 3 : 1  PAOK
--
-- Ovo NIJE migracija — jednokratna dopuna podataka, ne menja šemu.
--
-- Pokreni KORAK 1 pa pogledaj rezultat pre nego što pustiš KORAK 2.
-- Bezbedno je pokrenuti više puta: KORAK 2 ne dira meč koji već postoji.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- KORAK 1 — provera: da li se sva imena i kolo uopšte nalaze?
-- ----------------------------------------------------------------------------
-- Imena klubova u bazi dolaze iz ručnog seed-a (Faza 1) i ne moraju da se
-- poklope sa onim kako ih pišem ovde. Ovaj upit pokazuje šta je upareno, a
-- šta nije — NIŠTA ne menja. Ako je bilo koji red "NEMA U BAZI", ispravi ime
-- u listi ispod (u obe sekcije) i pusti ga ponovo.

WITH src(home_name, away_name) AS (
    VALUES ('Atromitos',    'Kalamata'),
           ('OFI',          'Kifisia'),
           ('Levadiakos',   'Panetolikos'),
           ('Panathinaikos', 'PAOK')
)
SELECT s.home_name,
       COALESCE(hc.name, '❌ NEMA U BAZI') AS home_u_bazi,
       s.away_name,
       COALESCE(ac.name, '❌ NEMA U BAZI') AS away_u_bazi
  FROM src s
  LEFT JOIN clubs hc ON hc.name = s.home_name
  LEFT JOIN clubs ac ON ac.name = s.away_name;

-- Ako neko ime ne prolazi, ovaj upit pokazuje sva imena iz baze:
--   SELECT name FROM clubs ORDER BY name;
-- Kolo 3 mora da postoji:
--   SELECT number, status, starts_at FROM gameweeks WHERE number = 3;


-- ----------------------------------------------------------------------------
-- KORAK 2 — upis
-- ----------------------------------------------------------------------------
-- Ceo blok je jedna transakcija: ili uđu sva četiri meča, ili nijedan. Ako
-- bilo koje ime ili kolo fali, blok pukne sa jasnom porukom i ne ostavlja
-- pola posla.
--
-- TERMINI SU STVARNI, ne placeholder. Preuzeti sa weba i unakrsno provereni:
--   Panathinaikos–PAOK 18:30 UTC potvrđen direktno (Sofascore i FotMob).
--   Ostala tri su sa BetBrain-a i AiScore-a, čije se skale poklapaju sa tim
--   jednim potvrđenim terminom, pa im je pomeraj poznat; livesoccertv daje
--   isto vreme za OFI–Kifisia kao treći izvor.
--
-- Zapisani su sa eksplicitnim +03 (EEST, grčko letnje vreme 6. septembra), da
-- upis ne zavisi od toga na koju je vremensku zonu podešen server.
--
-- api_thesportsdb_id ostaje NULL namerno — popuni ga posle sa
-- `npm run backfill-fixture-ids -- --apply`, koji upari meč po paru klubova.

BEGIN;

DO $$
DECLARE
    v_gameweek UUID;
    v_home     UUID;
    v_away     UUID;
    v_added    INT := 0;
    v_existing INT := 0;
    r          RECORD;
BEGIN
    SELECT id INTO v_gameweek FROM gameweeks WHERE number = 3;
    IF v_gameweek IS NULL THEN
        RAISE EXCEPTION 'Kolo 3 ne postoji u tabeli gameweeks — prvo ga napravi.';
    END IF;

    FOR r IN
        SELECT * FROM (VALUES
            ('Atromitos',     'Kalamata',    1, 1, TIMESTAMPTZ '2026-09-06 19:00+03'),
            ('OFI',           'Kifisia',     2, 0, TIMESTAMPTZ '2026-09-06 19:30+03'),
            ('Levadiakos',    'Panetolikos', 0, 2, TIMESTAMPTZ '2026-09-06 20:00+03'),
            ('Panathinaikos', 'PAOK',        3, 1, TIMESTAMPTZ '2026-09-06 21:30+03')
        ) AS t(home_name, away_name, home_score, away_score, kickoff_at)
    LOOP
        SELECT id INTO v_home FROM clubs WHERE name = r.home_name;
        IF v_home IS NULL THEN
            RAISE EXCEPTION 'Klub "%" ne postoji u tabeli clubs — proveri tačno ime (KORAK 1).', r.home_name;
        END IF;

        SELECT id INTO v_away FROM clubs WHERE name = r.away_name;
        IF v_away IS NULL THEN
            RAISE EXCEPTION 'Klub "%" ne postoji u tabeli clubs — proveri tačno ime (KORAK 1).', r.away_name;
        END IF;

        -- Traži po PARU KLUBOVA, ne po kolu: ako je meč greškom već unet u
        -- drugo kolo, bolje je ne dirati ga nego napraviti duplikat koji bi
        -- se dvaput bodovao. Isto pravilo koristi i import kalendara.
        IF EXISTS (
            SELECT 1 FROM fixtures
             WHERE home_club_id = v_home AND away_club_id = v_away
        ) THEN
            v_existing := v_existing + 1;
            RAISE NOTICE 'Već postoji: % — %', r.home_name, r.away_name;
            CONTINUE;
        END IF;

        INSERT INTO fixtures (gameweek_id, home_club_id, away_club_id,
                              kickoff_at, status, home_score, away_score)
        VALUES (v_gameweek, v_home, v_away,
                r.kickoff_at, 'finished', r.home_score, r.away_score);

        v_added := v_added + 1;
    END LOOP;

    RAISE NOTICE 'Dodato % meč(eva), već postojalo %.', v_added, v_existing;
END $$;

COMMIT;


-- ----------------------------------------------------------------------------
-- KORAK 3 — provera posle upisa
-- ----------------------------------------------------------------------------
-- Kolo 3 treba da ima 7 mečeva (14 klubova). Pored ova četiri, tu su i:
--   AEK Athens 5 : 0 Aris          — 5. septembra
--   Volos      1 : 1 Olympiacos    — 6. septembra
--   Asteras Tripolis 0 : 2 Iraklis — 7. septembra
-- Ako posle ovog upisa nema 7 redova, fali i nešto od ta tri.

SELECT h.name AS domacin,
       f.home_score || ':' || f.away_score AS rezultat,
       a.name AS gost,
       f.status,
       f.kickoff_at,
       CASE WHEN f.api_thesportsdb_id IS NULL THEN 'nema ID' ELSE 'ima ID' END AS api
  FROM fixtures f
  JOIN gameweeks g ON g.id = f.gameweek_id
  JOIN clubs h ON h.id = f.home_club_id
  JOIN clubs a ON a.id = f.away_club_id
 WHERE g.number = 3
 ORDER BY f.kickoff_at, h.name;
