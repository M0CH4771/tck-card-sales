# Mac不要のGitHub Actions更新

`ALT public refresh` は毎日日本時間0時（UTC15時）に全種類を取得します。GitHub側の混雑で開始が遅れる場合があります。Macの電源・ログインは不要です。ALTへのログインも使いません。

[実行画面](https://github.com/M0CH4771/tck-card-sales/actions/workflows/alt-refresh.yml) の「Run workflow」で `probe`（1件試運転）または `full`（全件取得・保存）を選べます。取得コード変更時は1件の試運転だけを自動実行します。

3並列、1対象最大30秒、取得全体110分上限。ブラウザの準備や保存を含めジョブ上限125分です。1〜2時間は目標で、全件取得成功の保証ではありません。未取得・取得失敗・今回未試行は別に記録し、前回の価格と確認日時を保持します。Macでバンギラス1件6.4秒を確認しましたが、クラウドの速度は実行結果で確認してください。

実行画面のSummaryに所要秒数と今回の件数、Artifactsの `alt-refresh-report` に各カードの失敗理由を保存します。試運転は1件成功ならワークフロー成功ですが、全件を確認していないのでデータ側のstateはpartialです。fullも部分成功を保存するため、緑色のワークフローだけで全種類の確認完了とは判断しないでください。

全件実行は対象JSONだけをmainにコミットします。同時変更でpushできない場合は上書きせず失敗し、実行レポートを残します。リポジトリのActionsが無効、組織ポリシーで書き込み不可等の場合は設定変更が必要です。

サイトのJSONは公開リポジトリから直接読むため、ActionsのコミットでPagesの再ビルドが発生しなくても価格更新を確認できます。配信キャッシュ等で数分遅れる場合があります。取得できない場合は以前のデータを表示します。Pagesの公開設定は既存のmain・rootのままで構いません。

すでにMac側の日次実行を設定している場合は、二重更新を避けるため解除してください。

```bash
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/jp.tck.alt-market-refresh.plist"
```

未登録なら解除不要です。旧ChatGPT定期タスクは停止済みです。

参照：[Playwright CI](https://playwright.dev/docs/ci)、[GitHubによるワークフロー起動の制約](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)。
