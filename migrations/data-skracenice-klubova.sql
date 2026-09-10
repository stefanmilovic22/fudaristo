-- ============================================================================
-- Fudaristo — sređivanje skraćenica klubova (clubs.short_name)
--
-- PROBLEM: skraćenice su nastale automatski, iz prva 3-4 slova imena
-- (`name.slice(0, 4)` u seed skripti). Rezultat:
--
--   Panathinaikos → PAN        Panetolikos → PAN
--
-- Ista skraćenica za dva kluba. Otud „Garcia ... protiv PAN (H)” kod igrača
-- Panathinaikosa: protivnik JESTE bio Panetolikos, ali je kod izgledao kao da
-- piše Panathinaikos.
--
-- REŠENJE: ustaljene grčke skraćenice, ručno, sa jednim pravilom — nijedna se
-- ne sme ponoviti i nijedna ne sme ličiti na drugu.
--
--   PAO   Panathinaikos   (ΠΑΟ — tako ga zovu i u Grčkoj)
--   PAOK  PAOK            (ΠΑΟΚ — jedina četvoroslovna, i to je u redu)
--   PNT   Panetolikos     (namerno NIJE PAN, da se ne meša sa PAO)
--
-- Ovo NIJE migracija — jednokratna dopuna podataka, ne menja šemu.
-- Bezbedno je pokrenuti više puta.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- KORAK 1 — trenutno stanje i sudari
-- ----------------------------------------------------------------------------

SELECT name, short_name,
       count(*) OVER (PARTITION BY short_name) AS koliko_klubova_deli_ovu_skracenicu
  FROM clubs
 ORDER BY short_name, name;


-- ----------------------------------------------------------------------------
-- KORAK 2 — upis
-- ----------------------------------------------------------------------------
-- Ako neko ime ne postoji u bazi, blok pukne i NIŠTA se ne upisuje — bolje
-- nego da polovina klubova ostane sa starim kodom.

BEGIN;

DO $$
DECLARE
    v_hit   INT;
    v_done  INT := 0;
    r       RECORD;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('AEK Athens',       'AEK'),
            ('Aris',             'ARI'),
            ('Asteras Tripolis', 'AST'),
            ('Atromitos',        'ATR'),
            ('Iraklis 1908',     'IRA'),
            ('Kalamata',         'KAL'),
            ('Kifisia',          'KIF'),
            ('Levadiakos',       'LEV'),
            ('OFI',              'OFI'),
            ('Olympiacos',       'OLY'),
            ('Panathinaikos',    'PAO'),
            ('Panetolikos',      'PNT'),
            ('PAOK',             'PAOK'),
            ('Volos',            'VOL')
        ) AS t(club_name, code)
    LOOP
        UPDATE clubs SET short_name = r.code WHERE name = r.club_name;
        GET DIAGNOSTICS v_hit = ROW_COUNT;

        IF v_hit = 0 THEN
            RAISE EXCEPTION
                'Klub "%" ne postoji u tabeli clubs — proveri tačno ime (KORAK 1) i ispravi listu.',
                r.club_name;
        END IF;
        v_done := v_done + 1;
    END LOOP;

    RAISE NOTICE 'Ažurirano % klubova.', v_done;
END $$;

COMMIT;


-- ----------------------------------------------------------------------------
-- KORAK 3 — provera
-- ----------------------------------------------------------------------------
-- Oba upita MORAJU da vrate nula redova.

-- Duple skraćenice:
SELECT short_name, string_agg(name, ', ') AS klubovi
  FROM clubs
 GROUP BY short_name
HAVING count(*) > 1;

-- Skraćenice koje su prefiks druge (PAO/PAOK su izuzetak — ustaljene su i
-- Grci ih ne mešaju; sve ostalo bi bilo greška):
SELECT a.short_name AS kraca, b.short_name AS duza, a.name, b.name
  FROM clubs a
  JOIN clubs b ON b.short_name LIKE a.short_name || '%' AND a.id <> b.id
 WHERE NOT (a.short_name = 'PAO' AND b.short_name = 'PAOK');

-- Konačan spisak:
SELECT short_name, name FROM clubs ORDER BY short_name;
