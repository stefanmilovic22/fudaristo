-- Atromitos – AEK Athens je odložen (7. kolo). Isto se može uraditi u adminu:
-- /admin → meč → status „odložen”.
UPDATE fixtures f
   SET status = 'postponed'
  FROM clubs h, clubs a
 WHERE h.id = f.home_club_id AND h.name = 'Atromitos'
   AND a.id = f.away_club_id AND a.name = 'AEK Athens'
   AND f.status = 'scheduled';

-- Provera: treba 1 red sa statusom postponed.
SELECT g.number AS kolo, f.kickoff_at, h.name AS domacin, a.name AS gost, f.status
  FROM fixtures f
  JOIN gameweeks g ON g.id = f.gameweek_id
  JOIN clubs h ON h.id = f.home_club_id
  JOIN clubs a ON a.id = f.away_club_id
 WHERE h.name = 'Atromitos' AND a.name = 'AEK Athens';
