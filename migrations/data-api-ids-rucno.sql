-- ============================================================================
-- Fudaristo — ručni upis api_thesportsdb_id
--
-- ID-jeve sam povukao sa TheSportsDB stranice lige (id 4336, sezona 2026-2027)
-- i uparivao po paru klubova, ne po datumu — termin se pomera, par ne.
--
-- Ovo NIJE migracija. Bezbedno je pokrenuti više puta: upisuje se samo tamo
-- gde ID još ne postoji, pa se ništa već povezano ne gazi.
--
-- Alternativa je `npm run backfill-fixture-ids -- --apply`, koja radi isti
-- posao automatski. Ovo je za slučaj da API ne odgovara ili da neki meč
-- ostane neuparen.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- KORAK 1 — šta je trenutno bez ID-ja
-- ----------------------------------------------------------------------------

SELECT g.number AS kolo,
       h.name AS domacin,
       a.name AS gost,
       f.kickoff_at,
       COALESCE(f.api_thesportsdb_id, '— nema —') AS api_id
  FROM fixtures f
  JOIN gameweeks g ON g.id = f.gameweek_id
  JOIN clubs h ON h.id = f.home_club_id
  JOIN clubs a ON a.id = f.away_club_id
 WHERE f.api_thesportsdb_id IS NULL
 ORDER BY g.number, f.kickoff_at;


-- ----------------------------------------------------------------------------
-- KORAK 2 — kolo 3 (četiri meča od 6. septembra)
-- ----------------------------------------------------------------------------

BEGIN;

DO $$
DECLARE
    v_home  UUID;
    v_away  UUID;
    v_hit   INT;
    v_added INT := 0;
    v_skip  INT := 0;
    r       RECORD;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('Panathinaikos', 'PAOK',        '2539934'),
            ('Levadiakos',    'Panetolikos', '2539935'),
            ('OFI',           'Kifisia',     '2539936'),
            ('Atromitos',     'Kalamata',    '2539938')
        ) AS t(home_name, away_name, api_id)
    LOOP
        SELECT id INTO v_home FROM clubs WHERE name = r.home_name;
        SELECT id INTO v_away FROM clubs WHERE name = r.away_name;

        IF v_home IS NULL OR v_away IS NULL THEN
            RAISE EXCEPTION 'Klub "%" ili "%" ne postoji u tabeli clubs.', r.home_name, r.away_name;
        END IF;

        -- Samo tamo gde ID još ne postoji. Ako je meč već povezan, ne diramo
        -- ga — bolje ostaviti postojeću vezu nego je prepisati naslepo.
        UPDATE fixtures
           SET api_thesportsdb_id = r.api_id
         WHERE home_club_id = v_home
           AND away_club_id = v_away
           AND api_thesportsdb_id IS NULL;

        GET DIAGNOSTICS v_hit = ROW_COUNT;

        IF v_hit > 0 THEN
            v_added := v_added + v_hit;
        ELSE
            v_skip := v_skip + 1;
            RAISE NOTICE 'Preskočeno (nema meča ili već ima ID): % — %', r.home_name, r.away_name;
        END IF;
    END LOOP;

    RAISE NOTICE 'Kolo 3: upisano % ID-jeva, preskočeno %.', v_added, v_skip;
END $$;

COMMIT;


-- ----------------------------------------------------------------------------
-- KORAK 3 (opciono) — kolo 4 i odloženi meč iz kola 1
-- ----------------------------------------------------------------------------
-- ⚠️ Panathinaikos — Kifisia (2539921) se igra 10. septembra, ali TheSportsDB
-- ga vodi kao KOLO 1, ne kolo 4. To je onaj odloženi meč. Ako ga upišeš u
-- kolo 4, poeni bi otišli u pogrešno kolo. Zato je u posebnoj listi ispod i
-- traži da meč VEĆ postoji u bazi — ne pravi ga.
--
-- Pokreni ovo samo ako su ti mečevi kola 4 već u kalendaru.

BEGIN;

DO $$
DECLARE
    v_home  UUID;
    v_away  UUID;
    v_hit   INT;
    v_added INT := 0;
    v_skip  INT := 0;
    r       RECORD;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            -- kolo 4
            ('Olympiacos',      'OFI',         '2539940'),
            ('Iraklis 1908',    'Atromitos',   '2539946'),
            ('Kalamata',        'Volos',       '2539944'),
            ('Asteras Tripolis','AEK Athens',  '2539943'),
            ('PAOK',            'Aris',        '2539942'),
            ('Kifisia',         'Levadiakos',  '2539945'),
            ('Panathinaikos',   'Panetolikos', '2539941'),
            -- odloženi meč iz KOLA 1
            ('Panathinaikos',   'Kifisia',     '2539921')
        ) AS t(home_name, away_name, api_id)
    LOOP
        SELECT id INTO v_home FROM clubs WHERE name = r.home_name;
        SELECT id INTO v_away FROM clubs WHERE name = r.away_name;

        IF v_home IS NULL OR v_away IS NULL THEN
            RAISE EXCEPTION 'Klub "%" ili "%" ne postoji u tabeli clubs.', r.home_name, r.away_name;
        END IF;

        UPDATE fixtures
           SET api_thesportsdb_id = r.api_id
         WHERE home_club_id = v_home
           AND away_club_id = v_away
           AND api_thesportsdb_id IS NULL;

        GET DIAGNOSTICS v_hit = ROW_COUNT;

        IF v_hit > 0 THEN
            v_added := v_added + v_hit;
        ELSE
            v_skip := v_skip + 1;
            RAISE NOTICE 'Preskočeno (nema meča ili već ima ID): % — %', r.home_name, r.away_name;
        END IF;
    END LOOP;

    RAISE NOTICE 'Kolo 4 + odloženi: upisano % ID-jeva, preskočeno %.', v_added, v_skip;
END $$;

COMMIT;


-- ----------------------------------------------------------------------------
-- KORAK 4 — provera
-- ----------------------------------------------------------------------------
-- Isti ID ne sme da stoji na dva meča. Ovaj upit mora da vrati NULA redova.

SELECT api_thesportsdb_id, count(*) AS koliko_puta
  FROM fixtures
 WHERE api_thesportsdb_id IS NOT NULL
 GROUP BY api_thesportsdb_id
HAVING count(*) > 1;

-- Pregled stanja po kolu.
SELECT g.number AS kolo,
       count(*) AS meceva,
       count(f.api_thesportsdb_id) AS sa_id,
       count(*) - count(f.api_thesportsdb_id) AS bez_id
  FROM fixtures f
  JOIN gameweeks g ON g.id = f.gameweek_id
 GROUP BY g.number
 ORDER BY g.number;
