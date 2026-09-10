# ログイン不要の公開ページ取得（Mac）

公開商品ページのRecent transactionsだけを取得します。通常のChromeや旧ログイン用プロファイルは使わず、毎回未ログインのブラウザを作ります。認証が必要なページは未確認として記録します。認証の回避、Cookieのコピー、非公開APIの取得は行いません。

## 更新・最初の1件

ChromeとNode.js 22以上が必要です。既に準備したMacでは以下を順に実行してください。

```bash
cd ~/tck-card-sales
git pull --ff-only
npm ci --cache "$HOME/.tck-npm-cache"
npm run scrape:probe
```

バンギラスPSA8を1件確認し、成功・失敗・秒数を表示します。成功でも全件実行ではないため、最終stateはpartial（終了コード2）になります。`confirmed: 1` を確認してください。サイトのデータは変更しません。これが失敗する場合は全件へ進まず、「診断：」と結果を確認します。

## 12件の速度確認

```bash
npm run scrape:sample
```

既知の商品12件（バンギラスを含む）を対象とし、最初の1件が成功した後、3並列で取得します。結果は `.local-runs/実行日時/report.json`、元の観測は `observations.json` に保存します。成功件数・実行秒数・実測の処理件数/分を確認できます。未知の商品検索を含まない試運転なので、この速度だけで全件時間を保証できません。

## 全種類を取得・サイトへ反映

```bash
npm run scrape -- --apply
```

既存カタログ605種類のPSA8とユキワラシPSA9（計606対象）を毎回対象にします。既知URLを使い、未知URLは公開検索の商品リンクから照合します。同じカードの別グレードしかない場合や調査専用ページは取得できません。PSA人口ボタンによるグレード切替は未対応です。新弾のカタログ追加は別作業です。

初期設定は3並列、1対象の検索から取得完了まで合計最大30秒、全体110分です。大文字の見出しを読めず待ち続けた不具合を修正し、成功時は直ちに次へ進みます。最初のカードの失敗、連続する表示取得失敗、人間確認・アクセス制限では停止します。検索で見つからないだけのカードは記録して次へ進みます。

110分は実行の上限目安で、全件の成功保証ではありません。終了処理・ファイル保存時間は別です。上限時は未試行件数を記録します。全件試行、取得成功、過去からの累積確認済み件数は別々に表示します。失敗した商品の前回価格・確認日時は保持します。Ctrl+Cでも処理中のカードを終えて結果を保存します。

公開するには、生成したファイルだけをコミットします。

```bash
git add dist/data.json dist/sync-status.json scripts/targets.json
git commit -m "Update public ALT sales"
git push origin main
```

取得から公開まで一括で行う場合は `npm run scrape:daily`。main・正しいリポジトリ・未保存変更がないことを確認し、pull→取得→対象JSONのcommit/pushを行います。GitHub認証は手動pushで先に設定してください。

## 毎日0時

MacのタイムゾーンをAsia/Tokyoにして、手動取得とpushが成功した後に実行します。

```bash
npm run scrape:schedule
```

Macへのログイン・電源・ネット接続が必要です。スリープ中は定刻実行できません。0時は開始時刻です。結果とエラーは `.local-runs/daily.log`、`daily-error.log` を確認してください。旧ChatGPT定期タスクは停止済みです。

解除：

```bash
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/jp.tck.alt-market-refresh.plist"
```

## 詳細オプション

- `--concurrency 1`：並列数（1〜4、通常3）
- `--timeout 30`：1対象全体の秒数上限（5〜120）
- `--max-minutes 110`：実行上限（1〜120分）
- `--id jp-sv2d-079`：指定カードだけ試す
- `--diagnose`：失敗時の公開成約欄の文字を表示
- `--known-only --limit 12`：既知URLだけの試運転
- `--apply`：公開用JSONへ保存。指定しなければ実行フォルダだけ

[Playwrightの独立したブラウザコンテキスト](https://playwright.dev/docs/api/class-browser#browser-new-context)を使用しています。公開バンギラスで修正版の抽出処理を確認しましたが、Mac上での全件実行時間は未実測です。
