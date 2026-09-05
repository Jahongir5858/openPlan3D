PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS projects (
  user_id INTEGER NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS project_chunks (
  user_id INTEGER NOT NULL,
  project_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, project_id, chunk_index),
  FOREIGN KEY (user_id, project_id) REFERENCES projects(user_id, id) ON DELETE CASCADE
);
