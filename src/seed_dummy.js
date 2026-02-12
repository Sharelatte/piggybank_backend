// scripts/seed_dummy.js
// 指定ユーザーIDにダミーデータ挿入
// 実行例
// node src/seed_dummy.js --userId 1
// node src/seed_dummy.js --userId 1 --days 30 --maxPerDay 5
const { openDb } = require("./_db");

function usage() {
  console.log(`Usage:
  node scripts/seed_dummy.js --userId 1 [--days 365] [--maxPerDay 3]
Options:
  --userId     required
  --days       default 365（何日前まで入れるか）
  --maxPerDay  default 3（1日あたり最大何件）
`);
}

function getArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function isoJst(date) {
  const d = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return d.toISOString().replace("Z", "+09:00");
}

function main() {
  const userIdRaw = getArg("userId");
  if (!userIdRaw) {
    usage();
    process.exit(1);
  }
  const userId = Number(userIdRaw);
  if (!Number.isInteger(userId) || userId <= 0) {
    console.error("--userId must be positive integer");
    process.exit(1);
  }

  const days = Number(getArg("days") ?? "365");
  const maxPerDay = Number(getArg("maxPerDay") ?? "3");
  if (!Number.isFinite(days) || days < 1) {
    console.error("--days must be >= 1");
    process.exit(1);
  }
  if (!Number.isFinite(maxPerDay) || maxPerDay < 0 || maxPerDay > 50) {
    console.error("--maxPerDay must be 0..50");
    process.exit(1);
  }

  const db = openDb();

  try {
    // ユーザー存在チェック
    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (!user) {
      console.error(`User not found: id=${userId}`);
      process.exit(1);
    }

    const AMOUNTS = [500, -500, 1, -1];

    const insert = db.prepare(`
      INSERT INTO transactions (user_id, type, amount, ts, memo, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - (days - 1));

    const tx = db.transaction(() => {
      let count = 0;
      const d = new Date(start);

      while (d <= today) {
        const n = Math.floor(Math.random() * (maxPerDay + 1)); // 0..maxPerDay
        for (let i = 0; i < n; i++) {
          const amount = AMOUNTS[Math.floor(Math.random() * AMOUNTS.length)];

          const hh = Math.floor(Math.random() * 24);
          const mm = Math.floor(Math.random() * 60);
          const ss = Math.floor(Math.random() * 60);

          const ts = new Date(d);
          ts.setHours(hh, mm, ss, 0);

          const iso = isoJst(ts);

          insert.run(userId, "normal", amount, iso, "dummy", iso);
          count++;
        }
        d.setDate(d.getDate() + 1);
      }
      return count;
    });

    const inserted = tx();
    console.log(`Inserted ${inserted} dummy transactions for userId=${userId}`);
  } finally {
    db.close();
  }
}

main();