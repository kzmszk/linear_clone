# コード品質の計測と改善

FUCHIKOMA-24 の対象は、人が読んで修正しやすいコードです。AIが書いたかどうかを推定する点数は使いません。複雑度だけでは重複した仕様、不要な抽象化、間違ったデータ構造を判定できないため、静的計測と実際の呼び出し関係のレビューを組み合わせます。

## 再計測

```sh
pnpm quality
```

結果は `artifacts/private/quality/current/` に出力します。`quality:complexity` は計測用に閾値0で全ての非ゼロ関数を報告します。この0は改善目標ではありません。通常のコードチェックは引き続き `pnpm check`、ブラウザ操作は `pnpm test:e2e` です。

| 対象                     | ツールと設定                         | 判定方法                                                                                   |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------ |
| 理解に必要な分岐・入れ子 | SonarJS Cognitive Complexity         | 標準目安の関数15超をレビュー。閾値以下でも責任や状態の持ち方を確認                         |
| 分岐数・関数行数         | ESLint計測、既存Oxlintチェック       | 既存の循環的複雑度12、関数80行、ファイル350行、深さ4を維持。数値のための機械的分割をしない |
| トークン重複             | jscpd、5行以上・50トークン以上、mild | 各候補を読む。同じ業務ルールだけ統合し、似たHTTP配線や独立したUIまで汎用化しない           |
| 未使用コード             | Knip                                 | 実行入口を正しく設定してから、利用のない宣言や公開不要のexportを削除                       |

複雑度の対象は `apps/*/src/` と `packages/*/src/` のTypeScript/TSXです。テスト、計測スクリプト、CSS、生成物を製品コードの分母へ混ぜません。jscpdも同じ製品領域を対象にしますが、トークンのないファイル等でファイル数は一致しません。行数は物理行で、Oxlintの空行・コメントを除いた上限とは区別します。

Knipは本番WorkerだけでなくローカルWorker、Web、CLI、テスト、手動実行スクリプトを入口にします。Webと本番Workerの入口はVite/Wrangler設定から自動検出します。`@cloudflare/workers-types` はtsconfigの型依存として検出されます。`cloudflare:workers` は実行環境のモジュール、`linear` と `cloudflared` は別途導入するCLIなので、npm依存の欠落として扱いません。未使用判定を隠すためのファイル除外はありません。

## 根拠と限界

