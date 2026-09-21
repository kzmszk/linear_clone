# 調査結果

調査日: 2026-09-22 JST。製品の性能測定と本番デプロイはまだ実施していない。

## 既存リポジトリ

対象は `kzmszk/linear_clone`。調査開始時のコミットは `a005269` で、製品コードはない。
既存の未追跡スキル、CLI設定、packageファイルはユーザーの作業として保持する。
ユーザーの指定により `aha-setup` の手順、AHA連携、Beads導入は適用しない。

品質設定の参照先はローカルの `/home/kazu/work/gis`。
Git remote は `git@github.com:kzmszk/gis.git`、確認したHEADは
`4356d6b80424728d9447b38058f2792656eae635`。
依頼にある `kzms/gis` はこのチェックアウトを指すものとして扱う。

| 対象            | gisで確認した設定                  | この製品への適用                              |
| --------------- | ---------------------------------- | --------------------------------------------- |
| package manager | pnpm 11.16.0                       | pnpmを固定し、単一のlockfileを管理            |
| lint            | oxlint ^1.76.0、`--deny-warnings`  | 同じツールと警告拒否、WebとWorkerの環境を分離 |
| format          | oxfmt ^0.61.0                      | singleQuote、trailingComma all、printWidth 80 |
| 型検査          | TypeScript strict、`tsc --noEmit`  | contracts、Web、Worker、CLIごとに検査         |
| pre-commit      | Husky 9、lint-staged 17、typecheck | 変更ファイルのformat/lintと全体の型検査       |
| 実動作テスト    | build後に `node --test`            | CLI/APIの実動作テストに継承、WebはPlaywright  |

gisのBeads用hookとgis固有のslopコマンドは品質ツールそのものではないため移植しない。
参照先のNodeNext設定はCLI向けであり、そのままWebへ適用しない。
フロントエンドとWorkerは各ビルド環境に合うmoduleResolutionを設定する。

## Linearの実データ

認証済み `linear 2.6.0` で読み取り専用GraphQLを実行した。
`issues(includeArchived: true)` を最後までページ送りし、IDの重複がないことを確認した。
本文そのもの、認証情報、ユーザーのメールアドレスはこのリポジトリに保存していない。

| 指標                                      |    結果 |
| ----------------------------------------- | ------: |
| 取得可能なチケット                        |     289 |
| うちアーカイブ済み                        |     245 |
| チケットが参照するプロジェクト            |      14 |
| 親チケットを持つチケット                  |     102 |
| コメントが少なくとも1件あるチケット       |     109 |
| 添付メタデータが少なくとも1件あるチケット |      99 |
| 本文にLinearアップロードURLを含むチケット |       5 |
| 本文のUTF-8総バイト数                     | 266,220 |
| 最大本文のUTF-8バイト数                   |   9,632 |

これは現在のAPIキーから見える範囲の調査であり、閲覧できないprivate teamや削除済みデータまで含む証明ではない。
コメント・添付は有無だけを取得したため、109と99は総コメント数・総ファイル数ではない。
14もワークスペースの総プロジェクト数ではない。
画像の総容量とコメント内画像は、完全エクスポート時に調べる。

チームには `Rework`、`Merging`、`Human Review`、`In Review`、`In Progress`、
`Backlog`、`Todo`、`Duplicate`、`Done`、`Canceled` がある。
GraphQL上の `state.type` には `duplicate` も存在する。
ステータス名や種別を固定の3種類へ縮める設計では互換性を失う。

調査を再実行するコマンド:

```sh
node scripts/inspect-linear.mjs --workspace fuchikoma
```

このスクリプトは既存CLIの認証を使い、集計JSONだけを標準出力へ返す。
保存済みの `linear api --paginate` のJSON配列は `--input FILE` で再集計できる。
実行結果は [linear-inventory.json](research/linear-inventory.json) にある。
この調査スクリプトはインポーターではない。

## インポートAPI

