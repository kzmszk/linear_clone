# 開発中の検証記録

2026-09-22。ローカルでWeb・CLI・インポートの受入動作を確認済みです。ローカル結果をCloudflareの性能やLinearとの速度同等性とは扱いません。

| 項目                                                | 状態                 | 実行と結果                                                                                                                                              |
| --------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WorkerのチケットCRUD、Markdown保持、削除・復元      | VERIFIED             | `node --test tests/api.test.mjs`                                                                                                                        |
| 権限、招待、private team、最後のowner保護           | VERIFIED             | 同APIテストの対象シナリオが成功                                                                                                                         |
| 非公開R2のアップロード・読み取り・権限              | VERIFIED             | 同APIテストで本文bytesとアクセス拒否を確認                                                                                                              |
| 一覧のページング                                    | VERIFIED             | 405件を3ページで取得、重複・欠落0件                                                                                                                     |
| 100件同時登録・更新・再送                           | VERIFIED（ローカル） | `node --test tests/load.test.mjs`。100 create/100 update/100 replay。1件への100更新は1成功・99競合                                                      |
| Access JWTの署名・有効期限・audience検査            | VERIFIED（ローカル） | `node --test tests/auth.test.mjs`。実署名とJWKS HTTPサーバーを使用                                                                                      |
| CLIのチケットCRUD、プロジェクト更新、競合終了コード | VERIFIED             | `node --test tests/cli.test.mjs`。ビルド済みCLIをsubprocessとして実行                                                                                   |
| Webの登録・本文編集・コメント・添付・reload・削除   | VERIFIED             | `pnpm test:e2e`。Chromiumから実APIを使用                                                                                                                |
| キーボードで作成画面を開く                          | VERIFIED             | APIを500ms遅延させても作成画面が開くことを確認                                                                                                          |
| 本番bundleからテスト認証を除外                      | VERIFIED             | Wrangler dry-runと `scripts/check-production-bundle.mjs`                                                                                                |
| pre-commitが型エラーを拒否                          | VERIFIED             | `pnpm test:hooks`。使い捨てgit repoで正常commitと拒否を確認                                                                                             |
| Webの管理操作、2画面同期、実際の競合時のdraft保持   | VERIFIED             | Chromium E2E 29件成功。通知反映2秒以内、実APIの409で他者の本文を保持                                                                                    |
| Linear実データの移行・添付照合                      | VERIFIED（ローカル） | 2,428レコード、289チケット、添付6ファイル13,589,221 bytes。正規化内容・SHA256・サイズを照合し差分0                                                      |
| Cloudflare本番での基本操作                          | VERIFIED             | 認証済みChromiumで作成、タイトル更新、コメント、削除キャンセル、削除、再読込、ごみ箱検索、復元、再読込の9項目に成功。検証用チケットは最後にごみ箱へ移動 |
| Cloudflare本番での100件負荷                         | NOT VERIFIED         | 100件同時処理の検証はローカルWorkerのみ                                                                                                                 |
| Linearとの同条件の操作レイテンシ比較                | NOT VERIFIED         | 本番チケットへの書き込み比較は未実施                                                                                                                    |
| 独自のbackup/restoreコマンド                        | 対象外               | 今回は未実装。元のLinearエクスポートは非公開のローカル領域に保存                                                                                        |

見つかった問題は、期待する利用結果をチェックするテストで確認してから修正しています。タイトルだけのPATCHで既存本文を消す問題は、作成用のdefault値を更新用の入力から分離して修正しました。一覧が201件で打ち切られる問題は、権限フィルターとページ境界をSQLで適用する方式に変更しました。

最終チェック: `pnpm check` 成功（format、lint、全アプリのtypecheck、Web/CLI/Workerビルド、17実動作テスト）。`pnpm test:e2e` は29件成功。`pnpm test:hooks` は正常commitの受理と型エラーの拒否に成功。

100 create・100 update・100 replay・100競合要求（1成功99競合）と保存後の読取検証はローカルで1,267msでした。この全体時間を個別要求のp95やCloudflareでの所要時間としては扱いません。

本番バージョンは `3f4d0d26-f82f-4e66-b966-0dafbc0d7195`。実データの移行照合はローカルWorkerで実施し、本番にはまだ投入していません。確認の集計は `reports/real-import-summary.json`、合成データの画面は `reports/screenshots/` にあります。

## 2026-09-22 UI修正

`linc manual test` の指摘をもとに、削除確認をアプリ内ダイアログへ変更し、ごみ箱からの復元導線を追加しました。詳細画面は一覧を置き換える表示にし、長い識別子とタイトルの重なり、チーム未作成時の案内、必須項目の表示、コメント送信中の表示を修正しました。実装コミットは `126b263` と `e3d6ef5` です。