2020年の実証研究は、427コード片・約24,000件の理解度評価を集約し、Cognitive Complexityと理解時間・主観評価の相関を報告しています。一方、理解の正確さとの結果は一様ではありません。[Muñoz Barón et al., ESEM 2020](https://arxiv.org/abs/2007.12520)

216人の開発者によるJavaコードの評価では、複雑度は理解しやすさの限定的な予測指標で、問題の重大さの指標ではありませんでした。Javaの研究結果を、このTypeScriptアプリの品質保証へそのまま一般化しません。[Esposito et al.](https://arxiv.org/abs/2303.07722)

Cognitive Complexityの関数15という目安はSonarの実用上の既定値であり、安全性や正しさの証明ではありません。[Sonarの閾値の説明](https://community.sonarsource.com/t/s3776-reason-for-the-current-default-value-of-15/127103)

重複検出と未使用コード検出の仕様は、それぞれの公式資料に従います。[jscpd](https://github.com/kucherenko/jscpd)、[Knip](https://knip.dev/explanations/how-knip-works)

## 初回計測

改修前の製品ソースはコミット `ce03d53`。計測ツールは固定バージョンで `pnpm-lock.yaml` に記録します。比較用の結果は `reports/quality/before/` に保存します。jscpdの報告からコード断片を除き、絶対パスをリポジトリ相対へ直して保存しています。検出条件と数値は変更していません。

- TypeScript/TSX: 147ファイル、19,500物理行。
- Cognitive Complexity: 最大15、15超は0関数。
- jscpd: 32重複、重複行358、重複率1.84%。
- Knip: 公開先で使われない値export 41件、型export 25件。これは全てが未使用の実装という意味ではなく、同一ファイル内だけで使う宣言も含みます。

### 複雑度上位でも分割しない関数

| 関数                                                | 初回の値 | 判断                                                                       |
| --------------------------------------------------- | -------: | -------------------------------------------------------------------------- |
| `destination-metadata.ts` の `compareMetadata`      |       15 | メタデータ照合の走査と不一致収集は同じ責任。閾値内なので分割しない         |
| `App.tsx` の `App`                                  |       14 | 認証・初期化・通常画面の表示条件。数値だけを理由に画面遷移の層を追加しない |
| `apply.ts` の `applyImport`                         |       13 | チェックポイント付きの適用順序を維持                                       |
| `destination-children.ts` の `compareIssueChildren` |       13 | コメント・履歴の照合本体と転送関数を維持。今回の変更対象から外す           |

### 採用する構造変更

| 問題                                                     | 維持案との比較                                         | 選択                                                          |
| -------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| 呼び出しのない補助関数・不要なexport                     | 維持しても現行動作に寄与せず、読むべきAPIを増やす      | 宣言の削除、同一ファイル内で必要なものは非公開化              |
| 設定編集の26個のpropsと、4種類で共有する無関係な入力状態 | 平坦な状態のままではteam編集にmemberのrole等も保持する | `kind`ごとの編集draftへ変更し、その種類に必要な入力だけを持つ |
| インポート要求の型と検証schemaがCLI側・Worker側に重複    | 別々の定義はfile属性などでずれる                       | 既存のcontracts層に要求schemaを置き、両者が型を導出する       |

ワークスペースとissueのmutationをファイル分割する案は、今回の主要な問題ではないため保留します。HTTPルートや設定パネルの似た配線を汎用レジストリへ置換する案も、追跡箇所が増えるため採用しません。必要な差異を重複率のために消しません。

## 改修後

| 指標                            |   改修前 |   改修後 |
| ------------------------------- | -------: | -------: |
| TypeScript/TSXファイル          |      147 |      148 |
| 物理行                          |   19,500 |   19,320 |
| Cognitive Complexity最大 / 15超 |   15 / 0 |   15 / 0 |
| 循環的複雑度最大 / 12超         |   12 / 0 |   12 / 0 |
| 関数行数最大 / 80超             |   79 / 0 |   79 / 0 |
| 未使用の値export / 型export     |  41 / 25 |    0 / 0 |
| 重複箇所 / 重複行               | 32 / 358 | 32 / 358 |
| jscpdの行重複率                 |    1.84% |    1.86% |

重複行が変わらず全体の行数が減ったため、重複率はわずかに上がりました。今回統合したインポート型・schemaの重複は、5行・50トークンという検出条件で全てが捕捉されるわけではありません。検出されたHTTP処理や表示配線の類似を消すための共通フレームワークは導入していません。

実際に使われない補助関数9個とschema変数2個、未使用の型を削除しました。ファイル内で必要な宣言は残し、外部で使わないexportだけを外しています。

設定画面の編集状態は `EditDraft` にまとめました。workspace・team・project・memberの種類ごとに必要な入力と元データを持ち、更新時のversionもそこから取得します。`EditResourceDialog` の引数は26個から8個になりました。新規作成の状態は今回変更していません。

インポート要求のschemaと型は `packages/contracts/src/import.ts` に集約しました。CLIの移行処理とWorkerが同じ定義を使います。添付メタデータも境界で検証し、不正なサイズ等は取り込み開始前に400で拒否します。これは入力検証の変更を含みます。

検証はformat、lint、全アプリとE2Eのtypecheck、Web/CLI/Workerビルド、実Worker・CLIの18テスト、Chromiumの30テストに成功しました。追加テストは、不正な添付メタデータでimport runが作られないことと、プロジェクト編集の通信失敗後に入力を保ち、再試行・再読込後にも保存内容が残ることを確認します。既存の100件同時作成・更新・再送・競合テストも成功しています。

### 比較の再現方法

この変更に含まれる固定依存と計測スクリプトを両方のソースに適用します。初回のツール導入コミット `b09c6e8` の `pnpm quality` は比較用JSONの正規化まで含んでいなかったため、保存した改修前レポートも以下の方法で再生成しています。

```sh
quality_root="$PWD"
quality_baseline=$(mktemp -d)
git archive ce03d53 | tar -x -C "$quality_baseline"
cp package.json pnpm-lock.yaml knip.json .jscpd.json "$quality_baseline/"
cp scripts/quality-metrics.mjs scripts/check-code-quality.mjs "$quality_baseline/scripts/"
cd "$quality_baseline"
pnpm install --frozen-lockfile --ignore-scripts
node scripts/check-code-quality.mjs "$quality_root/artifacts/private/quality/baseline-rerun"
# 改修前は未使用exportがあるため、全レポートを保存したうえで終了コード1になります。
cd "$quality_root"
pnpm quality
```

`summary.json`、`unused.json`、`jscpd-report.json` を `reports/quality/before/` と `after/` に保存しています。jscpdの実行日時・コード断片・絶対パスは比較から除きます。関数ごとの全件リスト `complexity.json` は実行時に生成し、コミットには上位関数・最大値・閾値超過一覧を含むsummaryを残します。
