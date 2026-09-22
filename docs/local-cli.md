# ローカルDBでCLIを使う

`linc local` は、一覧表示とチケットの変更をこのマシンのSQLiteに保存します。コマンドが成功しても、同期前はWebや他のメンバーからは見えません。通常の `linc issue` は引き続きリモートへ直接アクセスします。

`node:sqlite` を利用できるNode.jsが必要です。開発・検証環境はNode.js 26です。

## 初回の取得と日常操作

通常の `linc auth login` でログインしてから、使用するworkspaceを取得します。

```sh
linc --workspace linc local init
linc --workspace linc local issue list
linc --workspace linc local issue create --team FUCHIKOMA --title '次にやること'
```

新規作成の結果にUUIDと `LOCAL-…` が表示されます。同期前はそのUUIDまたは一時識別子で操作します。同期後もUUIDは変わりません。

```sh
linc --workspace linc local issue update <UUID> --state 'In Progress'
linc --workspace linc local issue comment create <UUID> --body 'ローカルで作業した'
linc --workspace linc local status
linc --workspace linc local sync
```

同期が成功すると正式なチケット番号を取得し、Webからも変更を確認できます。`--json` は `local` の前に指定します。

一覧は既定で未完了だけを表示します。`--all` は完了も含め、`--closed` は完了・キャンセルだけを表示します。`--state`、`--team`、`--project`、`--assignee`、`--search` も使用できます。削除と復元は `local issue delete <UUID>` と `local issue restore <UUID>` です。

## 定期同期

別のターミナルで次のコマンドを動かします。5秒ごとに未送信操作を送り、リモート側の変更を取得します。

```sh
linc --workspace linc local watch --interval 5
```

停止するにはCtrl+Cを押します。watchが動いていなくても、ローカル操作と未送信データは保存されます。送信は次の `local sync` またはwatch起動時に行います。watch中でもローカル操作は通信を待ちません。

一回の同期は最大500操作、送信本文は8 MiBまでです。本文が大きい場合は、その上限に収まる操作までを送ります。残りは次の同期で送信します。サーバーは順に適用し、最初のエラーで停止します。成功した操作は保存済みとなり、失敗した操作と後続はローカルに残ります。バッチ全体の一括取り消しは行いません。変更があれば、同期応答には現在閲覧できるチケット・コメント・チームなどの情報も含まれます。変更番号が同じなら、このデータ一式の取得・転送を省きます。

## 競合と接続失敗

Webなどで同じチケットを先に変更していた場合、同期は競合を報告します。ローカルで保存した内容は維持し、自動では上書きしません。`linc --workspace linc --json local status` で未送信の操作とエラーを確認できます。

接続が切れた場合は、接続を戻して `local sync` を再実行します。サーバー側で保存済みでも、同じ操作の再送でチケットやコメントは増えません。

ローカルの未送信変更をすべて取り下げてリモートの内容を採用する場合に限り、次を使います。

```sh
linc --workspace linc local discard --yes
```

このコマンドは変更を送信せず、現在のリモートの内容を取得します。通信ができないときは取り下げません。応答消失などでリモートには保存済みだった変更は、そのまま残ります。取り下げた操作は `local status` の `discarded` で確認できます。競合を解消してローカルの変更を採用したい場合は、必要な内容を控え、取り下げ後に新しい更新として入力します。

## 保存場所と範囲

保存先は `$XDG_STATE_HOME/linc/local/`、未設定なら `~/.local/state/linc/local/` です。接続先・ログイン主体・workspaceごとにDBを分けます。ログイントークンの更新で未送信データが消えないよう、トークンそのものはDBの識別子に使いません。

このディレクトリには未送信データもあります。キャッシュとして削除しないでください。ファイルと親ディレクトリは所有者だけが読める権限で作成します。

オフラインのDBには、最後の同期時点で閲覧できたデータが残ります。別の場所で権限を変更しても、オフライン端末の保存データを即座に消すことはできません。

プロジェクトやメンバーなどの管理、インポート、添付ファイル、コメントの編集・削除は通常のリモートCLIを使います。変更後に `local sync` すると、対応するローカルデータを更新できます。
