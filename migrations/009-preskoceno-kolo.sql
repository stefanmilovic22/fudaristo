-- ============================================================================
-- Fudaristo — migracija 009
-- Status "skipped" za kola koja se NE obračunavaju.
--
-- ZAŠTO: kola 1-3 su odigrana pre nego što je iko imao sastav u aplikaciji.
-- Za njih obračun nema smisla — nema kome da se dodele poeni. Do sad su
-- takva kola zauvek stajala u admin panelu kao "traže pažnju", jer jedini
-- način da nestanu odatle bio je da se zaključaju, a zaključati kolo koje
-- nije obračunato znači slagati i sebe i tabelu.
--
-- "skipped" je zaseban ishod: kolo je zatvoreno, ne obračunava se, i jasno se
-- razlikuje od "finalized" ako se za pola godine bude gledalo zašto u tim
-- kolima niko nema poene.
--
-- Pokreni posle 008-chips.sql. Bezbedno je pokrenuti više puta.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'gameweek_status' AND e.enumlabel = 'skipped'
    ) THEN
        ALTER TYPE gameweek_status ADD VALUE 'skipped';
        RAISE NOTICE 'Dodata vrednost "skipped" u gameweek_status.';
    ELSE
        RAISE NOTICE 'Vrednost "skipped" već postoji.';
    END IF;
END $$;

-- ============================================================================
-- KRAJ migracije 009
--
-- Kola 1-3 označi iz admin panela ("Ne obračunavaj ovo kolo"), ili ovde:
--
--   update gameweeks set status = 'skipped' where number in (1, 2, 3);
--
-- Ako ih je već neko zaključao, prvo proveri da nemaju poene:
--   select gameweek_id, count(*) from user_gameweek_points group by gameweek_id;
-- ============================================================================
