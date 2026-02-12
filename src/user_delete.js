// scripts/user_delete.js
// ユーザー削除
// 実行例
// # そのユーザーの取引だけ全消し
// node src/user_delete.js --userId 1

// # ユーザー行ごと削除（取引も削除）
// node src/user_delete.js --userId 1 --hard
const { openDb } = require("./_db");

function usage() {
  console.log(`Usage:
  node scripts/user_delete.js --userId 1 [--hard]
Options:
  --userId   required
  --hard     usersテーブルの行も消す（指定しない場合はtransactionsだけ削除）
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

  const hard = hasFlag("hard");

  const db = openDb();
  try {
    const tx = db.transaction(() => {
      const delTx = db.prepare("DELETE FROM transactions WHERE user_id = ?").run(userId).changes;

      let delUser = 0;
      if (hard) {
        delUser = db.prepare("DELETE FROM users WHERE id = ?").run(userId).changes;
      }
      return { delTx, delUser };
    });

    const out = tx();
    console.log(
      `Deleted: transactions=${out.delTx}` + (hard ? `, users=${out.delUser}` : "")
    );
  } finally {
    db.close();
  }
}

main();