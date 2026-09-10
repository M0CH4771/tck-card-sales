# Macでalt相場検索を更新する

この取得ツールは初期実装です。構文・既存の履歴検証は確認済みですが、実際のMacとログイン済みALTでの全件実行は未検証です。最初に5件の試運転を行ってください。

## 初回準備

Google Chrome、Node.js 22以上、Gitをインストールしてください。GitHubへのpushにはアカウントの認証が別途必要です。ターミナルで以下を実行します。

```bash
cd ~
git clone https://github.com/M0CH4771/tck-card-sales.git
cd tck-card-sales
npm install
npm run scrape:login
```

専用Chromeが開きます。その画面で自分でALTにログインし、ALTへ戻ったらターミナルでEnterを押してください。通常使用するChromeのプロファイルは使いません。パスワードをスクリプトやチャットに入力する必要はありません。

ログイン状態はMacの `~/Library/Application Support/alt-market-scraper` に保存され、GitHubには送りません。[Playwrightの認証状態に関する説明](https://playwright.dev/docs/auth)。Google側がログインを拒否する場合は停止してください。専用Chromeでもログインできる保証はありません。

## 5件の試運転

```bash
npm run scrape:sample
```

結果は `.local-runs/実行日時/` に保存されます。`report.json` に実行秒数、成功・失敗件数と理由、`observations.json` に成約欄の取得結果が入ります。このコマンドはサイトのデータを変更しません。終了コード2は全対象未完了（試運転でも該当）、1は異常終了です。

## 全種類を取得

```bash
npm run scrape -- --apply
```

605種類のPSA8と、既存のユキワラシPSA9を対象に順番に調べます。カード名・番号・収録弾・日本語版・AR/CHR・ページ表示PSAグレードを確認します。未知のURLはALT公開検索の商品リンクから照合します。別グレードしかない商品、調査ページだけのカード、表記不足、ログインが必要な履歴は未確認として報告します。PSA人口ボタンによる別グレード切替は未対応です。全種類を試行しても、全種類の価格を取得できるとは限りません。

成約履歴と明確な履歴なし表示だけを採用し、失敗したカードの前回データ・確認日時は保持します。全件成功と一部成功を区別します。Ctrl+Cは現在のカードを終えて保存します。毎カードのチェックポイントを `.local-runs` に残します。起動ロックが異常終了で残ったときは、実行中プロセスがないことを確認してから `.local-runs/lock` を削除します。

`--apply` でローカルの公開用JSONに保存されます。サイトへ反映するには以下を実行します。

```bash
git add dist/data.json dist/sync-status.json scripts/targets.json
git commit -m "Update ALT sales"
git push origin main
```

## 毎日0時の更新

試運転とpushの成功を確認してから設定します。先に手動の全件実行・公開も確認できます。

```bash
npm run scrape:daily
npm run scrape:schedule
```

日次処理はmain・対象リポジトリ・作業ツリーに未保存変更がないことを確認してから、最新コードをpullし、全件取得し、公開用JSONのみをcommit/pushします。pushが失敗した場合もローカル結果は残ります。失敗時は `.local-runs/daily-error.log` を確認してください。Gitの認証は対話なしで利用できるよう、手動pushを先に完了してください。

MacのタイムゾーンがAsia/Tokyoのときだけ登録します。0時は開始予定であり完了時刻ではありません。Macにログインし、電源・ネット接続を維持し、スリープさせないでください。スリープ中は定刻実行できず、復帰後に遅れて動く場合があります。専用Chromeを手動で開いたままにすると取得を開始できない場合があります。

解除：

```bash
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/jp.tck.alt-market-refresh.plist"
```

## 所要時間

実測前の確定時間はありません。正常取得だけの試運転は、未特定413種類の検索にかかる時間を含みません。例として1対象10秒なら606対象で約101分、30秒なら約303分です（単なる計算例）。実行レポートの実測値を確認してください。アクセス制限の表示は回避せず停止します。

既存カタログを全件処理するツールです。新弾発売時のカタログ追加は別途必要です。
