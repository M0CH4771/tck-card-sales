import {spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function git(...args){const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||'git失敗');return r.stdout.trim();}
if(git('branch','--show-current')!=='main')throw Error('mainで実行してください');
const remote=git('remote','get-url','origin');
if(!/github\.com[:/]M0CH4771\/tck-card-sales(?:\.git)?$/i.test(remote))throw Error('対象リポジトリではありません');
if(git('status','--porcelain'))throw Error('未保存の変更があります。先に確認・コミットしてください');
git('pull','--ff-only');
const r=spawnSync(process.execPath,[resolve(root,'scripts/local-scrape.mjs'),'--apply'],{cwd:root,stdio:'inherit'});
if(![0,2].includes(r.status))throw Error('取得処理が異常終了しました。公開せず停止します');
const files=['dist/data.json','dist/sync-status.json','scripts/targets.json'];
if(git('diff','--name-only','--',...files)){
 git('add','--',...files);git('commit','-m','Refresh ALT sales from local Mac');git('push','origin','main');
}
console.log('GitHub反映完了。部分更新の場合は .local-runs の report.json を確認してください。');
