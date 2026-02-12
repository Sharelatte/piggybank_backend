// scripts/user_create.js
// ユーザ作成
// 実行例
// node src/user_create.js --email admin@example.com --password password123
const bcrypt = require("bcrypt");
const { openDb } = require("./_db");

function usage() {
  console.log(`Usage:
  node scripts/user_create.js --email admin@example.com --password password123
Options:
  --email      required
  --password   required
`);
}

function getArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

async function main() {
  const email = getArg("email");
  const password = getArg("password");

  if (!email || !password) {
    usage();
    process.exit(1);
  }

  const db = openDb();

  try {
    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (exists) {
      console.error(`User already exists: email=${email}, id=${exists.id}`);
      process.exit(1);
    }

    const hash = await bcrypt.hash(password, 10);

    const info = db
      .prepare(
        `INSERT INTO users (email, password_hash, created_at)
         VALUES (?, ?, datetime('now'))`
      )
      .run(email, hash);

    console.log(`User created: id=${info.lastInsertRowid}, email=${email}`);
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});