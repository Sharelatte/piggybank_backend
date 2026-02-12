# 貯金箱トラッカー（バックエンド）

## システム概要
貯金箱トラッカーのバックエンド API です。  
フロントエンドから送信される取引データを受け取り、SQLite に保存し、  
日次集計された残高データを返却します。

「今日は500円入れた」「1円だけ使った」といった小さな取引を  
**確実に保存・集計できること**を重視し、  
シンプルで分かりやすいAPI設計を行っています。

フロントエンドとは完全に分離された構成で、  
ローカル開発・本番環境（AWS EC2）双方での動作を想定しています。


## 主な特徴
- Express による REST API 実装
- SQLite（better-sqlite3）を用いた軽量な永続化
- トランザクションを用いた安全なデータ登録
- サーバー側での時刻生成（JST基準）
- 日次集計 API（折れ線・棒グラフ向けデータ）
- 初期値登録 API（初回利用想定）
- フロントエンドと疎結合な API 設計
- ユーザーごとの貯金箱管理(JWT)


## 技術スタック
- Node.js（v20 以上）
- Express
- better-sqlite3
- SQLite
- systemd（本番環境プロセス管理）



## ディレクトリ構成（抜粋）
```
├── src
│   ├── server.js      # API エントリポイント
│   └── db.js          # DB 初期化・接続
├── data.sqlite3       # SQLite データベース（生成物）
├── package.json
└── README.md
```


## 動作確認方法（ローカル）
環境：Node.js v20 以上

```bash
npm install
node src/server.js
```

起動後、以下のエンドポイントで疎通確認できます。
```bash
curl http://localhost:3000/health
```

## 主なAPI
- POST /api/transactions<br>
  通常の取引（+500 / -500 / +1 / -1）を登録
- GET /api/summary<br>
指定期間の日次残高データを取得
- POST /api/initial-balance<br>
初期値を登録（初回利用想定）
- GET /api/meta<br>
最古の取引日を取得（全期間表示用）

詳細はAPI仕様書を参照してください。

## 関連リポジトリ
- フロントエンド
https://github.com/Sharelatte/piggybank_frontend


## 設計資料
- テーブル定義書
https://docs.google.com/spreadsheets/d/1E0vP6wubI-mgmJrogzwDUbSaqkyfmjPfYDS3aaDuA5g/edit?usp=drive_link
- API仕様書
https://docs.google.com/document/d/12SMf-XWN5fF7Q2O7qsiqUoeBatr-o-LVnso8CBylRd8/edit?usp=drive_link


## お問い合わせ

不具合報告・改善提案は GitHub Issues からお願いします。
