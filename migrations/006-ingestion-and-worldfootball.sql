-- ============================================================================
-- Fudaristo — migracija 006
-- Infrastruktura za Fazu 5: dnevnik ingestion pokretanja, i kolone potrebne
-- za admin "Povuci sa worldfootball-a" tok.
--
-- Pokreni posle 005-lineup-and-batch-transfers.sql. Bezbedno je pokrenuti
-- više puta.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) INGESTION_RUNS — dnevnik svakog pokretanja automatike
-- ----------------------------------------------------------------------------
-- Piše ISKLJUČIVO service role (cron ruta i admin server action-i) —
-- korisnička RLS nema INSERT/UPDATE politiku, pa je pisanje van servera
-- nemoguće bez obzira na to ko je ulogovan.

CREATE TABLE IF NOT EXISTS ingestion_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind            TEXT NOT NULL,           -- 'cron_results' | 'admin_manual_trigger' | 'admin_worldfootball_pull'
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    fixture_id      UUID REFERENCES fixtures(id) ON DELETE SET NULL,  -- popunjeno samo za worldfootball pull (jedan meč)
    rounds_checked  INTEGER[] NOT NULL DEFAULT '{}',
    fixtures_touched INTEGER NOT NULL DEFAULT 0,
    errors          JSONB NOT NULL DEFAULT '[]',
    triggered_by    UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL = automatski cron
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_started ON ingestion_runs(started_at DESC);

ALTER TABLE ingestion_runs ENABLE ROW LEVEL SECURITY;

-- Samo admin vidi dnevnik — nije osetljivo, ali nije ni nešto što treba da
-- vidi svaki registrovan korisnik.
DROP POLICY IF EXISTS "ingestion_runs_select_admin" ON ingestion_runs;
CREATE POLICY "ingestion_runs_select_admin" ON ingestion_runs
    FOR SELECT
    USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = TRUE));


-- ----------------------------------------------------------------------------
-- 2) FIXTURES — mesto za URL izveštaja sa worldfootball.net
-- ----------------------------------------------------------------------------
-- Admin ga jednom nalepi (browsanjem sajta), skripta za povlačenje ga
-- pamti — ne pokušavamo da ga sami pogodimo iz datuma/klubova, jer
-- worldfootball koristi svoje numeričke ID-jeve mečeva koji se ne mogu
-- izvesti bez browsanja.

ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS worldfootball_url TEXT;


-- ----------------------------------------------------------------------------
-- 3) PLAYERS — pamćenje uparivanja sa worldfootball ID-jem igrača
-- ----------------------------------------------------------------------------
-- Prvi put se igrač uparuje po prezimenu (uz admin proveru u review ekranu).
-- Ako se tu upiše worldfootball ID, sledeći pull za istog igrača ga
-- prepoznaje direktno — pouzdaniji ključ od imena (isto obrazloženje kao
-- CLUB_ALIASES za TheSportsDB u Fazi 4).

ALTER TABLE players ADD COLUMN IF NOT EXISTS api_worldfootball_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_players_worldfootball_id
    ON players(api_worldfootball_id) WHERE api_worldfootball_id IS NOT NULL;

-- ============================================================================
-- KRAJ migracije 006
-- ============================================================================
