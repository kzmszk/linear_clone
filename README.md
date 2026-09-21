# linear_clone

3〜5人のチーム向けに、Linearのチケットを引き継げるWeb UIとCLIを作るプロジェクト。
Cloudflare Workers、SQLite Durable Object、R2を使う設計。

現在は調査・設計段階。Webアプリと `linc` CLIはまだ実装していない。

- [調査結果](docs/research.md)
- [採用アーキテクチャ](docs/architecture.md)
- [データとモジュールの契約](docs/modules.md)
- [検証条件](docs/verification.md)
- [実装順序](docs/implementation-plan.md)
- [構成案の比較](docs/design-comparison.md)
- [判断記録](docs/decisions.tsv)

認証済みの `linear` CLIがあれば、既存チケットの集計を再実行できる。
本文や認証情報は出力しない。

```sh
node scripts/inspect-linear.mjs --workspace '<workspace-slug>'
```
