-- ============================================================================
-- Fudaristo — pet novih igrača iz prelaznog roka
--
--   Juan José Perea    → Atromitos    FWD   €700k    (iz Züricha)
--   Aliou Badji        → Levadiakos   FWD   €500k    (iz Sivasspora)
--   Kristijan Jakić    → PAOK         MID   €6.00m   (iz Augsburga, pozajmica)
--   Dženis Burnić      → Volos        MID   €1.20m   (iz Karlsruhea)
--   Octavian Popescu   → Levadiakos   MID   €600k    (iz FCSB-a)
--
-- ⚠️ ZAŠTO NE `npm run import-roster`
-- Ta skripta posle upisa PONOVO IZRAČUNA CENE SVIM IGRAČIMA u toj poziciji,
-- po percentilu tržišne vrednosti. Na početku sezone je to bilo ispravno —
-- sad bi usred sezone promenila cenu svakom golmanu, beku, veznom i napadaču
-- u ligi. Sastavi koje su korisnici već kupili ostaju netaknuti
-- (squads.purchase_price čuva cenu iz trenutka kupovine), ali bi se tržište
-- pomerilo pod nogama svima koji planiraju transfere.
--
-- Ova skripta koristi ISTU formulu iz GDD sekcije 17
--     cena = floor + (ceiling − floor) × percentil³
-- ali je primenjuje SAMO na novih pet, u odnosu na postojeću raspodelu.
-- Nijedan postojeći igrač se ne dira.
--
-- Bezbedno je pokrenuti više puta: igrač koji već postoji se preskače.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- KORAK 1 — provera imena klubova i da igrači već ne postoje
-- ----------------------------------------------------------------------------

WITH novi(first_name, last_name, club_name) AS (
    VALUES ('Juan José',  'Perea',    'Atromitos'),
           ('Aliou',      'Badji',    'Levadiakos'),
           ('Kristijan',  'Jakić',    'PAOK'),
           ('Dženis',     'Burnić',   'Volos'),
           ('Octavian',   'Popescu',  'Levadiakos')
)
SELECT n.first_name || ' ' || n.last_name AS igrac,
       n.club_name,
       COALESCE(c.name, '❌ KLUB NEMA U BAZI') AS klub_u_bazi,
       CASE WHEN p.id IS NULL THEN 'nov' ELSE '⚠️ već postoji' END AS status
  FROM novi n
  LEFT JOIN clubs c ON c.name = n.club_name
  LEFT JOIN players p
         ON p.first_name = n.first_name AND p.last_name = n.last_name;

-- Ako je bilo koji klub "NEMA U BAZI", ispravi ime u obe liste.
-- Sva imena klubova: SELECT name FROM clubs ORDER BY name;


-- ----------------------------------------------------------------------------
-- KORAK 2 — upis
-- ----------------------------------------------------------------------------

BEGIN;

DO $$
DECLARE
    -- Granice iz scripts/import-roster-csv.ts (PRICE_BOUNDS). Držane ovde
    -- ručno jer SQL ne može da ih pročita iz TypeScript-a — ako se tamo
    -- promene, promeni i ovde.
    v_bounds  JSONB := '{
        "GK":  {"floor": 4.0, "ceiling": 5.5},
        "DEF": {"floor": 4.0, "ceiling": 7.0},
        "MID": {"floor": 4.5, "ceiling": 13.5},
        "FWD": {"floor": 4.5, "ceiling": 14.0}
    }'::JSONB;

    v_club       UUID;
    v_below      INT;
    v_total      INT;
    v_percentile NUMERIC;
    v_floor      NUMERIC;
    v_ceiling    NUMERIC;
    v_price      NUMERIC(4,1);
    v_added      INT := 0;
    v_skipped    INT := 0;
    r            RECORD;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('Juan José', 'Perea',   'Atromitos',  'FWD',  700000),
            ('Aliou',     'Badji',   'Levadiakos', 'FWD',  500000),
            ('Kristijan', 'Jakić',   'PAOK',       'MID', 6000000),
            ('Dženis',    'Burnić',  'Volos',      'MID', 1200000),
            ('Octavian',  'Popescu', 'Levadiakos', 'MID',  600000)
        ) AS t(first_name, last_name, club_name, position, market_value)
    LOOP
        SELECT id INTO v_club FROM clubs WHERE name = r.club_name;
        IF v_club IS NULL THEN
            RAISE EXCEPTION 'Klub "%" ne postoji — proveri tačno ime (KORAK 1).', r.club_name;
        END IF;

        -- Igrač sa istim imenom bilo gde u ligi: ne diramo. Ako je stvarno
        -- prešao iz drugog grčkog kluba, to je PREMEŠTANJE (update club_id),
        -- ne nov red — inače bi postojao dvaput i mogao biti kupljen dvaput.
        IF EXISTS (
            SELECT 1 FROM players
             WHERE first_name = r.first_name AND last_name = r.last_name
        ) THEN
            v_skipped := v_skipped + 1;
            RAISE NOTICE 'Preskočen (već postoji u ligi): % %', r.first_name, r.last_name;
            CONTINUE;
        END IF;

        -- Percentil u odnosu na POSTOJEĆU raspodelu te pozicije.
        SELECT count(*) FILTER (WHERE COALESCE(market_value_eur, 0) < r.market_value),
               count(*)
          INTO v_below, v_total
          FROM players
         WHERE position = r.position::player_position;

        -- +1 jer i novi igrač ulazi u raspodelu; ista logika kao i/(n-1) u skripti.
        v_percentile := CASE WHEN v_total = 0 THEN 1
                             ELSE v_below::NUMERIC / v_total END;

        v_floor   := (v_bounds -> r.position ->> 'floor')::NUMERIC;
        v_ceiling := (v_bounds -> r.position ->> 'ceiling')::NUMERIC;
        v_price   := round(v_floor + (v_ceiling - v_floor) * power(v_percentile, 3), 1);

        INSERT INTO players (club_id, first_name, last_name, position, price, market_value_eur)
        VALUES (v_club, r.first_name, r.last_name, r.position::player_position,
                v_price, r.market_value);

        v_added := v_added + 1;
        RAISE NOTICE '% % (%) → % · percentil %, cena %M',
            r.first_name, r.last_name, r.position, r.club_name,
            round(v_percentile, 2), v_price;
    END LOOP;

    RAISE NOTICE 'Dodato %, preskočeno %.', v_added, v_skipped;
END $$;

COMMIT;


-- ----------------------------------------------------------------------------
-- KORAK 3 — provera
-- ----------------------------------------------------------------------------

SELECT p.first_name || ' ' || p.last_name AS igrac,
       p.position,
       c.name AS klub,
       p.price || 'M' AS fantasy_cena,
       to_char(p.market_value_eur, 'FM999,999,999') AS trzisna_vrednost
  FROM players p
  JOIN clubs c ON c.id = p.club_id
 WHERE (p.first_name, p.last_name) IN
       (('Juan José','Perea'), ('Aliou','Badji'), ('Kristijan','Jakić'),
        ('Dženis','Burnić'), ('Octavian','Popescu'))
 ORDER BY p.position, p.price DESC;

-- Cene nikog drugog nisu dirane — provera da raspon po poziciji nije iskočio:
SELECT position, count(*) AS igraca, min(price) || 'M' AS najjeftiniji,
       max(price) || 'M' AS najskuplji
  FROM players GROUP BY position ORDER BY position;
