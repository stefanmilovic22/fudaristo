-- ============================================================================
-- Fudaristo — Fantasy Grčka Super Liga
-- Database Schema — Supabase / PostgreSQL
-- Verzija: Demo v1
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUM TIPOVI
-- ----------------------------------------------------------------------------

CREATE TYPE player_position AS ENUM ('GK', 'DEF', 'MID', 'FWD');

CREATE TYPE player_status AS ENUM ('available', 'injured', 'suspended', 'doubtful', 'unavailable');

CREATE TYPE season_phase AS ENUM (
    'regular',              -- regularna sezona (kola 1-26)
    'championship_playoff', -- mesta 1-4
    'conference_playoff',   -- mesta 5-8
    'relegation_playoff'    -- mesta 9-14
);

CREATE TYPE gameweek_status AS ENUM (
    'upcoming',       -- kolo još nije počelo
    'in_progress',    -- mečevi u toku
    'data_pulled',    -- API podaci povučeni, čeka admin proveru
    'admin_reviewed', -- admin potvrdio, spreman za zaključavanje
    'finalized'       -- poeni zaključani i objavljeni korisnicima
);

CREATE TYPE fixture_status AS ENUM ('scheduled', 'live', 'finished', 'postponed', 'cancelled');

CREATE TYPE transfer_chip_type AS ENUM (
    'joker_1',            -- Joker #1 (zimska pauza)
    'joker_2',            -- Joker #2 (prelazak u plej-of)
    'triple_captain',     -- Triple Captain (slobodno)
    'favorite_club_x2'    -- Favorite Club x2 (slobodno)
);

-- ----------------------------------------------------------------------------
-- CLUBS — 14 klubova grčke Super League
-- ----------------------------------------------------------------------------

CREATE TABLE clubs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL UNIQUE,
    short_name      TEXT NOT NULL,               -- npr. "PAO", "OSFP", "PAOK"
    primary_color   TEXT NOT NULL,                -- hex boja za placeholder grb (npr. '#E30613')
    api_football_id INTEGER UNIQUE,               -- mapiranje na API-Football team ID
    is_active       BOOLEAN NOT NULL DEFAULT TRUE, -- za slučaj ispadanja/promena liga sezona za sezonom
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- PLAYERS — svi igrači dostupni za biranje u fantasy timovima
-- ----------------------------------------------------------------------------

CREATE TABLE players (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id         UUID NOT NULL REFERENCES clubs(id) ON DELETE RESTRICT,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    position        player_position NOT NULL,
    price           NUMERIC(4,1) NOT NULL,        -- u milionima evra, npr. 6.5
    status          player_status NOT NULL DEFAULT 'available',
    total_points    INTEGER NOT NULL DEFAULT 0,    -- KEŠ zbira (izvor istine: SUM(player_gameweek_stats.fantasy_points))
    market_value_eur NUMERIC(12, 2),               -- ručno preneta Transfermarkt vrednost, ulaz za formulu cena (GDD sekcija 17)
    api_football_id INTEGER UNIQUE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE, -- npr. napustio ligu tokom sezone
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (club_id, first_name, last_name)
);

CREATE INDEX idx_players_club ON players(club_id);
CREATE INDEX idx_players_position ON players(position);

-- ----------------------------------------------------------------------------
-- USERS — korisnički profili (auth se vodi kroz Supabase Auth, ovo su dodatni podaci)
-- ----------------------------------------------------------------------------

