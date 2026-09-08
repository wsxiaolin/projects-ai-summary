CREATE TABLE IF NOT EXISTS error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  path TEXT,
  message TEXT,
  stack TEXT,
  extra TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  event TEXT NOT NULL,
  data TEXT,
  ip TEXT
);

CREATE TABLE IF NOT EXISTS search_terms (
  term TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  last_searched_at TEXT
);

CREATE TABLE IF NOT EXISTS seo_index_state (
  engine TEXT PRIMARY KEY,
  cursor_id TEXT,
  last_run_at TEXT,
  last_status TEXT
);
