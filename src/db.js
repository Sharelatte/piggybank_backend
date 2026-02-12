// src/db.js
// DBの初期化 + 簡易マイグレーション

const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "..", "data.sqlite3");
const db = new Database(dbPath);

// 速度と安全のバランス（ローカル開発向け）
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/**
 * 指定したテーブルのカラムが存在するか確認
 */
function hasColumn(tableName, columnName) {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return cols.some((c) => c.name === columnName);
}

/**
 * 初期テーブル作成（存在しなければ作る）
 */
function initTables() {
  // users テーブル
  db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`);

  // transactions テーブル（既存の形を維持しつつ IF NOT EXISTS）
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
}

/**
 * 追加マイグレーション（既存DBにも後付けで適用）
 */
function migrate() {
  // transactions に user_id を追加（無ければ）
  if (!hasColumn("transactions", "user_id")) {
    db.exec(`ALTER TABLE transactions ADD COLUMN user_id INTEGER;`);
  }

  // user_id + ts の複合INDEX（無ければ）
  // SQLiteには IF NOT EXISTS が使えるので普通に作ってOK
  db.exec(`
CREATE INDEX IF NOT EXISTS idx_transactions_user_ts ON transactions(user_id, ts);
`);

  // 既存データの user_id が NULL の場合、仮ユーザー(1)に寄せる
  // ※まだ users を作ってない段階でも UPDATE はできるが、整合のため users も用意する
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM transactions WHERE user_id IS NULL`)
    .get();

  if ((row?.c ?? 0) > 0) {
    // 仮ユーザーを用意（後で register/login を作ったら使わなくてもOK）
    const now = new Date().toISOString();
    db.prepare(
      `INSERT OR IGNORE INTO users (id, email, password_hash, created_at)
       VALUES (1, 'local@dummy', 'DUMMY', ?)`
    ).run(now);

    db.prepare(`UPDATE transactions SET user_id = 1 WHERE user_id IS NULL`).run();
  }
}

// 実行順
initTables();
migrate();

module.exports = { db };