CREATE TABLE users (
    id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    team_name           TEXT NOT NULL UNIQUE,
    team_color          TEXT NOT NULL DEFAULT '#1E88E5',  -- hex boja virtuelnog kluba
    favorite_club_id    UUID REFERENCES clubs(id),
    budget_remaining    NUMERIC(5,1) NOT NULL DEFAULT 100.0,
    free_transfers      INTEGER NOT NULL DEFAULT 1 CHECK (free_transfers >= 0 AND free_transfers <= 5),
    total_points        INTEGER NOT NULL DEFAULT 0,        -- KEŠ zbira (izvor istine: SUM(user_gameweek_points.total_points))
    is_admin            BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- GAMEWEEKS — kola sezone
-- ----------------------------------------------------------------------------

CREATE TABLE gameweeks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number          INTEGER NOT NULL UNIQUE,       -- redni broj kola (1, 2, 3...)
    phase           season_phase NOT NULL DEFAULT 'regular',
    deadline_at     TIMESTAMPTZ NOT NULL,           -- pre prve utakmice kola
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    status          gameweek_status NOT NULL DEFAULT 'upcoming',
    is_current      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gameweeks_status ON gameweeks(status);

-- Sprečava da dva reda istovremeno imaju is_current = TRUE (samo jedan "trenutni" gameweek)
CREATE UNIQUE INDEX idx_gameweeks_single_current ON gameweeks (is_current) WHERE is_current = TRUE;

-- ----------------------------------------------------------------------------
-- FIXTURES — utakmice
-- ----------------------------------------------------------------------------

CREATE TABLE fixtures (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gameweek_id         UUID NOT NULL REFERENCES gameweeks(id) ON DELETE RESTRICT,
    home_club_id        UUID NOT NULL REFERENCES clubs(id),
    away_club_id        UUID NOT NULL REFERENCES clubs(id),
    kickoff_at          TIMESTAMPTZ NOT NULL,
    status              fixture_status NOT NULL DEFAULT 'scheduled',
    home_score          SMALLINT,
    away_score          SMALLINT,
    original_gameweek_id UUID REFERENCES gameweeks(id),  -- audit trail: gameweek u kom je MEČ TREBALO da bude odigran, ako je odložen i premešten (sekcija: odložene utakmice)
    api_football_id     INTEGER UNIQUE,
    api_thesportsdb_id  TEXT UNIQUE,           -- koristi se za automatski import kalendara/rezultata (GDD sekcija 15)
    raw_api_data        JSONB,                       -- ceo API odgovor, za debug/audit
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CHECK (home_club_id != away_club_id)
);

CREATE INDEX idx_fixtures_gameweek ON fixtures(gameweek_id);
CREATE INDEX idx_fixtures_clubs ON fixtures(home_club_id, away_club_id);

-- ----------------------------------------------------------------------------
-- PLAYER_GAMEWEEK_STATS — statistika igrača po kolu (jezgro scoring engine-a)
-- ----------------------------------------------------------------------------

CREATE TABLE player_gameweek_stats (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id           UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    club_id              UUID NOT NULL REFERENCES clubs(id),  -- SNAPSHOT kluba u trenutku meča (igrač može promeniti klub tokom sezone!)
    gameweek_id         UUID NOT NULL REFERENCES gameweeks(id) ON DELETE CASCADE,
    fixture_id          UUID NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,

    minutes_played      SMALLINT NOT NULL DEFAULT 0,
    goals               SMALLINT NOT NULL DEFAULT 0,
    assists             SMALLINT NOT NULL DEFAULT 0,
    clean_sheet         BOOLEAN NOT NULL DEFAULT FALSE,
    goals_conceded      SMALLINT NOT NULL DEFAULT 0,
    saves               SMALLINT NOT NULL DEFAULT 0,       -- samo GK
    penalties_saved     SMALLINT NOT NULL DEFAULT 0,
    penalties_missed    SMALLINT NOT NULL DEFAULT 0,
    yellow_cards        SMALLINT NOT NULL DEFAULT 0,
    red_cards           SMALLINT NOT NULL DEFAULT 0,
    own_goals           SMALLINT NOT NULL DEFAULT 0,
    bonus_points         SMALLINT NOT NULL DEFAULT 0,      -- BPS sistem (1-3)

    fantasy_points        INTEGER NOT NULL DEFAULT 0,      -- IZRAČUNATO iz gornjih vrednosti (sekcija 10 GDD)

    raw_api_data           JSONB,                          -- ceo API player-stats odgovor
    is_admin_reviewed       BOOLEAN NOT NULL DEFAULT FALSE, -- safety net checkbox (sekcija 15 GDD)

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (player_id, fixture_id)
);

CREATE INDEX idx_pgs_player ON player_gameweek_stats(player_id);
CREATE INDEX idx_pgs_gameweek ON player_gameweek_stats(gameweek_id);

-- ----------------------------------------------------------------------------
-- SQUADS (picks) — sastav tima korisnika po kolu
-- ----------------------------------------------------------------------------

CREATE TABLE squads (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gameweek_id         UUID NOT NULL REFERENCES gameweeks(id) ON DELETE CASCADE,
    player_id           UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,

    is_starting           BOOLEAN NOT NULL DEFAULT TRUE,   -- startnih 11 vs klupa (4)
    squad_order           SMALLINT NOT NULL,               -- redosled na klupi (1-4) za auto-sub logiku, ili pozicija na terenu
    is_captain            BOOLEAN NOT NULL DEFAULT FALSE,
    is_vice_captain       BOOLEAN NOT NULL DEFAULT FALSE,
    auto_subbed_in        BOOLEAN NOT NULL DEFAULT FALSE,  -- true ako je klupa automatski ušla umesto igrača koji nije odigrao ni minut

    purchase_price        NUMERIC(4,1) NOT NULL,           -- cena po kojoj je kupljen (za obračun budžeta pri prodaji)

    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_id, gameweek_id, player_id)
);

