-- Nacionalnost igrača (dvoslovna ISO oznaka države: GR, RS, AL…).
-- Prazno (NULL) dok se ne uveze iz SofaScore-a (Admin → „Nacionalnosti igrača").
-- Pokreni jednom u Supabase SQL editoru PRE postavljanja novog koda. Bezbedno za ponavljanje.

ALTER TABLE public.players
    ADD COLUMN IF NOT EXISTS nationality TEXT
    CHECK (nationality IS NULL OR nationality ~ '^[A-Z]{2}$');
