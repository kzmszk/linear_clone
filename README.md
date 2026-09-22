# Linc

3〜5人のチーム向けの、Linear互換チケット管理ツールです。WebとCLIは同じHTTP APIを使い、Cloudflare Worker内のSQLite Durable Objectに保存します。添付ファイルは非公開R2に保存します。

## ローカルで起動

Node.js 24以降とpnpmを使用します。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

表示されたlocalhostのURLを開き、最初のワークスペースを作成します。設定画面でチームを作成すると、チケットを登録できます。

開発中のWebを自動更新する場合は、別ターミナルで `pnpm dev:web` を起動します。ローカル環境は `owner@example.test` として動作します。本番bundleにはこのテスト認証を含めません。

## CLI

```sh
pnpm linc --workspace development team list
pnpm linc --workspace development issue create --team DEV --title '最初のチケット'
pnpm linc --workspace development issue get DEV-1
pnpm linc --workspace development issue update DEV-1 --title '更新したチケット'
pnpm linc --workspace development --json issue list
```

`--workspace` は作成したワークスペースのslugまたはID、`--team` は実際のチームキーに置き換えてください。接続先は `--url`、`LINC_URL`、最後にログインしたURLの順に選びます。ログイン先がなければ `http://localhost:8787` を使用します。利用できる操作は `pnpm linc --help` で確認します。 ローカルビルドを任意のディレクトリから使う場合は、PATH内にある `~/.local/bin` などから実行ファイルへリンクできます。

```sh
mkdir -p ~/.local/bin
ln -s "$PWD/dist/cli/linc.mjs" ~/.local/bin/linc
linc --help
```

連続操作には `linc --workspace <slug-or-id> batch < commands.jsonl` を使えます。1行につきコマンド引数のJSON配列を渡し、順番に実行します。[batchの使用例と性能の比較方法](docs/cli-performance.md)を参照してください。

`issue list` は既定で未完了のチケットを表示します。完了・キャンセル済みも含める場合は `--all`、完了・キャンセル済みだけなら `--closed` を指定します。`--state`、`--archived`、`--deleted` を指定すると、その条件に合う一覧を取得します。

1ページに収まる一覧は `$XDG_CACHE_HOME/linc/issue-lists`、未設定なら `~/.cache/linc/issue-lists` に保存します。毎回サーバーへ認証付きで確認し、変更がない場合だけ保存済みデータを使います。通信や認証が失敗した場合、古い一覧を表示せずエラーを返します。

## CloudflareとLinearからの移行

本番の配置先は `https://linc.kazumasa.workers.dev`。利用する本人をCloudflare Accessで確認し、Linc内の所属でデータへのアクセスを制限します。

[デプロイとログイン](docs/deployment.md)、[Linearからのインポート](docs/import.md) に操作手順があります。移行は元のLinearデータを変更しません。

## 検証

```sh
pnpm exec playwright install chromium
pnpm check
pnpm test:hooks
pnpm test:e2e
```

API・CLI・ブラウザーテストは、実際のWorker runtimeとSQLite/R2を使います。テストごとに一時ディレクトリへデータを隔離し、終了後に削除します。負荷テストは100件の同時登録・更新・再送と、1件への100件の競合更新を確認します。

pre-commitは変更ファイルのformatter/linterと全体の型検査を実行します。ファイル長・関数長・複雑度・モジュールの依存方向をlintで制限します。CIはこれにビルド、API/CLI、ブラウザー、負荷試験を加えます。

## 構成

- `apps/worker`: 本人確認、HTTP、権限、永続化、チケット・組織管理
- `apps/web`: Reactの画面とブラウザー内の状態
- `apps/cli`: CLI引数・認証・表示
- `packages/contracts`: HTTP入出力の型と検証
- `packages/client`: WebとCLIで共有するHTTPクライアント
- `packages/linear-import`: Linearの取得・移行・照合
- `tests`: 利用者が触る入口からの実動作検証

設計と受入条件は [docs/architecture.md](docs/architecture.md)、[docs/modules.md](docs/modules.md)、[docs/verification.md](docs/verification.md) にあります。実装・移行・本番検証の進捗は [docs/development-status.md](docs/development-status.md) を参照してください。

認証済みの既存 `linear` CLIがあれば、本文や認証情報を出力せずにチケットの集計を再実行できます。

```sh
node scripts/inspect-linear.mjs --workspace '<workspace-slug>'
```

調査の根拠は [docs/research.md](docs/research.md)、構成案の比較は [docs/design-comparison.md](docs/design-comparison.md)、判断の記録は [docs/decisions.tsv](docs/decisions.tsv) に残しています。
