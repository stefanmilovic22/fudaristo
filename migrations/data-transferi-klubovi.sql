-- ============================================================================
-- Fudaristo — transferi: promena kluba unutar grčke lige + odlasci iz lige
--
-- DEO A — promena kluba (ostaju u ligi, samo im se update-uje club_id):
--   Rémy Cabella            Olympiacos → Volos
--   Konstantinos Thymianis  PAOK       → Panetolikos
--   Hamed Kader Fofana      AEK Athens → (Anagennisi Karditsas — NIJE u
--                                         našoj bazi klubova, Super League 2)
--   Christos Ligdas         Kifisia    → Volos
--   Timipere Eboh           Kifisia    → Volos
--
--   ⚠️ Fofana ide u klub koji ne pratimo (drugi rang) — skripta ga zato NE
--   prebacuje (nema gde), nego ga tretira kao DEO B (deaktivira). Ako je ime
--   kluba pogrešno prepisano i on je zapravo ostao u prvoj ligi, ispravi
--   IME KLUBA u DEO A ispod pre pokretanja.
--
-- DEO B — napustili grčku Super ligu (deaktivira se is_active, NE briše se
-- red — postojeći sastavi/statistika ostaju netaknuti, isto pravilo kao
-- schema.sql komentar na players.is_active):
--   Anastasios Donis      Aris          → Radomiak Radom (Poljska)
--   Marko Kerkez          Aris          → Mladost Lučani (Srbija)
--   Filip Mladenović      Panathinaikos → Mladost Lučani (Srbija)
--   Miloš Pantović        Panathinaikos → Železničar Pančevo (Srbija)
--
-- NIJE 1-1 STRING POREĐENJE: KORAK 1 ispod pokazuje i najbliža imena u bazi
-- (ILIKE po prezimenu) ako tačno ime+klub ne postoji — dijakritici (Rémy/
-- Remy, Miloš/Milos) ili druga imena kluba (Panaitolikos vs Panetolikos u
-- našoj bazi) se ovde NE pogađaju automatski, nego se prijave da ih
-- pregledaš pre KORAKA 2 i po potrebi ispraviš u VALUES listama ispod.
--
-- Bezbedno je pokrenuti više puta.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- KORAK 1 — provera: da li tačno ime+stari klub postoji, i ako ne, šta mu je
-- najbliže po prezimenu (bez obzira na klub)?
-- ----------------------------------------------------------------------------

WITH transferi(first_name, last_name, old_club) AS (
    VALUES ('Rémy',         'Cabella',    'Olympiacos'),
           ('Konstantinos', 'Thymianis',  'PAOK'),
           ('Hamed Kader',  'Fofana',     'AEK Athens'),
           ('Christos',     'Ligdas',     'Kifisia'),
           ('Timipere',     'Eboh',       'Kifisia'),
           ('Anastasios',   'Donis',      'Aris'),
           ('Marko',        'Kerkez',     'Aris'),
           ('Filip',        'Mladenović', 'Panathinaikos'),
           ('Miloš',        'Pantović',   'Panathinaikos')
)
SELECT t.first_name || ' ' || t.last_name AS igrac,
       t.old_club,
       CASE WHEN p.id IS NOT NULL THEN '✓ nađen tačno' ELSE '❌ NEMA tačno poklapanje' END AS status,
       (SELECT string_agg(cand.first_name || ' ' || cand.last_name || ' (' || cc.name || ')', ', ')
          FROM players cand
          JOIN clubs cc ON cc.id = cand.club_id
         WHERE cand.last_name ILIKE '%' || t.last_name || '%'
      ) AS najblize_po_prezimenu
  FROM transferi t
  LEFT JOIN clubs c ON c.name = t.old_club
  LEFT JOIN players p
         ON p.first_name = t.first_name AND p.last_name = t.last_name
        AND p.club_id = c.id;

-- Ako je status "NEMA tačno poklapanje", pogledaj kolonu "najblize_po_prezimenu".
-- Ako tamo VIDIŠ igrača koji je očigledno isti (drugačiji dijakritik, npr.
-- "Milos Pantovic" umesto "Miloš Pantović"), ispravi ime u OBA KORAKA ispod
-- da se tačno poklopi sa onim što piše u bazi. Sva imena kluba:
--   SELECT name FROM clubs ORDER BY name;


-- ----------------------------------------------------------------------------
-- KORAK 2 — upis
-- ----------------------------------------------------------------------------

BEGIN;

DO $$
DECLARE
    v_old_club   UUID;
    v_new_club   UUID;
    v_player     UUID;
    v_moved      INT := 0;
    v_deactivated INT := 0;
    v_not_found  INT := 0;
    r            RECORD;
