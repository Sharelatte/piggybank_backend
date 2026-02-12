// テーブルのデータを全削除

const Database = require("better-sqlite3");
const path = require("path");

// DBの作成
const dbPath = path.join(__dirname, "..", "data.sqlite3");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

// すべてのデータを削除
db.exec(`
  DELETE FROM transactions WHERE user_id = 1;`
);

module.exports = { db };