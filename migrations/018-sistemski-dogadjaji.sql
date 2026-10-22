-- ============================================================================
-- 018 — Sistemski događaji (praćenje grešaka)
-- ============================================================================
-- Greške servera i pregledača, upozorenja iz cron-a i slično, na jednom mestu.
-- Piše se SAMO servisnim ključem (lib/monitor.ts); čita ih admin na /admin.
-- Bezbedno za ponovno pokretanje.

CREATE TABLE IF NOT EXISTS system_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    level       TEXT NOT NULL CHECK (level IN ('error', 'warning', 'info')),
    source      TEXT NOT NULL,            -- npr. 'cron:pull-results', 'server:route:/moj-tim', 'client'
    message     TEXT NOT NULL,
    details     JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_source_msg ON system_events(source, created_at DESC);

ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;

-- Samo admin čita; niko ne piše preko API-ja (servisni ključ zaobilazi RLS).
DROP POLICY IF EXISTS "system_events_select_admin" ON system_events;
CREATE POLICY "system_events_select_admin" ON system_events
    FOR SELECT
    USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = TRUE));