CREATE INDEX idx_squads_user_gw ON squads(user_id, gameweek_id);
CREATE INDEX idx_squads_player ON squads(player_id);

-- ----------------------------------------------------------------------------
-- TRANSFERS — istorija transfera
-- ----------------------------------------------------------------------------

CREATE TABLE transfers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gameweek_id         UUID NOT NULL REFERENCES gameweeks(id) ON DELETE CASCADE,
    player_out_id       UUID NOT NULL REFERENCES players(id),
    player_in_id        UUID NOT NULL REFERENCES players(id),
    points_cost         SMALLINT NOT NULL DEFAULT 0,        -- 0 za free transfer, -4 za dodatni
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transfers_user ON transfers(user_id);

-- ----------------------------------------------------------------------------
-- CHIPS_USAGE — koji čip je korisnik iskoristio i kada
-- ----------------------------------------------------------------------------

CREATE TABLE chips_usage (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gameweek_id         UUID NOT NULL REFERENCES gameweeks(id) ON DELETE CASCADE,
    chip_type           transfer_chip_type NOT NULL,
    used_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_id, chip_type),  -- svaki čip se koristi max jednom po korisniku u sezoni
    UNIQUE (user_id, gameweek_id) -- samo JEDAN čip aktivan po korisniku po gameweek-u (bilo kog tipa)
);

-- ----------------------------------------------------------------------------
-- USER_GAMEWEEK_POINTS — finalni izračunati fantasy poeni korisnika po kolu
-- (jedini izvor istine za standings — obračunava captain multiplier, čip efekte,
-- i transfer penale; scoring engine ovde upisuje krajnji rezultat, ne u users.total_points direktno)
-- ----------------------------------------------------------------------------

CREATE TABLE user_gameweek_points (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gameweek_id     UUID NOT NULL REFERENCES gameweeks(id) ON DELETE CASCADE,

    raw_points      INTEGER NOT NULL DEFAULT 0,  -- zbir poena startne postave PRE multiplier-a/čipova/penala
    transfer_cost   INTEGER NOT NULL DEFAULT 0,  -- negativan broj (npr. -4 za dodatni transfer)
    chip_type_used  transfer_chip_type,          -- NULL ako nijedan čip nije aktivan to kolo
    total_points    INTEGER NOT NULL DEFAULT 0,  -- FINALNI rezultat (raw_points sa multiplier-ima + transfer_cost)

    calculated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_id, gameweek_id)
);

CREATE INDEX idx_ugp_user ON user_gameweek_points(user_id);
CREATE INDEX idx_ugp_gameweek ON user_gameweek_points(gameweek_id);

-- ----------------------------------------------------------------------------
-- CLUB_SEASON_SNAPSHOTS — realni bodovi/pozicija kluba preneti u plej-of fazu
-- (sekcija 2 GDD-a: championship grupa prenosi pune bodove, conference grupa ih prepolovi)
-- ----------------------------------------------------------------------------

CREATE TABLE club_season_snapshots (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id          UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    snapshot_label   TEXT NOT NULL,           -- npr. 'end_of_regular_season'
    points           INTEGER NOT NULL,         -- realni bodovi (VEĆ primenjeno prepolavljanje ako je conference grupa)
    "position"       SMALLINT NOT NULL,         -- pozicija na tabeli u tom trenutku
    entering_phase   season_phase NOT NULL,      -- u koju fazu ulazi sa ovim bodovima
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (club_id, snapshot_label)
);

-- ----------------------------------------------------------------------------
-- LEAGUES / LEAGUE_MEMBERSHIPS — osnova za privatne lige (demo v1 koristi samo
-- jednu globalnu ligu u UI-ju, ali struktura je spremna za proširenje)
-- ----------------------------------------------------------------------------

