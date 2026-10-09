-- Ispravka termina 6. i 7. kola (vremena sa Flashscore-a, srpsko vreme).
-- U oktobru je Srbija na UTC+2 (CEST, do 25.10.), pa je "+02" ispod tačno.
-- U bazi se čuva UTC; sajt sam prikazuje vreme u zoni posetioca.
-- Pokreni jednom u Supabase SQL editoru. Ponovno pokretanje je bezopasno.

-- 1) Termini mečeva. Meč se traži po kolu + domaćinu + gostu.
UPDATE fixtures f
   SET kickoff_at = v.kickoff_txt::timestamptz
  FROM (VALUES
    -- kolo 6
    (6, 'AEK Athens',        'OFI Crete',        '2026-10-10 18:30+02'),
    (6, 'Asteras Tripolis',  'Atromitos',        '2026-10-10 18:30+02'),
    (6, 'Iraklis',           'Levadiakos',       '2026-10-11 16:00+02'),
    (6, 'AE Kifisia',        'Panetolikos',      '2026-10-11 16:00+02'),
    (6, 'Aris Thessaloniki', 'Volos NFC',        '2026-10-11 18:00+02'),
    (6, 'Olympiacos',        'Panathinaikos',    '2026-10-11 20:00+02'),
    (6, 'PAOK',              'Kalamata',         '2026-10-12 17:00+02'),
    -- kolo 7
    (7, 'Levadiakos',        'Volos NFC',        '2026-10-17 16:00+02'),
    (7, 'Atromitos',         'AEK Athens',       '2026-10-17 18:30+02'),
    (7, 'Kalamata',          'OFI Crete',        '2026-10-18 15:00+02'),
    (7, 'Panetolikos',       'Olympiacos',       '2026-10-18 16:00+02'),
    (7, 'Panathinaikos',     'Asteras Tripolis', '2026-10-18 16:30+02'),
    (7, 'AE Kifisia',        'Aris Thessaloniki','2026-10-18 19:00+02'),
    (7, 'PAOK',              'Iraklis',          '2026-10-18 20:00+02')
  ) AS v(kolo, domacin, gost, kickoff_txt)
  JOIN gameweeks g ON g.number = v.kolo
  JOIN clubs h ON h.name = v.domacin
  JOIN clubs a ON a.name = v.gost
 WHERE f.gameweek_id = g.id
   AND f.home_club_id = h.id
   AND f.away_club_id = a.id;

-- 2) Provera: treba da vrati 14 redova, svaki sa svojim terminom.
SELECT g.number AS kolo, f.kickoff_at, h.name AS domacin, a.name AS gost
  FROM fixtures f
  JOIN gameweeks g ON g.id = f.gameweek_id
  JOIN clubs h ON h.id = f.home_club_id
  JOIN clubs a ON a.id = f.away_club_id
 WHERE g.number IN (6, 7)
 ORDER BY g.number, f.kickoff_at, h.name;

-- 3) OPCIONO: rok za predaju sastava = sat vremena pre prvog meča kola.
--    Pokreni samo ako rokove nisi ručno podešavao.
-- UPDATE gameweeks g
--    SET starts_at   = x.prvi,
--        deadline_at = x.prvi - interval '1 hour',
--        ends_at     = x.poslednji + interval '2 hours'
--   FROM (SELECT gameweek_id, min(kickoff_at) AS prvi, max(kickoff_at) AS poslednji
--           FROM fixtures GROUP BY gameweek_id) x
--  WHERE x.gameweek_id = g.id AND g.number IN (6, 7);
