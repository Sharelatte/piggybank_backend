// src/server.js
// 貯金箱カウンターのAPI実装

const express = require("express");
const cors = require("cors"); 
const { db } = require("./db");

const app = express();
// CORSを使うミドルウェア登録
app.use(cors());
// 「リクエストのJSONボディを読み取れるようにする」ミドルウェアを登録
app.use(express.json());

const PORT = process.env.PORT || 3000;

// JSTのISOっぽい文字列を作る（末尾に +09:00 を付ける）
// とりあえずJSTならこれでOKだが、他地域対応するならライブラリ（dayjs / luxon）推奨

function nowIsoJst() {
  // 現在時刻に9時間(ミリ秒)を足して、UTC→JSTに変換
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  // 例: 2026-02-07T10:23:45.123Z を Z→+09:00 に置換
  return d.toISOString().replace("Z", "+09:00");
}

// バリデーション

// 日付
function isYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// 通常時の取引登録
function isValidNormalAmount(amount) {
  return amount === 500 || amount === -500 || amount === 1 || amount === -1;
}

// 初期金額登録
function isValidInitAmount(amount) {
  return Number.isInteger(amount) && amount >= 0 && amount <= 10_000_000;
}

/**
 * トランザクションAPI
 * POST /api/transactions
 * body: { amount, memo? }
 */
