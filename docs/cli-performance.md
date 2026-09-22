# CLIの性能改善と計測方法

FUCHIKOMA-25では、単発コマンドの待ち時間と、複数操作をbatchで行う処理時間を別々に計測しています。最初の改善の基準は `5318b27`、日常操作と一覧キャッシュの改善の基準は `ee24ac0` です。

## 変更した処理

UUIDでworkspaceを指定した操作は、IDを確認するためだけのworkspace一覧取得を省きます。実際の読取・更新ではWorkerが認可します。workspace自体を更新する場合など、現在の版番号が必要な処理は引き続きレコードを読みます。

日常操作ではworkspaceのslugやチケット番号をそのままWorkerへ渡します。一覧のteam・project・state・assigneeの参照もWorkerが解決します。CLIでmetadataが必要な操作は、1コマンド内で取得結果を共有します。非公開teamの可視性、アーカイブ済みprojectの除外、member IDから担当者user IDへの変換を維持します。

CLIの依存ライブラリもビルド時にまとめ、起動時のモジュール読込を減らします。常駐デーモンは使いません。

チケット更新は `expectedVersion` による競合検出を維持します。参照解決の失敗や版の競合では、更新内容を保存しません。一覧キャッシュの版番号で更新確認を省略することはありません。

`linc batch` は1つのプロセスで既存コマンドを順番に実行します。Nodeのfetchがプロセス内でHTTP接続を再利用します。各行に新しいCommandとApiContextを用意するため、引数やmetadataは前の行から引き継ぎません。

起動時の `--workspace` にslugを指定した場合は、batchの開始時に一度だけUUIDへ解決し、各行へ渡します。このworkspace一覧取得の削減もbatchの改善率に含まれます。

## batchを実行する

各行をコマンド引数のJSON配列にします。URLとworkspaceは起動時に指定できます。

```sh
linc --url https://linc.kazumasa.workers.dev --workspace linc batch <<'EOF_COMMANDS'
["project","create","--name","CLI example","--team","FUCHIKOMA"]
["issue","create","--team","FUCHIKOMA","--project","CLI example","--title","Batch example"]
["issue","list","--project","CLI example"]
EOF_COMMANDS
```

この例は実データを作成します。teamとproject名は利用先に合わせて変更してください。ファイルを用意した場合は `linc --workspace linc batch < commands.jsonl` で実行します。

各成功操作の結果をJSONで標準出力へ1行ずつ返します。失敗すると後続の行を実行せず終了します。エラーは標準エラー出力へ返し、競合時は終了コード2、その他の失敗は1です。成功済みの操作は取り消しません。再実行するときは、成功済みの行を除いてください。

batch内のauth・import・helpと、batchの入れ子は受け付けません。それらは通常のコマンドとして実行します。

## 比較を再実行する

日常操作は、未完了20件・完了200件のワークスペースで比較します。既定一覧、未完了だけの一覧、登録、ステータス更新、コメント追加を測り、結果も実際のAPIで確認します。`--url` を付けると本番に専用ワークスペースを作り、終了時にアーカイブします。

```sh
node scripts/benchmark-cli-daily.mjs \
  --phase final --workspace-form slug \
  --before dist/cli/linc-daily-before.mjs --after dist/cli/linc.mjs \
  --trials 10 --trace --output artifacts/private/cli-daily.json
node scripts/benchmark-cli-daily-cache.mjs \
  --phase final --workspace-form slug \
  --before dist/cli/linc-daily-before.mjs --after dist/cli/linc.mjs \
  --trials 10 --output artifacts/private/cli-daily-cache.json
```

`--trace` の通信回数・本文バイト数は、時間を測る実行とは別の実行で取得します。キャッシュ専用の計測は保存先を試行ごとに分け、初回・変更なし・別クライアントによる更新後を比較します。キャッシュの準備とリモート更新は計測区間に含めません。保存済み結果は、毎回サーバーが認証・所属・変更番号を確認して304を返した場合だけ使います。200件を超えてページ送りが必要な一覧は、全ページを取得してキャッシュしません。

