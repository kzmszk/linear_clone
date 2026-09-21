# 構成案の比較と統合

architect/arenaの手順で3つの独立した設計案を作り、全案を読んで比較した。
候補はGPT-6 Astra xhigh、GPT-5.6 Sol xhigh、GPT-5.6 Terra xhigh。
別のGPT-5.6 Sol xhighが候補完成後に採点した。
利用可能なモデルはすべてGPT系列であり、異なる提供元のモデルによる検証とは呼ばない。

## 候補

| 案        | 構成                                                              | 利点                                                       | 採用しなかった部分                                        |
| --------- | ----------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| A / Astra | 1インストール1SQLite DO、Access、WebSocket、R2                    | 認可・書込・通知順序を同じ所有者に置く。原本・復元まで扱う | 1つのstoreへ全機能を集めるmodule mapは機能別に分解        |
| B / Sol   | 1インストール1SQLite DO、自前passkeyとdevice login、WebSocket、R2 | 明確なcommand/receipt、1件への100競合テスト                | 独自認証と回復フロー、16.7msという厳しすぎる一律描画条件  |
| C / Terra | workspace別SQLite DOとregistry、自前passkey、15秒poll、R2         | field競合、reload後のcommand再送、移行前の容量計画         | Object間の整合性、field版管理、通常15秒の他セッション反映 |

D1 + WorkerとLinux常駐APIも各案の代替案として検討した。
これらの案でアプリを実装したり、性能を競わせたりはしていない。
比較対象はデータ構造、責任分担、失敗時の規則、検証可能性である。

## 独立採点

5点満点。これは設計レビューの採点であり、テスト結果ではない。

| 評価軸                       |   A |   B |   C |
| ---------------------------- | --: | --: | --: |
| 更新の原子性・競合・権限     |   5 |   5 |   4 |
| UI反応と他セッションへの反映 |   5 |   5 |   3 |
| 移行内容と再開・照合         |   5 |   4 |   4 |
| 保守・境界・運用             |   4 |   4 |   3 |
| Cloudflareの制約との適合     |   5 |   4 |   5 |
| 合計                         |  24 |  22 |  19 |

独立reviewerはAを推奨した。親agentもAを採用した。
ただしAの5点は「正しさが証明された」という意味には採用しない。
実際のDDL、認証、importの照合、runtimeでの100同時処理は未検証だからである。

## 最終設計への取り込み

- Aの同一DBでの更新・所属管理・通知順序を基礎にする。
- Bの1チケットへの100競合試験と、共有schemaによるWeb/CLIの契約を取り込む。
- Cの送信済みcommandのreload後再送を取り込む。汎用offline編集は追加しない。
- Cの移行前の容量・欠損確認と、R2ファイルのpending/ready/missing管理を取り込む。
- Aの大きなstoreを、issues、organization、imports、changes、filesの責任へ分解する。
- 再送receiptに本文全体を永久複製せず、不変の小さなreceiptと現在のentityを分ける。
- 全案の曖昧な「Linear並み」を、比較条件と未検証扱いを含む測定仕様へ置き換える。

## レビューで残った事項

| 指摘                                       | 設計への反映と実装時の証明                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| composite FKの親キーと有効化が曖昧         | schema実装で対応するUNIQUE/FKを置き、実runtimeで不正参照の拒否を確認                 |
| private teamの権限が曖昧                   | list/detail/file/changes/receiptで同じ閲覧判定を使う                                 |
| R2とDBの二重書き込み失敗                   | pending状態・hash照合・orphan報告を追加                                              |
| 変更し続けるLinearはsnapshotにならない     | exportのwatermarkと最終切替の静止期間を明記                                          |
| runIdをsource mappingに含めると別runで重複 | sourceWorkspaceId/kind/sourceIdを永続キーにする                                      |
| project-teamとnested paginationの適用順序  | metadataの適用後にissue、各connectionの完了状態をmanifestへ記録                      |
| 無料枠・Access・R2契約・復元               | 対象アカウントでの確認と実復元をリリース条件にする                                   |
| チケット以外のversionとreceiptが未定義     | 変更可能なレコードのversion、集合を所有する親、共通結果型とmutation境界の責任を定義  |
| 最初の管理者とworkspaceの作成権限が未定義  | 指定メールの本人だけが一度bootstrapでき、以後はinstallation adminがworkspaceを作成   |
| rich text原本・移行履歴の保存先が未定義    | source_records/private R2とimported_activity、activity API、原本hashと履歴照合を追加 |
| 管理・削除復元・失敗画面の視覚確認が不足   | 画面別の比較対象とキーボード確認を追加                                               |

これらは文書へ書いただけでは解決済みにならない。
実装時に [verification.md](verification.md) の試験で確認する。

最終文書の独立再確認では、元の3件の契約不足が設計上解消されたと判定された。
追加の指摘だったinstallation操作のreceipt.sequenceは、インストール共通の変更番号として定義した。
これもruntime検証の代わりにはならない。
