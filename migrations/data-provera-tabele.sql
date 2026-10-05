-- ============================================================================
-- Fudaristo — provera tabele Super lige
-- Ovo NIJE migracija: samo upiti za čitanje (ništa ne menjaju), osim KORAKA 4.
-- Tabela u aplikaciji se računa iz fixtures (status 'finished' + home_score /
-- away_score), pa ako se razlikuje od prave tabele, greška je u podacima o
-- mečevima: obrnut domaćin/gost, ili meč upisan dvaput (A–B i B–A).
-- ============================================================================

-- KORAK 1 — svi završeni mečevi, onako kako ih aplikacija vidi.
-- Uporedi sa pravim rezultatima. Kolona "pobednik" pokazuje ko je pobedio PO
-- BAZI (to je ono što ulazi u tabelu).
SELECT g.number                          AS kolo,
       f.kickoff_at::date                AS datum,
       h.name                            AS domacin,
       f.home_score || ':' || f.away_score AS rezultat,
       a.name                            AS gost,
       CASE WHEN f.home_score > f.away_score THEN h.name
            WHEN f.home_score < f.away_score THEN a.name
            ELSE 'nerešeno' END          AS pobednik,
       f.api_thesportsdb_id              AS api_id,
       f.id                              AS fixture_id
  FROM fixtures f
  JOIN gameweeks g ON g.id = f.gameweek_id
  JOIN clubs h ON h.id = f.home_club_id
  JOIN clubs a ON a.id = f.away_club_id
 WHERE f.status = 'finished'
 ORDER BY f.kickoff_at, h.name;

-- KORAK 2 — isti par klubova upisan dvaput (obrnuto ili isto), u istom kolu
-- ili istog dana. Svaki red ovde je sumnjiv: tabela bi ga brojala dvaput.
SELECT f1.id AS fixture_1, f2.id AS fixture_2,
       h1.name || ' – ' || a1.name AS meč_1,
       h2.name || ' – ' || a2.name AS meč_2,
       f1.kickoff_at::date AS datum_1, f2.kickoff_at::date AS datum_2
  FROM fixtures f1
  JOIN fixtures f2 ON f1.id < f2.id
                  AND LEAST(f1.home_club_id, f1.away_club_id)    = LEAST(f2.home_club_id, f2.away_club_id)
                  AND GREATEST(f1.home_club_id, f1.away_club_id) = GREATEST(f2.home_club_id, f2.away_club_id)
                  AND abs(extract(epoch FROM (f1.kickoff_at - f2.kickoff_at))) < 3 * 86400
  JOIN clubs h1 ON h1.id = f1.home_club_id JOIN clubs a1 ON a1.id = f1.away_club_id
  JOIN clubs h2 ON h2.id = f2.home_club_id JOIN clubs a2 ON a2.id = f2.away_club_id;

-- KORAK 3 — meč sa upisanim rezultatom koji NIJE 'finished' (npr. zaglavljen
-- kao 'live'); takav meč se ne računa u tabelu.
SELECT g.number AS kolo, h.name AS domacin, f.home_score || ':' || f.away_score AS rezultat,
       a.name AS gost, f.status, f.id AS fixture_id
  FROM fixtures f
  JOIN gameweeks g ON g.id = f.gameweek_id
  JOIN clubs h ON h.id = f.home_club_id
  JOIN clubs a ON a.id = f.away_club_id
 WHERE f.status <> 'finished' AND f.home_score IS NOT NULL AND f.away_score IS NOT NULL;

-- KORAK 4 — ISPRAVKA za meč kod koga su rezultati okrenuti (domaćin i gost
-- zamenjeni). Zameni UUID iz kolone fixture_id iz KORAKA 1, pa pusti.
-- Ovo menja SAMO redosled golova (domaćin ↔ gost), klubovi ostaju.
--
--   UPDATE fixtures
--      SET home_score = away_score, away_score = home_score
--    WHERE id = '00000000-0000-0000-0000-000000000000';
--
-- Ako je meč upisan dvaput (KORAK 2), obriši višak (onaj sa pogrešnim
-- domaćinom):
--
--   DELETE FROM fixtures WHERE id = '00000000-0000-0000-0000-000000000000';
--
-- Posle ispravke osveži stranicu /tabela (keš traje do 60 s; admin akcije ga
-- poništavaju odmah).