Workerも変更する場合は、デプロイ前に `--phase baseline` と旧CLIを両方の引数へ指定して測ります。新Worker上で旧CLIと新CLIを比較した結果だけを、システム全体の改善前後として扱わないでください。

起動時間の追加調査では、Zodのimportを変更して英語以外のlocaleと未使用APIを配布物から除去しました。検証処理は維持しています。[起動時間の比較結果](../reports/cli-performance/startup/README.md)に、採用しなかった遅延初期化の試作も記録しています。

変更前後のCLI成果物を `dist/cli/` に置きます。レポートには各ファイルのSHA-256、Nodeのバージョン、試行ごとの時間を記録します。CLI本体や依存ライブラリを計測中に書き換えないでください。

変更前の成果物がない場合は、同じ依存ライブラリを使って基準コミットをビルドできます。

```sh
(
  set -eu
  baseline_dir=$(mktemp -d)
  trap 'rm -rf "$baseline_dir"' EXIT
  git archive 5318b27 | tar -x -C "$baseline_dir"
  ln -s "$PWD/node_modules" "$baseline_dir/node_modules"
  (cd "$baseline_dir" && node scripts/build-cli.mjs)
  mkdir -p dist/cli
  cp "$baseline_dir/dist/cli/linc.mjs" dist/cli/linc-baseline.mjs
)
pnpm build:cli
```

ローカルの実Workerで単発コマンドを比較します。作成・更新のfixture準備と保存結果の検証は計測区間から外します。

```sh
node scripts/benchmark-cli.mjs \
  --before dist/cli/linc-baseline.mjs --after dist/cli/linc.mjs \
  --trials 20 --output artifacts/private/cli-single.json
```

本番の読み取りだけを比較する場合は、既存のissue識別子・project UUID・workspaceのslugとUUIDを渡します。ログイン済みCLIの認証を使用します。projectはチケットが存在するものを選びます。

```sh
node scripts/benchmark-cli-read.mjs \
  --before dist/cli/linc-baseline.mjs --after dist/cli/linc.mjs \
  --url https://linc.kazumasa.workers.dev \
  --workspace linc --workspace-id WORKSPACE_UUID \
  --issue FUCHIKOMA-25 --project PROJECT_UUID \
  --trials 20 --output artifacts/private/cli-production-read.json
```

62操作のワークロードは、projectを2件、issueを各10件作り、片方の10件を作業中にし、もう片方の10件を移動し、20件を完了にします。teamはキー、projectは名前、issueは識別子、stateはUUIDで指定します。コマンド同士は並列化せず同じ順番で実行します。

```sh
node scripts/benchmark-cli-workflow.mjs \
  --before dist/cli/linc-baseline.mjs --after dist/cli/linc.mjs \
  --trials 5 --output artifacts/private/cli-workflow.json
```

既定はローカル実Workerです。`--url` を追加すると指定先へ検証用workspaceを2件作成します。変更前用と変更後用のデータ量を試行ごとに揃え、終了時にworkspaceをアーカイブします。検証用データはアーカイブ内に残ります。`--after-mode single` を付けると、変更後も62回の単発プロセス起動で比較できます。

変更前後の実行順は試行ごとに交互にします。測るのはプロセス起動から終了までです。62操作では、その間の逐次実行制御も含めます。APIの待ち時間だけをCLIの所要時間と呼びません。

中央値を主な比較値とします。p95はnearest-rankで計算します。5試行のp95は観測した最大値にすぎず、安定した尾部レイテンシの推定には使いません。ローカルの結果をCloudflare本番の性能として扱いません。

## 振る舞いの検証

```sh
pnpm check
pnpm test:e2e
```

CLIの基本操作に加え、名前とUUIDを混ぜた参照、private teamの拒否、担当者の保存、batchの順序、引数の分離、名前変更後の参照、競合後の停止を実Workerで検証します。性能測定のために競合検出や認可を外していません。