LinearのGraphQL APIは本文をMarkdownで返し、アーカイブは明示指定が必要。
HTTP 200でもGraphQL `errors` を確認する必要がある。
今回取得した公開スキーマには `descriptionState`、コメントの `bodyData`、
履歴、親子関係、過去のidentifier、添付メタデータがある。
移行時は要求したフィールドを明記した原本を保存し、未取得の情報まで保存済みとは扱わない。
[Linear GraphQL](https://linear.app/developers/graphql)

各connectionに独立したcursorがある。
Issueのページ送りだけでコメント、履歴、添付の続きを取得したことにはならない。
レート制限時にはレスポンスの制限情報を読み、再開点を維持する。
[Pagination](https://linear.app/developers/pagination)、
[Rate limiting](https://linear.app/developers/rate-limiting)

アップロード済み画像は認証が必要で、別アプリでは自前で保持する必要がある。
外部サイトへのリンク添付と、コピーすべきLinearホストのファイルを分ける。
APIキーを任意の外部URLやリダイレクト先に送信しない。
[File storage authentication](https://linear.app/developers/file-storage-authentication)

## Cloudflareの制約

| サービス               | 確認した無料枠                                                           | 設計上の扱い                          |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------- |
| Workers                | 動的リクエスト10万/日、CPU 10ms/呼び出し                                 | 軽いAPI入口。大きな一括変換を置かない |
| Workers Static Assets  | 静的配信は無料・無制限                                                   | SPAのJS/CSSを配信                     |
| D1                     | 読み取り500万行/日、書き込み10万行/日、1DB 500MB                         | 比較候補                              |
| SQLite Durable Objects | 10万リクエスト/日、13,000 GB-s/日、読み取り500万行/日、書き込み10万行/日 | データの所有者候補                    |
| R2 Standard            | 10GB-month、書き込み100万/月、読み取り1,000万/月                         | private添付とバックアップ             |

出典:
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)、
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)、
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)、
[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)、
[R2 pricing](https://developers.cloudflare.com/r2/pricing/)

SQLite付きDurable Objectsは無料プランでも使える。
同一Object内のSQLを同期トランザクションで実行できる。
D1にもトランザクションとして扱うbatch APIがあるため、D1を「同時更新できない」とは評価しない。
[DO storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)、
[D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/)

Durable Objectsの容量について、公式limitsページの表は1Object 10GBと記載し、FAQは無料プラン1GBと記載している。
この食い違いは未解決。設計容量を500MB以下に抑え、アカウント側の上限をデプロイ前に確認する。
「毎秒1,000リクエスト」というsoft limitも、今回のSQL処理の速度保証ではない。
[DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

無料枠はアカウント内の他アプリと共有される。
仮に5人が1日500回ずつ操作し、1操作で索引を含め10行を書き込む場合は25,000行/日。
これは概算で、インポート・履歴・索引・再試行を含む実測が必要。
無料枠超過時の操作失敗を保存成功として表示しない。
R2の利用開始にはsubscriptionの設定がある。無料利用量があることと、契約設定が不要なことは異なる。
[R2 setup](https://developers.cloudflare.com/r2/get-started/)

## Linear画面の観察

ログイン済みの実画面で、チームの一覧とチケット詳細、プロジェクト概要を確認した。
一覧はステータスとプロジェクトでグループ化され、ID・ステータス・タイトル・ラベル・担当者を同じ行に置く。
選択した行のDOM上の高さは約44 CSS pxだった。画面倍率や表示密度によって再確認する。
詳細は中央のタイトル・本文・活動履歴と、右側のプロパティを分ける。
観察した画面はライトテーマで、狭いviewportでは左ナビゲーションが折りたたまれていた。

この観察から速度の数値は算出していない。
ブラウザー操作ツールの所要時間には通信・自動待機が含まれるため、クリックから描画までのレイテンシには使えない。
作成・更新・削除のLinear側の保存時間は未測定。
