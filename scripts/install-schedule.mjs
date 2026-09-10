import {mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
if(process.platform!=='darwin')throw Error('このコマンドはMac専用です');
if(Intl.DateTimeFormat().resolvedOptions().timeZone!=='Asia/Tokyo')throw Error('Macのタイムゾーンを日本（Asia/Tokyo）に設定してください');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),label='jp.tck.alt-market-refresh';
const dir=resolve(homedir(),'Library/LaunchAgents'),logs=resolve(root,'.local-runs');
await mkdir(dir,{recursive:true});await mkdir(logs,{recursive:true});
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const path=resolve(dir,label+'.plist');
await writeFile(path,`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${esc(process.execPath)}</string><string>${esc(resolve(root,'scripts/daily.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${esc(root)}</string>
<key>StartCalendarInterval</key><dict><key>Hour</key><integer>0</integer><key>Minute</key><integer>0</integer></dict>
<key>StandardOutPath</key><string>${esc(resolve(logs,'daily.log'))}</string>
<key>StandardErrorPath</key><string>${esc(resolve(logs,'daily-error.log'))}</string>
</dict></plist>`);
const domain='gui/'+process.getuid();spawnSync('launchctl',['bootout',domain,path]);
const r=spawnSync('launchctl',['bootstrap',domain,path],{encoding:'utf8'});if(r.status)throw Error(r.stderr);
console.log('毎日0時（Macの日本時間）に全種類取得→GitHubへ保存を設定しました。Macにログインし、Chromeの専用プロファイルを閉じておいてください。');
console.log('解除：launchctl bootout '+domain+' '+JSON.stringify(path));