CREATE TABLE leagues (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    invite_code     TEXT UNIQUE,               -- NULL za globalnu ligu, generisan kod za privatne
    is_global       BOOLEAN NOT NULL DEFAULT FALSE,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Samo JEDNA globalna liga sme postojati
CREATE UNIQUE INDEX idx_leagues_single_global ON leagues (is_global) WHERE is_global = TRUE;

CREATE TABLE league_memberships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (league_id, user_id)
);

-- Funkcija za standings bilo koje lige (globalne ili privatne) — parametrizovana verzija
-- v_global_league_standings view-a ispod
CREATE FUNCTION league_standings(p_league_id UUID)
RETURNS TABLE (
    user_id UUID,
    team_name TEXT,
    team_color TEXT,
    total_points BIGINT,
    rank BIGINT
) AS $$
    SELECT
        u.id,
        u.team_name,
        u.team_color,
        COALESCE(SUM(ugp.total_points), 0) AS total_points,
        RANK() OVER (ORDER BY COALESCE(SUM(ugp.total_points), 0) DESC) AS rank
    FROM league_memberships lm
    JOIN users u ON u.id = lm.user_id
    LEFT JOIN user_gameweek_points ugp ON ugp.user_id = u.id
    WHERE lm.league_id = p_league_id
    GROUP BY u.id, u.team_name, u.team_color
    ORDER BY total_points DESC;
$$ LANGUAGE sql STABLE;

-- ----------------------------------------------------------------------------
-- PLAYER_PRICE_HISTORY — istorija promena cena (sekcija 17 GDD-a)
-- ----------------------------------------------------------------------------

CREATE TABLE player_price_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    gameweek_id     UUID NOT NULL REFERENCES gameweeks(id) ON DELETE CASCADE,
    old_price       NUMERIC(4,1) NOT NULL,
    new_price       NUMERIC(4,1) NOT NULL,
    net_transfers   INTEGER NOT NULL,       -- neto transferi koji su izazvali promenu (+ ili -)
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pph_player ON player_price_history(player_id);

-- ----------------------------------------------------------------------------
-- POMOĆNI VIEW-OVI (za sekciju 9 GDD — statistike i javni prikazi)
-- ----------------------------------------------------------------------------

-- Rang lista globalne fantasy lige (izračunato iz user_gameweek_points, ne iz keš kolone)
CREATE VIEW v_global_league_standings AS
SELECT
    u.id AS user_id,
    u.team_name,
    u.team_color,
    COALESCE(SUM(ugp.total_points), 0) AS total_points,
    RANK() OVER (ORDER BY COALESCE(SUM(ugp.total_points), 0) DESC) AS rank
FROM users u
LEFT JOIN user_gameweek_points ugp ON ugp.user_id = u.id
GROUP BY u.id, u.team_name, u.team_color
ORDER BY total_points DESC;

-- Top 5 strelaca (real-life goals)
CREATE VIEW v_top_scorers AS
SELECT
    p.id, p.first_name, p.last_name, c.name AS club_name,
    SUM(pgs.goals) AS total_goals
FROM players p
JOIN clubs c ON c.id = p.club_id
JOIN player_gameweek_stats pgs ON pgs.player_id = p.id
GROUP BY p.id, p.first_name, p.last_name, c.name
ORDER BY total_goals DESC
LIMIT 5;

-- Top 5 asistenata
CREATE VIEW v_top_assists AS
SELECT
    p.id, p.first_name, p.last_name, c.name AS club_name,
    SUM(pgs.assists) AS total_assists
FROM players p
JOIN clubs c ON c.id = p.club_id
JOIN player_gameweek_stats pgs ON pgs.player_id = p.id
GROUP BY p.id, p.first_name, p.last_name, c.name
ORDER BY total_assists DESC
LIMIT 5;

-- Top 5 fantasy poentera po poziciji
CREATE VIEW v_top_fantasy_by_position AS
SELECT
    p.id, p.first_name, p.last_name, p.position, c.name AS club_name,
    p.total_points,
    RANK() OVER (PARTITION BY p.position ORDER BY p.total_points DESC) AS rank_in_position
FROM players p
JOIN clubs c ON c.id = p.club_id
WHERE p.is_active = TRUE;

