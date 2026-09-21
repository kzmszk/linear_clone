# 実装の順序

まずデータの整合性を実Workerで証明し、その上にCLIとWebを載せる。
製品完成の判定は [verification.md](verification.md) に従う。
現在は段階0の調査・設計まで。段階1以降は未実施。

個人・小チームでの利用に合わせ、まれな非破壊的エラーは手動再試行で対応する。
初期案の永続ブラウザーcommand queueと、稼働中のLinearを追跡する移行処理は取りやめる。
画面を開いている間のdraft保持と、元データの編集を一時停止する移行手順で十分とする。

## 今回の設計手順

Poteto ModeのPrinciplesを読み、以下の順で進める。

1. Phase A: Frame。要件、既存データ、品質設定、Cloudflareの制約を調べる。
2. Phase B: Design the workflow。3案を比較し、データ所有者と責任分担を決める。
3. Phase C: Run the loop。各段階の実物を検証してから次へ進む。
4. Phase D: Keep the audit trail。判断と根拠をdecision logへ追記する。
5. Phase E: Verify and hand back。完成条件と結果を照合する。

architectのGround、Sketch、Agree、Implement、Scrapに対応する。
Agreeは今回の調査・設計成果物を提示する区切りとする。逐一の実装承認は要求しない。
arenaではFrame、Fan out、Cross-judge、Pick、Graft、Verifyを使う。
候補の比較結果は [design-comparison.md](design-comparison.md) に記録する。

## 規模と実行方針

概算は9段階、Webの主な画面群6つ、サーバーの責任領域6つ、3つの共有package。
管理画面、認可、インポート、障害回復まで含むため、一度の雛形生成で完了する作業ではない。
見積もりの単位は下記の検証可能な段階とし、未計測の時間を納期として約束しない。

段階2の時点で100件同時処理の時間・CPU・書き込み行数を確認する。
この確認が通らなければUIの作り込みへ進まず、設計を見直す。
段階5では移行の不足項目・件数・ファイル容量を確認する。
段階6ではLinearとの操作速度差を確認する。
これを工数が増える前の判断点にする。

契約が固まるまでは1人が共有contractsとmigrationを所有する。
その後、CLI、Web、import adapterは独立したworktreeで並行実装できる。
同じschemaやlockfileを複数のagentが同時に編集しない。
各delegateの結果は統合側が差分と実動作を読み直す。

## 段階ごとの成果物

| 段階 | 実装内容                                                                                    | 次へ進む条件                                                                      | commitの単位                             |
| ---- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------- |
| 0    | 要件・調査・構成比較・モジュール契約・検証条件                                              | 出典、実データ集計、候補比較を再確認                                              | 調査スクリプトと設計                     |
| 1    | pnpm workspace、oxlint/oxfmt/strict TS、Husky、Worker+Web+CLIの最小起動、E2E実行入口        | format/lint/typecheck/build、実起動smoke、hookの成功と拒否                        | 開発基盤                                 |
| 2    | SQLite schema、mutation境界、採番、version、receipt、変更記録                               | 実runtimeで100 create/update/replay、競合、再起動後の照合                         | 永続化と同時更新                         |
| 3    | Access検証、bootstrap、招待、workspace/team/project/member、private team、CLIのauthと管理   | E11/E12/E13、未認証・異workspace・private team拒否、所属解除、最後のowner保護     | 認証・組織管理                           |
| 4    | チケットCRUD、filter、label、comment、parent/relation、CLI                                  | CLIとHTTPの全往復、nullableフィールドと失敗終了コード                             | チケットAPIとCLI                         |
| 5    | Linear export/plan/apply/verify、原本・履歴保持、identity mapping、R2コピー、backup/restore | archive・本文・rich text・履歴・関係・全nested page・hash照合、中断再開と重複防止 | 原本export、移行適用、ファイル保持に分割 |
| 6    | Linear風shell、一覧、詳細、作成dialog、editor、プロパティ、管理画面                         | E1/E3/E6/E8、UI比較、warm表示p95の計測                                            | 画面単位で動作する増分                   |
| 7    | 楽観的更新、socket通知、再接続、削除復元、画面内draft保持                                   | 2セッションE2E、競合・通信失敗・古い応答の試験                                    | 同期と通信失敗への対応                   |
| 8    | Cloudflare検証環境、実import照合、100件負荷、Linear比較、復旧手順                           | 全受入結果の証拠と未検証項目を明示                                                | 測定とリリース準備                       |

各行は必ず1commitに押し込むという意味ではない。
責任がまとまり、関連する振る舞いを検証できた時点で小さくcommitする。
DBの破壊的変更や本番公開を途中の「動作確認」に混ぜない。
公開・実アカウントの設定・本番移行が必要な時点で、具体的な対象と変更を提示する。

## 実装前に分かった境界

ソフトウェアの設計を止める未回答事項はない。React/TypeScriptとCloudflare中心の構成で進められる。
実アカウントを使う次の検証は、該当段階で対象を確定する。

- Cloudflareのhostname、Accessの認証方法、許可するメンバー、R2利用設定。
- 書き込みレイテンシを比較するLinear側の使い捨てチケット。
- 実移行の対象team/project、identity mapping、sourceの最終更新を止める切替タイミング。

Sourceの閲覧範囲が不足する場合、移行可能な範囲を報告する。
外部条件が未確定でも、ローカルruntimeでの開発・合成データE2E・CLI検証は進める。
Cloudflare上での性能や本物のAccess認証だけは、ローカル結果で代替しない。