本家Linearの一覧・詳細・作成・選択メニュー・各管理画面を読み取りで確認しました。比較結果と意図した差異は [ui-comparison.md](ui-comparison.md) に記録しています。作成ダイアログのCSS競合とメニューの見切れは、デスクトップと狭い画面の表示をE2Eで確認しています。

29件のブラウザテストは、基本CRUDに加え、削除のキャンセル・失敗・待機中・復元、通信失敗時の入力保持、コメントの即時表示と再試行、URL直アクセス・戻る・進む、IME変換、管理画面、2画面同期、レスポンシブ表示を対象にします。通常の成功操作は実WorkerとSQLite Durable Objectを使い、遅延・失敗だけを通信側で注入しています。

本番の9項目は `reports/production-ui-verification.json` に記録しています。ユーザーの既存チケットは変更していません。Linearと同条件のp95比較と本番100件負荷は未測定です。

## 2026-09-22 コード品質の計測と整理

FUCHIKOMA-24で計測ツールを追加し、未使用宣言、設定画面の編集状態、CLIとWorkerのインポート定義を整理しました。実装は `e53e0a9`。未使用exportの指摘は66件から0件、製品コードは19,500行から19,320行になりました。重複検出32件と複雑度の最大値は変わっていません。

この変更ではformat・lint・typecheck・build・実Worker/CLIの18テスト・ブラウザ30テストに成功しています。比較方法と判断は [code-quality.md](code-quality.md)、改修前後の数値と検証結果は `reports/quality/` に記録しています。以前の本番UI検証9項目はその時点の結果です。本番バージョン `77a1180f-a03c-496b-8b88-58d50a830232` でCLI読取とWebのプロジェクト編集画面の表示・キャンセルを確認しました。結果は `reports/quality/verification.json` に記録しています。

## 2026-09-22 性能改善に備えた振る舞いテストの強化

実Worker・ビルド済みCLIのテストを18件から31件、ブラウザE2Eを30件から31件へ増やしました。再起動後の保存・再送、検索の複合条件、アーカイブとごみ箱、権限、同時更新、CLIのコメント操作とプロジェクト移動、WebSocket再接続を対象にしています。既存APIテストは保存領域を各テストで分離し、拒否のstatusとerror codeを明示しました。

追加テストでCLIのコメント更新・削除の不具合を検出しました。CLIが更新前に使うコメント単体のGETがWorkerに未実装でした。権限とissue所属を確認する取得処理を追加し、変更用のIdempotency-Keyなしで読めるようにしました。修正は `743fbb9`、テスト強化は `ddf9c69` です。

`pnpm check`、最終のformat・lint・typecheck、31件のE2Eが成功しました。APIの9テストは個別実行でも成功し、再接続E2Eは3回連続で成功しています。再接続試験は実WorkerとのWebSocketを切断し、別クライアントが更新した本文を再接続後に取得できることを確認します。通信切断の注入と別ユーザー役のHTTPクライアントを分離し、テストの自動再試行は追加していません。

本番バージョン `29cebc45-90b9-4193-b6da-3c8ad3ac146d` でコメント取得が200となり、一覧の内容と一致することを読み取りで確認しました。結果は `reports/test-hardening-verification.json` に記録しています。

ローカル100 create・100 update・100 replay・100競合要求と保存結果の確認は1,256msでした。性能改善はまだ行っていません。行・分岐の網羅率も未計測です。保証する振る舞いと残る範囲は [test-coverage.md](test-coverage.md) に記録しています。

## 2026-09-22 CLI性能改善

FUCHIKOMA-25でCLIの参照取得、起動時の依存読込、更新前の読み取りを改善し、連続操作向けの `linc batch` を追加しました。実装は `e7dc1b0`、`6a901f6`、`9a02527`、`7a84756` です。

本番62操作の5回比較では中央値24.349秒から9.868秒、中央値の比2.47倍でした。3倍目標は未達で、チケットは作業中です。単発操作は別に20回比較し、workspace UUID指定の取得・一覧は1.27〜1.30倍、slug指定では1.05〜1.06倍でした。途中の最良値を最終成果物の性能として扱いません。

`pnpm check`、41件の実Worker・API・CLIテスト、31件のブラウザE2E、コード品質検査が成功しました。認可・競合・不正参照の拒否と保存結果を維持しています。手元の `linc` は計測した最終成果物と同じhashです。Workerは変更していません。詳細な条件・試行値・残る課題は [CLI性能比較](../reports/cli-performance/README.md)、利用方法は [batchの手順](cli-performance.md)にあります。
