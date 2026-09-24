# Cloudflareへの配置

このリポジトリの本番設定は `wrangler.jsonc`、ローカル専用設定は `wrangler.local.jsonc` です。本番へローカル専用設定を使わないでください。

配置済みのリソース:

- Worker名: `linc`（2026-09-22にデプロイ済み）
- URL: `https://linc.kazumasa.workers.dev`
- 非公開R2バケット: `linc-files`
- Accessアプリ: `Linc`、ID `8d8f392d-3da9-4f55-bfa0-2a370f56cca4`
- Accessポリシー: `Linc owner`、ID `d79d4439-7239-41fc-bb62-433092554d94`
- Accessの本人確認先: `kazumasa.cloudflareaccess.com`

Accessは現在、設定済みの初期管理者メールアドレスだけを許可します。チームメンバーを追加するときは、Accessの許可メールと、Lincのワークスペースメンバーの両方を設定します。Linc内でメンバーを除外すると、Accessへのログインが残っていてもチケットを取得できません。

WebSocketを利用するため、Accessはホスト名を保護します。Worker全体を対象にしたAccessは現在WebSocket接続を拒否するため使用しません。[Cloudflare公式の制約](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)

プレビューURLは無効です。Workerも各API要求でJWTの署名、issuer、audience、有効期限を検証します。認証情報をクライアントから申告されたメールアドレスだけで信用しません。

## デプロイ

ローカルの受入チェックが完了してから実行します。

```sh
pnpm exec playwright install chromium
pnpm check
pnpm test:e2e
pnpm exec wrangler deploy
```

初回デプロイ時にSQLite Durable Objectのnamespaceが作成されます。R2を公開する設定は不要です。Worker経由で、対象チケットの閲覧権限を確認してからファイルを返します。

デプロイ後は未ログインの要求がAccessのログインへ移動することを確認し、本人のブラウザーで最初のワークスペースを作成します。WorkerへのOAuthログインと、Lincを使うためのAccessログインは別です。

CLIの本番ログインには `cloudflared` が必要です。

```sh
pnpm linc --url https://linc.kazumasa.workers.dev auth login
```

ログイン先は次回以降の既定の接続先になります。ログイン後は `linc issue list` のようにURLを省略できます。保存されるトークンの設定ファイルは所有者だけが読める権限にします。有効期限が切れたら再度ログインします。

## 現在の確認状況

2026-09-25にバージョン `4b2685bb-39b7-4e2d-bc3b-7bd5468b72b9` を配置しました。未ログインの `/` と `/api/v1/me` はAccessログインへ302で移動します。ログイン済みのブラウザーで新しいArchivedナビと、通常のworkspace選択欄から除外されたworkspaceがArchived配下に表示されることを読み取り専用で確認しました。本番データを使うE2Eや負荷試験は実行していません。
