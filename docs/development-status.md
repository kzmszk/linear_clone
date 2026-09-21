# 開発中の検証記録

2026-09-22。ローカルでWeb・CLI・インポートの受入動作を確認済みです。ローカル結果をCloudflareの性能やLinearとの速度同等性とは扱いません。

| 項目                                                | 状態                 | 実行と結果                                                                                         |
| --------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| WorkerのチケットCRUD、Markdown保持、削除・復元      | VERIFIED             | `node --test tests/api.test.mjs`                                                                   |
| 権限、招待、private team、最後のowner保護           | VERIFIED             | 同APIテストの対象シナリオが成功                                                                    |
| 非公開R2のアップロード・読み取り・権限              | VERIFIED             | 同APIテストで本文bytesとアクセス拒否を確認                                                         |
| 一覧のページング                                    | VERIFIED             | 405件を3ページで取得、重複・欠落0件                                                                |
| 100件同時登録・更新・再送                           | VERIFIED（ローカル） | `node --test tests/load.test.mjs`。100 create/100 update/100 replay。1件への100更新は1成功・99競合 |
| Access JWTの署名・有効期限・audience検査            | VERIFIED（ローカル） | `node --test tests/auth.test.mjs`。実署名とJWKS HTTPサーバーを使用                                 |
| CLIのチケットCRUD、プロジェクト更新、競合終了コード | VERIFIED             | `node --test tests/cli.test.mjs`。ビルド済みCLIをsubprocessとして実行                              |
| Webの登録・本文編集・コメント・添付・reload・削除   | VERIFIED             | `pnpm test:e2e`。Chromiumから実APIを使用                                                           |
| キーボードで作成画面を開く                          | VERIFIED             | APIを500ms遅延させても作成画面が開くことを確認                                                     |
| 本番bundleからテスト認証を除外                      | VERIFIED             | Wrangler dry-runと `scripts/check-production-bundle.mjs`                                           |
| pre-commitが型エラーを拒否                          | VERIFIED             | `pnpm test:hooks`。使い捨てgit repoで正常commitと拒否を確認                                        |
| Webの管理操作、2画面同期、実際の競合時のdraft保持   | VERIFIED             | Chromium E2E 4件成功。通知反映2秒以内、実APIの409で他者の本文を保持                                |
| Linear実データの移行・添付照合                      | VERIFIED（ローカル） | 2,428レコード、289チケット、添付6ファイル13,589,221 bytes。正規化内容・SHA256・サイズを照合し差分0 |
| Cloudflareでの本番利用・100件負荷                   | NOT VERIFIED         | デプロイ済み。未認証Web/APIの302を確認。メールコードによる本人ログイン待ち                         |
| Linearとの同条件の操作レイテンシ比較                | NOT VERIFIED         | 本番チケットへの書き込み比較は未実施                                                               |
| 独自のbackup/restoreコマンド                        | 対象外               | 今回は未実装。元のLinearエクスポートは非公開のローカル領域に保存                                   |

見つかった問題は、期待する利用結果をチェックするテストで確認してから修正しています。タイトルだけのPATCHで既存本文を消す問題は、作成用のdefault値を更新用の入力から分離して修正しました。一覧が201件で打ち切られる問題は、権限フィルターとページ境界をSQLで適用する方式に変更しました。

最終チェック: `pnpm check` 成功（format、lint、全アプリのtypecheck、Web/CLI/Workerビルド、16実動作テスト）。`pnpm test:e2e` は4件成功。`pnpm test:hooks` は正常commitの受理と型エラーの拒否に成功。

100 create・100 update・100 replay・100競合要求（1成功99競合）と保存後の読取検証はローカルで1,259msでした。この全体時間を個別要求のp95やCloudflareでの所要時間としては扱いません。

本番バージョンは `97666caf-0c22-4a81-9c0b-cbf99717d7d5`。実データの移行照合はローカルWorkerで実施し、本番にはまだ投入していません。確認の集計は `reports/real-import-summary.json`、合成データの画面は `reports/screenshots/` にあります。
