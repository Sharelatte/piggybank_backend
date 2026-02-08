// scripts/seedDummy.js
// DBにテストデータを入れる
const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "..", "data.sqlite3");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

// JST ISO文字列っぽい文字列を作成
// とりあえずJSTならこれでOKだが、他地域対応するならライブラリ（dayjs / luxon）推奨

function isoJst(date) {

  // 現在時刻に9時間(ミリ秒)を足して、UTC→JSTに変換
  const d = new Date(date.getTime() + 9 * 60 * 60 * 1000); 

  // 2026-02-08T00:00:00Z → 2026-02-08T00:00:00+09:00に変換
  return d.toISOString().replace("Z", "+09:00");  

}

// amount 候補
const AMOUNTS = [500, -500, 1, -1];

// 期間：今日から1年前
const today = new Date();
const start = new Date();
start.setFullYear(today.getFullYear() - 1);

// DBにレコードを登録用SQL
const insert = db.prepare(`
  INSERT INTO transactions (amount, ts, memo, created_at)
  VALUES (?, ?, ?, ?)
`);

// DBトランザクション開始
const tx = db.transaction(() => {

  let count = 0;
  const d = new Date(start);

  while (d <= today) {
    // 1日あたり 0〜3 件ランダムにレコードを作る
    const n = Math.floor(Math.random() * 4);

    for (let i = 0; i < n; i++) {
      const amount = AMOUNTS[Math.floor(Math.random() * AMOUNTS.length)];

      // 時刻も少しランダム
      const hh = Math.floor(Math.random() * 24);
      const mm = Math.floor(Math.random() * 60);
      const ss = Math.floor(Math.random() * 60);

      const ts = new Date(d);
      ts.setHours(hh, mm, ss, 0);

      const iso = isoJst(ts);   // 時間をISO文字列に変換

      // レコード登録
      insert.run(
        amount,
        iso,
        "dummy",
        iso
      );

      count++;
    }

    d.setDate(d.getDate() + 1);
  }

  return count;
});

// 実行
const inserted = tx();
console.log(`Inserted ${inserted} dummy transactions`);
db.close();