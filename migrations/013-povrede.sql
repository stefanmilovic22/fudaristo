-- Povrede i suspenzije: napomena i očekivani povratak uz status igrača, plus
-- zapis "kada je spisak poslednji put ažuriran" (prikazuje se u Statistikama).
-- Pokreni jednom u Supabase SQL editoru. Ponovno pokretanje je bezopasno.

ALTER TABLE public.players
    ADD COLUMN IF NOT EXISTS status_note  TEXT,
    ADD COLUMN IF NOT EXISTS status_until TIMESTAMPTZ;

-- Jedan red po vrsti podataka (za sada samo 'injuries'). Piše se samo iz admina
-- (service role), čita se javno.
CREATE TABLE IF NOT EXISTS public.data_updates (
    key         TEXT PRIMARY KEY,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    note        TEXT
);

ALTER TABLE public.data_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "data_updates_select_all" ON public.data_updates;
CREATE POLICY "data_updates_select_all" ON public.data_updates FOR SELECT USING (true);
GRANT SELECT ON public.data_updates TO anon, authenticated;
