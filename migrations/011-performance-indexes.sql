-- Indeksi za upite koji se najčešće izvršavaju (lista igrača, mečevi po statusu,
-- sledeće kolo, statistika kola, čipovi). Bezbedno za ponovno pokretanje.

CREATE INDEX IF NOT EXISTS idx_players_active_pos_price
  ON players (position, price DESC) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_fixtures_status_kickoff
  ON fixtures (status, kickoff_at);

CREATE INDEX IF NOT EXISTS idx_gameweeks_deadline
  ON gameweeks (deadline_at);

CREATE INDEX IF NOT EXISTS idx_pgs_gameweek_player
  ON player_gameweek_stats (gameweek_id, player_id);

CREATE INDEX IF NOT EXISTS idx_ugp_gameweek_user
  ON user_gameweek_points (gameweek_id, user_id);

CREATE INDEX IF NOT EXISTS idx_chips_user
  ON chips_usage (user_id);

ANALYZE players;
ANALYZE fixtures;
ANALYZE player_gameweek_stats;
