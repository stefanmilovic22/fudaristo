-- Oduzimanje bodova klubu odlukom saveza (npr. NPS Volos −3).
--
-- Tabela Super lige se računa iz odigranih mečeva (lib/league-table.ts); ovo je
-- jedina stvar koja ne proizlazi iz rezultata, pa se čuva uz klub. Tabela, početna,
-- stranice klubova i težina mečeva (FDR) čitaju isto polje, pa se promena vidi svuda.
-- Kasnije izmene su jedan UPDATE (vidi dole), bez izmene koda.
--
-- Pokreni jednom u Supabase SQL editoru. Bezbedno za ponavljanje.

ALTER TABLE public.clubs
    ADD COLUMN IF NOT EXISTS points_deduction INTEGER NOT NULL DEFAULT 0 CHECK (points_deduction >= 0);

-- NPS Volos: −3 boda
UPDATE public.clubs
   SET points_deduction = 3
 WHERE name ILIKE '%volos%';

-- Provera: treba da vrati tačno jedan red sa points_deduction = 3
SELECT id, name, points_deduction FROM public.clubs WHERE points_deduction > 0;

-- Ukidanje ili promena kasnije, npr.:
--   UPDATE public.clubs SET points_deduction = 0 WHERE name ILIKE '%volos%';
