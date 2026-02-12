// ユーザーを作成
const bcrypt = require("bcrypt");
const { db } = require("./db");

async function main() {
  const email = "admin@example.com";
  const password = "password123";

  const hash = await bcrypt.hash(password, 10);

  db.prepare(`
    INSERT INTO users (email, password_hash, created_at)
    VALUES (?, ?, datetime('now'))
  `).run(email, hash);

  console.log("User created");
}

main();