-- Tabela klubova po ukupnim fantasy poenima (zbir poena svih igrača kluba)
CREATE VIEW v_club_fantasy_standings AS
SELECT
    c.id, c.name,
    COALESCE(SUM(p.total_points), 0) AS total_club_fantasy_points
FROM clubs c
LEFT JOIN players p ON p.club_id = c.id
GROUP BY c.id, c.name
ORDER BY total_club_fantasy_points DESC;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- Princip: javno čitanje na svemu što treba da bude vidljivo svim korisnicima
-- (sekcija 9 GDD-a — javni pregled tima, statistike), pisanje ograničeno na
-- vlasnika reda (auth.uid()). Admin panel operacije (unos statistike, cene,
-- gameweek management) idu preko Next.js API rute sa Supabase SERVICE ROLE
-- ključem, koji zaobilazi RLS — zato ne pravimo posebne "is_admin" RLS
-- politike za pisanje na javnim tabelama (players, fixtures, gameweeks, itd.).

-- USERS — javno čitljivo (javni profili timova), korisnik menja samo svoj red
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select_all" ON users FOR SELECT USING (true);
CREATE POLICY "users_insert_own" ON users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id);

-- SQUADS — javno čitljivo (FPL-style "pogledaj bilo čiji tim"), korisnik piše samo svoj
ALTER TABLE squads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "squads_select_all" ON squads FOR SELECT USING (true);
CREATE POLICY "squads_insert_own" ON squads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "squads_update_own" ON squads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "squads_delete_own" ON squads FOR DELETE USING (auth.uid() = user_id);

-- TRANSFERS — privatno (samo vlasnik vidi svoju istoriju transfera)
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transfers_select_own" ON transfers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "transfers_insert_own" ON transfers FOR INSERT WITH CHECK (auth.uid() = user_id);

-- CHIPS_USAGE — privatno (samo vlasnik vidi koje čipove je iskoristio)
ALTER TABLE chips_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chips_select_own" ON chips_usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "chips_insert_own" ON chips_usage FOR INSERT WITH CHECK (auth.uid() = user_id);

-- USER_GAMEWEEK_POINTS — javno čitljivo (potrebno za standings i javni pregled tima)
ALTER TABLE user_gameweek_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ugp_select_all" ON user_gameweek_points FOR SELECT USING (true);
-- Nema INSERT/UPDATE politike za obične korisnike — piše samo scoring engine (service role)

-- CLUBS, PLAYERS, GAMEWEEKS, FIXTURES, PLAYER_GAMEWEEK_STATS, PLAYER_PRICE_HISTORY,
-- CLUB_SEASON_SNAPSHOTS — javno čitljivo za sve, pisanje samo preko service role
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clubs_select_all" ON clubs FOR SELECT USING (true);

ALTER TABLE players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players_select_all" ON players FOR SELECT USING (true);

ALTER TABLE gameweeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gameweeks_select_all" ON gameweeks FOR SELECT USING (true);

ALTER TABLE fixtures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fixtures_select_all" ON fixtures FOR SELECT USING (true);

ALTER TABLE player_gameweek_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pgs_select_all" ON player_gameweek_stats FOR SELECT USING (true);

ALTER TABLE player_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pph_select_all" ON player_price_history FOR SELECT USING (true);

ALTER TABLE club_season_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "css_select_all" ON club_season_snapshots FOR SELECT USING (true);

-- LEAGUES — globalna liga vidljiva svima; privatne lige vidljive samo članovima
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leagues_select" ON leagues FOR SELECT USING (
    is_global = TRUE
    OR EXISTS (SELECT 1 FROM league_memberships lm WHERE lm.league_id = leagues.id AND lm.user_id = auth.uid())
);
CREATE POLICY "leagues_insert_own" ON leagues FOR INSERT WITH CHECK (auth.uid() = created_by);

-- LEAGUE_MEMBERSHIPS — vidljivo članovima te lige, korisnik se sam upisuje
ALTER TABLE league_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memberships_select" ON league_memberships FOR SELECT USING (
    EXISTS (SELECT 1 FROM league_memberships lm2 WHERE lm2.league_id = league_memberships.league_id AND lm2.user_id = auth.uid())
);
CREATE POLICY "memberships_insert_own" ON league_memberships FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- KRAJ ŠEME (Demo v1)
-- ============================================================================
