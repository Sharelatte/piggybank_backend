// scripts/_db.js
// ユーテリティ共通関数
const Database = require("better-sqlite3");
const path = require("path");

function openDb() {
  const dbPath = path.join(__dirname, "..", "data.sqlite3");
  const db = new Database(dbPath);

  // 運用寄りの設定
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  return db;
}

module.exports = { openDb };