BEGIN
    -- DEO A — promena kluba unutar lige -------------------------------------
    FOR r IN
        SELECT * FROM (VALUES
            ('Rémy',         'Cabella',   'Olympiacos', 'Volos'),
            ('Konstantinos', 'Thymianis', 'PAOK',       'Panetolikos'),
            ('Hamed Kader',  'Fofana',    'AEK Athens', 'Anagennisi Karditsas'),
            ('Christos',     'Ligdas',    'Kifisia',    'Volos'),
            ('Timipere',     'Eboh',      'Kifisia',    'Volos')
        ) AS t(first_name, last_name, old_club_name, new_club_name)
    LOOP
        SELECT id INTO v_old_club FROM clubs WHERE name = r.old_club_name;
        SELECT id INTO v_new_club FROM clubs WHERE name = r.new_club_name;

        -- Ako je igrač VEĆ u novom klubu (drugo pokretanje posle prethodnog
        -- uspešnog), nema šta da se radi — ovo NIJE greška, ne broji se kao
        -- "nije nađen".
        IF v_new_club IS NOT NULL AND EXISTS (
            SELECT 1 FROM players
             WHERE first_name = r.first_name AND last_name = r.last_name AND club_id = v_new_club
        ) THEN
            RAISE NOTICE 'VEĆ PREBAČEN (ništa za uraditi): % % (%)', r.first_name, r.last_name, r.new_club_name;
            CONTINUE;
        END IF;

        IF v_old_club IS NULL THEN
            RAISE NOTICE 'STARI KLUB "%" NE POSTOJI (proveri ime u KORAKU 1): % %', r.old_club_name, r.first_name, r.last_name;
            v_not_found := v_not_found + 1;
            CONTINUE;
        END IF;

        SELECT p.id INTO v_player
          FROM players p
         WHERE p.first_name = r.first_name AND p.last_name = r.last_name
           AND p.club_id = v_old_club;

        IF v_player IS NULL THEN
            RAISE NOTICE 'NIJE NAĐEN (proveri ime/klub u KORAKU 1): % % (%)', r.first_name, r.last_name, r.old_club_name;
            v_not_found := v_not_found + 1;
            CONTINUE;
        END IF;

        IF v_new_club IS NULL THEN
            -- Novi klub nije u našoj bazi (drugi rang/druga liga) — igrač je
            -- efektivno napustio praćenu ligu, tretiraj kao DEO B.
            UPDATE players SET is_active = FALSE WHERE id = v_player;
            RAISE NOTICE 'DEAKTIVIRAN (novi klub "%" nije u bazi, van praćene lige): % %', r.new_club_name, r.first_name, r.last_name;
            v_deactivated := v_deactivated + 1;
            CONTINUE;
        END IF;

        UPDATE players SET club_id = v_new_club WHERE id = v_player;
        RAISE NOTICE 'PREBAČEN: % % → %', r.first_name, r.last_name, r.new_club_name;
        v_moved := v_moved + 1;
    END LOOP;

    -- DEO B — napustili grčku Super ligu, deaktiviraj ------------------------
    FOR r IN
        SELECT * FROM (VALUES
            ('Anastasios', 'Donis',      'Aris'),
            ('Marko',      'Kerkez',     'Aris'),
            ('Filip',      'Mladenović', 'Panathinaikos'),
            ('Miloš',      'Pantović',   'Panathinaikos')
        ) AS t(first_name, last_name, old_club_name)
    LOOP
        SELECT id INTO v_old_club FROM clubs WHERE name = r.old_club_name;
        IF v_old_club IS NULL THEN
            RAISE NOTICE 'STARI KLUB "%" NE POSTOJI (proveri ime u KORAKU 1): % %', r.old_club_name, r.first_name, r.last_name;
            v_not_found := v_not_found + 1;
            CONTINUE;
        END IF;

        SELECT p.id INTO v_player
          FROM players p
         WHERE p.first_name = r.first_name AND p.last_name = r.last_name
           AND p.club_id = v_old_club;

        IF v_player IS NULL THEN
            RAISE NOTICE 'NIJE NAĐEN (proveri ime/klub u KORAKU 1): % % (%)', r.first_name, r.last_name, r.old_club_name;
            v_not_found := v_not_found + 1;
            CONTINUE;
        END IF;

        UPDATE players SET is_active = FALSE WHERE id = v_player;
        RAISE NOTICE 'DEAKTIVIRAN (napustio ligu): % %', r.first_name, r.last_name;
        v_deactivated := v_deactivated + 1;
    END LOOP;

    RAISE NOTICE '---';
    RAISE NOTICE 'Prebačeno: % · Deaktivirano: % · Nije nađeno: %', v_moved, v_deactivated, v_not_found;
END $$;

COMMIT;


-- ----------------------------------------------------------------------------
-- KORAK 3 — provera posle upisa
-- ----------------------------------------------------------------------------

SELECT p.first_name || ' ' || p.last_name AS igrac,
       c.name AS klub,
       p.is_active
  FROM players p
  JOIN clubs c ON c.id = p.club_id
 WHERE (p.first_name, p.last_name) IN
       (('Rémy','Cabella'), ('Konstantinos','Thymianis'), ('Hamed Kader','Fofana'),
        ('Christos','Ligdas'), ('Timipere','Eboh'), ('Anastasios','Donis'),
        ('Marko','Kerkez'), ('Filip','Mladenović'), ('Miloš','Pantović'))
 ORDER BY p.is_active, klub, igrac;

-- Igrače koji ovde uopšte ne izađu (jer im je is_active=false a i klub im
-- više ne odgovara staroj vrednosti) proveri direktno:
--   SELECT first_name, last_name, is_active FROM players
--    WHERE (first_name, last_name) IN (('Rémy','Cabella'), ...);
