import {chromium} from 'playwright';
import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mergeObservations} from './merge-observations.mjs';
import {validateCatalog} from '../dist/catalog.mjs';
import {recordFromAlt} from './parse-alt.mjs';
import {readPublicPage} from './read-public-page.mjs';
import {matches} from './public-match.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),apply=args.includes('--apply'),diagnose=args.includes('--diagnose');
if(args.includes('--login')){console.log('現在はログイン不要です。npm run scrape:probe を実行してください。');process.exit(0);}
const value=k=>args.includes(k)?args[args.indexOf(k)+1]:undefined;
const int=(k,d,min,max)=>{const n=Number(value(k)??d);if(!Number.isInteger(n)||n<min||n>max)throw Error(`${k} は ${min}〜${max}の整数です`);return n;};
const browserChoice=value('--browser')||'chrome';
if(!['chrome','chromium'].includes(browserChoice))throw Error('--browser は chrome または chromium です');
const concurrency=int('--concurrency',3,1,4),timeoutSeconds=int('--timeout',30,5,120),maxMinutes=int('--max-minutes',110,1,120),limit=int('--limit',10000,1,10000);
const runDir=resolve(root,'.local-runs',new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(resolve(root,'.local-runs'),{recursive:true});
const lock=resolve(root,'.local-runs/lock');
try{await mkdir(lock);}catch{throw Error('別の取得処理が実行中です。異常終了した場合のみ .local-runs/lock を削除してください。');}
const load=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'));
const save=async(p,v)=>{await writeFile(p+'.tmp',JSON.stringify(v,null,2)+'\n');await rename(p+'.tmp',p);};
let browser,context,stop=false,stopReason='';
const startedAt=new Date().toISOString(),started=Date.now(),runDeadline=started+maxMinutes*60000;
process.on('SIGINT',()=>{stop=true;stopReason='ユーザーによる中断';console.log('現在処理中のカードを終えて保存します。');});
try{
 await mkdir(runDir,{recursive:true});
 const previous=await load('dist/data.json'),catalog=validateCatalog(await load('dist/catalog.json')),targets=await load('scripts/targets.json');
 const all=targets.products.flatMap(t=>t.grades.map(grade=>({t,grade})));
 const control=all.find(j=>j.t.catalogId==='jp-sv2d-079'&&j.grade==='8');
 const selected=all.filter(j=>(!args.includes('--known-only')||j.t.urlsByGrade?.[j.grade]||j.t.url)&&(!value('--id')||j.t.catalogId===value('--id')));
 const ordered=control&&selected.includes(control)?[control,...selected.filter(j=>j!==control)]:selected;
 const jobs=ordered.slice(0,limit);
 if(!jobs.length)throw Error('取得対象がありません');
 const observations=[],results=[];
 browser=await chromium.launch({...(browserChoice==='chrome'?{channel:'chrome'}:{}),headless:false,chromiumSandbox:true});
 // Fresh incognito context: never read the old MFA/login profile or save auth state.
 context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:1000}});
 async function runJob({t,grade}){
  const itemStart=Date.now(),deadline=Math.min(itemStart+timeoutSeconds*1000,runDeadline);
  const page=await context.newPage();
  const remaining=()=>{const n=deadline-Date.now();if(n<=0)throw Error('商品全体の制限時間に達しました');return n;};
  page.setDefaultTimeout(Math.max(1,deadline-Date.now()));
  let timer,lastRaw=null;
  const task=async()=>{
   const check=raw=>{if(raw.blocked)throw Error('STOP: 人間確認・アクセス制限');if(raw.auth)throw Error('このページはログイン・本人確認が必要（公開取得対象外）');};
   let url=t.urlsByGrade?.[grade]||t.url;
   if(!url){
    const query=`${t.nameEn} ${Number(t.number.split('/')[0])} Japanese ${t.rarity==='AR'?'Art Rare':'Character Rare'}`;
    await page.goto('https://alt.xyz/browse?query='+encodeURIComponent(query),{waitUntil:'domcontentloaded',timeout:remaining()});
    let found;
    do{
     check(await page.evaluate(readPublicPage));
     const candidates=await page.locator('main a[href*="/itm/"]').evaluateAll(els=>els.filter(a=>a.getClientRects().length).map(a=>({url:a.href,text:a.innerText})));
     found=candidates.find(c=>matches(c.text,t)&&new RegExp(`PSA\\s*${grade}(?![\\d.])`).test(c.text));
     if(found)break;
     const text=await page.locator('main').innerText({timeout:remaining()});
     if(/no results|no items found|0 items/i.test(text))throw Error('公開検索で照合可能な商品なし');
     await page.waitForTimeout(Math.min(500,remaining()));
    }while(remaining()>0);
    if(!found)throw Error('公開検索で照合可能な商品なし');
    url=found.url;
   }
   const parsed=new URL(url);if(!['alt.xyz','www.alt.xyz'].includes(parsed.hostname)||!parsed.pathname.startsWith('/itm/'))throw Error('ALT商品URLではありません');
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:remaining()});
   let scrolled=false;
   do{
    lastRaw=await page.evaluate(readPublicPage);check(lastRaw);
    if(lastRaw.diagnostic.headingFound&&!scrolled){await page.getByRole('heading',{name:/^recent transactions$/i}).scrollIntoViewIfNeeded({timeout:remaining()});scrolled=true;}
    if(lastRaw.historyReady)break;
    await page.waitForTimeout(Math.min(500,remaining()));
   }while(remaining()>0);
   const raw={...lastRaw,url:page.url(),imageUrl:''};
   if(!raw.historyReady)throw Error('成約欄の読み込み未完了');
   if(raw.grade!==grade)throw Error(`表示PSA ${raw.grade||'不明'}：対象PSA ${grade}を確認できません`);
   const listingTitle=(t.candidates||[]).find(c=>c.url===raw.url)?.text||'';
   if(!matches(raw.title+' '+listingTitle,t))throw Error('商品名・型番・収録弾・レアリティの照合失敗');
   const observedAt=new Date().toISOString();recordFromAlt(raw,{...t,url:raw.url,listingTitle},grade,observedAt);
   return {catalogId:t.catalogId,grade,observedAt,raw};
  };
  try{
   const observation=await Promise.race([task(),new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Error('商品全体の制限時間に達しました'));void page.close().catch(()=>{});},Math.max(1,deadline-Date.now()));})]);
   // Mutate shared results only after the timed task has successfully finished.
   t.urlsByGrade={...t.urlsByGrade,[grade]:observation.raw.url};if(grade==='8')t.url=observation.raw.url;
   observations.push(observation);
   return {catalogId:t.catalogId,grade,ok:true,seconds:(Date.now()-itemStart)/1000};
  }catch(e){
   if(e.message.startsWith('STOP:')){stop=true;stopReason=e.message;}
   if(diagnose)console.log('診断：'+JSON.stringify(lastRaw?.diagnostic||{headingFound:false}));
   return {catalogId:t.catalogId,grade,ok:false,seconds:(Date.now()-itemStart)/1000,error:e.message,diagnostic:lastRaw?.diagnostic||{headingFound:false}};
  }finally{clearTimeout(timer);await page.close().catch(()=>{});}
 }
 async function checkpoint(final=false){
  const completedAt=new Date().toISOString(),merged=mergeObservations(previous,catalog,targets,observations,completedAt),confirmed=merged.coverage.updatedThisRun;
  const elapsed=(Date.now()-started)/1000;
  const status={state:final?(confirmed===all.length?'succeeded':confirmed?'partial':'failed'):'running',startedAt,completedAt:final?completedAt:null,dataAsOf:merged.data.asOf,durationSeconds:Math.round(elapsed),coverage:merged.coverage,runCoverage:{total:all.length,selected:jobs.length,attempted:results.length,confirmed,failed:results.filter(r=>!r.ok).length,unattempted:all.length-results.length},performance:{concurrency,perItemLimitSeconds:timeoutSeconds,runLimitMinutes:maxMinutes,observedItemsPerMinute:results.length?Math.round(results.length/elapsed*600)/10:0},stopReason,message:`今回 ${confirmed}/${all.length}件確認。全件試行と全件確認成功は別です。${stopReason}`};
  await save(resolve(runDir,'observations.json'),observations);await save(resolve(runDir,'data.json'),merged.data);await save(resolve(runDir,'targets.json'),targets);
  await save(resolve(runDir,'sync-status.json'),status);await save(resolve(runDir,'report.json'),{...status,results,validationFailures:merged.failures});
  if(final&&apply)for(const[p,v]of[['dist/data.json',merged.data],['dist/sync-status.json',status],['scripts/targets.json',targets]])await save(resolve(root,p),v);
  return status;
 }
 // Gate: do not launch hundreds of requests when a known publicly visible card cannot be read.
 const first=await runJob(jobs[0]);results.push(first);console.log(`[1/${jobs.length}] ${jobs[0].t.name} PSA${first.grade} ${first.ok?'OK':first.error} / ${first.seconds.toFixed(1)}秒`);
 if(!first.ok){stop=true;stopReason=stopReason||'最初の1件を取得できないため全件実行を停止';}
 await checkpoint();
 let consecutiveFailures=0;
 for(let offset=1;offset<jobs.length&&!stop;offset+=concurrency){
  if(Date.now()>=runDeadline){stopReason='実行時間上限。未試行分は未完了として保持';stop=true;break;}
  const batch=jobs.slice(offset,offset+concurrency);
  const settled=await Promise.allSettled(batch.map(runJob));
  for(let i=0;i<settled.length;i++){
   const item=settled[i],j=batch[i];const r=item.status==='fulfilled'?item.value:{catalogId:j.t.catalogId,grade:j.grade,ok:false,error:String(item.reason)};results.push(r);
   consecutiveFailures=r.ok?0:consecutiveFailures+1;
   console.log(`[${results.length}/${jobs.length}] ${j.t.name} PSA${r.grade} ${r.ok?'OK':r.error} / 経過 ${Math.round((Date.now()-started)/60000)}分`);
  }
  // Search misses alone must not stop a full-catalog scan. Stop repeated page-load failures.
  if(consecutiveFailures>=6&&results.slice(-6).every(r=>/制限時間|Timeout|読み込み/.test(r.error||''))){stop=true;stopReason='6件連続で表示取得に失敗したため停止';}
  await checkpoint();
  if(!stop)await new Promise(r=>setTimeout(r,1000));
 }
 const status=await checkpoint(true);console.log(JSON.stringify(status,null,2));console.log('実行結果：'+runDir);
 if(status.state!=='succeeded')process.exitCode=2;
}finally{await context?.close();await browser?.close();await rm(lock,{recursive:true,force:true});}
