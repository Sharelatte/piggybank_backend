// scripts/user_list.js
// ユーザーをリスト表示
// 実行例
// node src/user_list.js
// node src/user_list.js --limit 200
// node src/user_list.js --offset 200 --limit 200
// node src/user_list.js --search example.com
// node src/user_list.js --json
const { openDb } = require("./_db");

function usage() {
  console.log(`Usage:
  node scripts/user_list.js [--limit 50] [--offset 0] [--search keyword] [--json]

Options:
  --limit   default 50 (max 500)
  --offset  default 0
  --search  emailに部分一致（case-insensitive）
  --json    JSONで出力（パイプで処理したい時用）
Examples:
  node scripts/user_list.js
  node scripts/user_list.js --limit 200
  node scripts/user_list.js --search example.com
  node scripts/user_list.js --json
`);
}

function getArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function clampInt(n, def, min, max) {
  const x = Number(n ?? def);
  if (!Number.isFinite(x)) return def;
  const xi = Math.floor(x);
  return Math.min(max, Math.max(min, xi));
}

function main() {
  if (hasFlag("help") || hasFlag("h")) {
    usage();
    return;
  }

  const limit = clampInt(getArg("limit"), 50, 1, 500);
  const offset = clampInt(getArg("offset"), 0, 0, 1_000_000);
  const search = getArg("search");
  const asJson = hasFlag("json");

  const db = openDb();

  try {
    // WHERE句（任意）
    const where = search
      ? "WHERE lower(email) LIKE lower(:q)"
      : "";

    const sql = `
SELECT id, email, created_at
FROM users
${where}
ORDER BY id ASC
LIMIT :limit OFFSET :offset;
`;

    const rows = db.prepare(sql).all({
      q: search ? `%${search}%` : null,
      limit,
      offset,
    });

    if (asJson) {
      console.log(JSON.stringify({ count: rows.length, items: rows }, null, 2));
      return;
    }

    if (rows.length === 0) {
      console.log("(no users)");
      return;
    }

    // 見やすく整形
    const idW = Math.max(2, ...rows.map((r) => String(r.id).length));
    const emailW = Math.max(5, ...rows.map((r) => String(r.email ?? "").length));

    const header =
      String("id").padStart(idW) + "  " +
      String("email").padEnd(emailW) + "  " +
      "created_at";
    console.log(header);
    console.log("-".repeat(header.length));

    for (const r of rows) {
      console.log(
        String(r.id).padStart(idW) + "  " +
        String(r.email ?? "").padEnd(emailW) + "  " +
        (r.created_at ?? "")
      );
    }

    console.log(`\ncount=${rows.length} (limit=${limit}, offset=${offset}${search ? `, search="${search}"` : ""})`);
  } finally {
    db.close();
  }
}

main();