app.post("/api/transactions", (req, res) => {

  // ts は受け取らない(サーバーで付与)
  const { amount, memo } = req.body ?? {};

  // 開発中は「古いクライアント」を即発見できるので もし付いていたら400を返す
  if (req.body?.ts != null) {
    return res.status(400).json({ error: "ts is server-generated; do not send ts" });
  }

  // バリデーションを通す
  // 通常取引
  if (!isValidNormalAmount(amount)) {
    return res.status(400).json({ error: "amount must be one of 500, -500, 1, -1" });
  }
  // メモ
  if (memo != null && typeof memo !== "string") {
    return res.status(400).json({ error: "memo must be string" });
  }

  const tsValue = nowIsoJst();        // 取引日時（サーバ生成）
  const createdAt = nowIsoJst();      // 作成日時（サーバ生成）

  // DBトランザクション
  const insertAndGet = db.transaction(() => {

    // prepare() の ? に、run() の引数を左から順番に差し込んでSQL実行
    // memo ?? null は memo が undefined / null のときだけ null にする（空文字 "" はそのまま）
    const insert = db
     .prepare("INSERT INTO transactions (type, amount, ts, memo, created_at) VALUES (?, ?, ?, ?, ?)")
     .run("normal", amount, tsValue, memo ?? null, createdAt);

    // transactionに入っている全データの合計金額を取得する(totalRow.totalで取れる)
    const totalRow = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions").get();

    // Response
    return {
      transaction: {
        id: String(insert.lastInsertRowid),
        ts: tsValue,
        amount,
        memo: memo ?? null,
        created_at: createdAt, // 返すなら（任意）
      },
      total: totalRow.total,
    };
  });

  // db.transactionで囲んでいるので、transaction内の処理が失敗した時には自動的にロールバック(DB登録とかをなかったことにする)
  try {
    const out = insertAndGet();
    res.status(201).json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * データ取得API
 * GET /api/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&mode=diff|total&fill=true|false
 */

app.get("/api/summary", (req, res) => {

  const { from, to } = req.query;
  const mode = "total"; // 取引の出力形式(差分: diff 総計：total)今回は折線だけなのでtotal固定
  const fill = false;   // 常に false (データがない日にゼロ埋めしない→データがある日だけ返す)
  const granularityReq = (req.query.granularity ?? "auto").toString(); // 間引き設定　auto|day|week|month

  // バリデーション
  // 日付
  if (!isYYYYMMDD(from) || !isYYYYMMDD(to)) {
    return res.status(400).json({ error: "from/to must be YYYY-MM-DD" });
  }
  // 間引き設定
  if (!["auto", "day", "week", "month"].includes(granularityReq)) {
    return res.status(400).json({ error: "granularity must be auto|day|week|month" });
  }

  // a〜b の両端を含む日数を返す（同日なら1）
  function daysBetween(a, b) {
    const da = new Date(a + "T00:00:00");
    const db = new Date(b + "T00:00:00");
    return Math.floor((db - da) / (24 * 3600 * 1000)) + 1;
  }

  // aからbまでの日数から、間引きの単位を決める(auto用)
  function pickGranularity(a, b, g) {

    // 手動で設定されていたらそれに従う
    if (g === "day" || g === "week" || g === "month") return g;

    const days = daysBetween(a, b);
    if (days <= 60) return "day";   // 60日以内ならday
    if (days <= 180) return "week"; // 180日以内ならweek
    return "month";                 // それ以上ならmonth
  }

  const g = pickGranularity(from, to, granularityReq);


  // day/week/monthから、対応するSQLをセット
  let bucketExpr;

if (g === "day") {          
  // 日単位：そのまま日付を使う
  bucketExpr = "dateKey";

} else if (g === "week") {  
  // 週単位：週の先頭（月曜）の日付に丸める
  // strftime('%w', dateKey) は曜日番号を返す
  //   日曜=0, 月曜=1, …, 土曜=6
  //
  // (曜日番号 + 6) % 7 によって
  //   「その日から月曜まで何日戻るか」を計算する
  //
  // 例：
  //   水曜(3) → (3+6)%7 = 2 → 2日前 = 月曜
  //   日曜(0) → (0+6)%7 = 6 → 6日前 = 月曜
  //
  // printf('-%d days', N) によって "-2 days" のような修飾子を作り
  // date(dateKey, "-2 days") として dateKey から N日戻した日付を返す
  bucketExpr =
    "date(dateKey, printf('-%d days', (cast(strftime('%w', dateKey) as integer) + 6) % 7))";

} else {
  // 月単位：月初の日付に丸める
  bucketExpr = "date(dateKey, 'start of month')";
}

  try {
    // 総計金額を取り出す
    const totalRow = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions").get();

    // fillなしのSQL
    const sqlBucketNoFill = `
WITH
opening AS (
  SELECT COALESCE(SUM(amount), 0) AS opening_total
  FROM transactions
  WHERE substr(ts, 1, 10) < :from
),
raw AS (
  SELECT
    substr(ts, 1, 10) AS dateKey,
    amount
  FROM transactions
  WHERE substr(ts, 1, 10) BETWEEN :from AND :to
),
bucketed AS (
  SELECT
    ${bucketExpr} AS date,
    SUM(amount)   AS diff
  FROM raw
  GROUP BY ${bucketExpr}
)
SELECT
  date,
  diff,
  (SELECT opening_total FROM opening)
  + SUM(diff) OVER (ORDER BY date) AS total
FROM bucketed
ORDER BY date;
`;
    // fromからtoまでの全区間データを引いてくる
    const rows = db.prepare(sqlBucketNoFill).all({ from, to });

    // 戻り値
    res.json({
      total: totalRow.total,
      from,
      to,
      mode,
      fill,
      granularity: g,
      byDay: rows, // 互換のため名前は byDay のまま
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * デバッグ用関数
 * 指定したパラメータのデータをとってくる
 * GET /api/transactions?from&to&limit&cursor
 * cursor: last seen id (number)
 */
app.get("/api/transactions", (req, res) => {
  const from = req.query.from?.toString();
  const to = req.query.to?.toString();
  const limitRaw = req.query.limit?.toString() ?? "50";   // ページング件数
  const cursorRaw = req.query.cursor?.toString();         // 次のページが何件目から始まるか

  // バリデーション
  if (from && !isYYYYMMDD(from)) return res.status(400).json({ error: "from must be YYYY-MM-DD" });
  if (to && !isYYYYMMDD(to)) return res.status(400).json({ error: "to must be YYYY-MM-DD" });

  // limit(省略の場合50件、max200件)
  let limit = Number(limitRaw);
  if (!Number.isFinite(limit) || limit < 1) limit = 50;
  if (limit > 200) limit = 200;

  // cursor
  const cursor = cursorRaw != null ? Number(cursorRaw) : null;
  if (cursorRaw != null && (!Number.isFinite(cursor) || cursor <= 0)) {
    return res.status(400).json({ error: "cursor must be positive number" });
  }

  try {
    const limitPlusOne = limit + 1;

    const sql = `
SELECT id, ts, amount, memo
FROM transactions
WHERE (:from IS NULL OR substr(ts, 1, 10) >= :from)
  AND (:to   IS NULL OR substr(ts, 1, 10) <= :to)
  AND (:cursor IS NULL OR id < :cursor)
ORDER BY id DESC
LIMIT :limitPlusOne;
`;

    // データ引いてくる
    const rows = db.prepare(sql).all({
      from: from ?? null,
      to: to ?? null,
      cursor: cursor ?? null,
      limitPlusOne,
    });

    // カーソル計算
    let nextCursor = null;
    let items = rows;
    if (rows.length > limit) {
      const last = rows[limit - 1];
      items = rows.slice(0, limit);
      nextCursor = last.id;
    }

    res.json({
      items: items.map(r => ({
        id: String(r.id),
        ts: r.ts,
        amount: r.amount,
        memo: r.memo,
      })),
      nextCursor,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * 最初の取引一件を取得 直近の日付かnullを返す
 * GET /api/meta
 */
app.get("/api/meta", (req, res) => {
  try {
    const row = db.prepare(`
      SELECT MIN(substr(ts, 1, 10)) AS minDate
      FROM transactions
    `).get();

    // まだ取引が1件もない場合は null
    res.json({ minDate: row?.minDate ?? null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * 金額の初期値を登録
 * POST /api/initial-balance
 * {amount, memo}
 */

app.post("/api/initial-balance", (req, res) => {
  const { amount, memo } = req.body ?? {};

  // バリデーション
  // 金額
  if (!isValidInitAmount(amount)) {
    return res.status(400).json({ error: "amount must be an integer >= 0" });
  }
  // memo
  if (memo != null && typeof memo !== "string") {
    return res.status(400).json({ error: "memo must be string" });
  }

  // サーバー時刻作成
  const tsValue = nowIsoJst();
  const createdAt = nowIsoJst();

  // トランザクション開始
  const insertAndGet = db.transaction(() => {
    // 2回目を禁止したいならここでチェックして 409 を返す（今は許可）
    const insert = db
      .prepare(
        "INSERT INTO transactions (type, amount, ts, memo, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run("init", amount, tsValue, memo ?? "initial balance", createdAt);

    const totalRow = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions").get();

    return {
      transaction: {
        id: String(insert.lastInsertRowid),
        type: "init",
        ts: tsValue,
        amount,
        memo: memo ?? "initial balance",
      },
      total: totalRow.total,
    };
  });

  try {
    const out = insertAndGet();
    res.status(201).json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
