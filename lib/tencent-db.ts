import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath =
  process.env.WORD_QUEST_DB_PATH ??
  (process.env.VERCEL ? join("/tmp", "word-quest.sqlite") : join(process.cwd(), ".data", "word-quest.sqlite"));
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS word_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    word TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    spelling_errors INTEGER NOT NULL DEFAULT 0,
    reading_errors INTEGER NOT NULL DEFAULT 0,
    mastery INTEGER NOT NULL DEFAULT 0,
    interval_days INTEGER NOT NULL DEFAULT 0,
    due_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    UNIQUE(user_id, word)
  );
  CREATE INDEX IF NOT EXISTS idx_word_progress_user_due ON word_progress(user_id, due_at);
  CREATE TABLE IF NOT EXISTS practice_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    word TEXT NOT NULL,
    spelling_correct INTEGER NOT NULL,
    reading_correct INTEGER NOT NULL,
    response_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_attempts_user_created ON practice_attempts(user_id, created_at);
  CREATE TABLE IF NOT EXISTS lexicon_cache (
    word TEXT PRIMARY KEY,
    ipa TEXT NOT NULL,
    meaning TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'dictionary',
    updated_at TEXT NOT NULL
  );
`);

export default database;
