// src/db.js
// DBの初期化　

const Database = require("better-sqlite3");
const path = require("path");

// DBの作成
const dbPath = path.join(__dirname, "..", "data.sqlite3");
const db = new Database(dbPath);

// 速度と安全のバランス（ローカル開発向け）
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// 初期化 transactionsテーブルを作成
db.exec(`
CREATE TABLE IF NOT EXISTS transactions (
  id         INTEGER PRIMARY KEY,
  type       TEXT    NOT NULL DEFAULT 'normal', -- 'normal' | 'init'
  amount     INTEGER NOT NULL,
  ts         TEXT    NOT NULL, -- ISO 8601 (JST)
  memo       TEXT,
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_ts ON transactions(ts);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
`);

module.exports = { db };