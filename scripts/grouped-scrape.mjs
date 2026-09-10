import {chromium} from 'playwright';
import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readPublicPage} from './read-public-page.mjs';
import {readPopulation,historySignature,freshGradeHistory} from './read-population.mjs';
import {matches} from './public-match.mjs';
import {recordFromAlt} from './parse-alt.mjs';
import {mergeObservations} from './merge-observations.mjs';
import {validateCatalog} from '../dist/catalog.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),value=k=>args.includes(k)?args[args.indexOf(k)+1]:undefined;
const apply=args.includes('--apply');
const concurrency=Number(value('--concurrency')||3),minutes=Number(value('--max-minutes')||110),limit=Number(value('--limit')||10000);
if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4||!Number.isFinite(minutes)||minutes<1||minutes>110)throw Error('Invalid execution limits');
const load=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'));
const save=async(p,v)=>{await writeFile(p+'.tmp',JSON.stringify(v,null,2)+'\n');await rename(p+'.tmp',p);};
const startedAt=new Date().toISOString(),started=Date.now(),deadline=started+minutes*60000;
const runDir=resolve(root,'.local-runs',startedAt.replace(/[:.]/g,'-')),lock=resolve(root,'.local-runs/lock');
await mkdir(resolve(root,'.local-runs'),{recursive:true});
await mkdir(lock);await mkdir(runDir,{recursive:true});
let browser,context,stopReason='';
const observations=[],results=[];
const grades=['10','9','8'];
const check=raw=>{if(raw.blocked)throw Error('STOP: 人間確認・アクセス制限');if(raw.auth)throw Error('公開取得対象外：ログインが必要');};
process.on('SIGINT',()=>{stopReason='ユーザーによる中断';});
try{
 const previous=await load('dist/data.json'),catalog=validateCatalog(await load('dist/catalog.json')),targets=await load('scripts/targets.json');
 for(const t of targets.products)t.grades=[...grades];
 let jobs=targets.products.filter(t=>!value('--id')||value('--id').split(',').includes(t.catalogId));
 // Known public control first, then one search per card instead of one per grade.
 jobs.sort((a,b)=>(b.catalogId==='jp-sv2d-079')-(a.catalogId==='jp-sv2d-079'));
 jobs=jobs.slice(0,limit);
 browser=await chromium.launch({...(value('--browser')==='chromium'?{}:{channel:'chrome'}),headless:false,chromiumSandbox:true});
 context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:1000}});
 async function runCard(t){
  const cardStart=Date.now(),cardDeadline=Math.min(deadline,cardStart+55000);
  const page=await context.newPage();
  const remaining=()=>{const n=cardDeadline-Date.now();if(n<=0)throw Error('カード処理の時間上限');return n;};
  const failed=(grade,error,phase)=>{if(!results.some(r=>r.catalogId===t.catalogId&&r.grade===grade))results.push({catalogId:t.catalogId,grade,ok:false,error,phase,seconds:(Date.now()-cardStart)/1000});};
  let phase='search',candidateText='',url=t.sharedPage?.url||t.urlsByGrade?.['10']||t.url;
  let timer;
  const work=async()=>{
   if(!url){
    const query=`${t.nameEn} ${t.number.split('/')[0]} Japanese ${t.rarity==='AR'?'Art Rare':'Character Rare'}`;
    await page.goto('https://alt.xyz/browse?query='+encodeURIComponent(query),{waitUntil:'domcontentloaded',timeout:Math.min(15000,remaining())});
    const searchEnd=Math.min(Date.now()+12000,cardDeadline);
    while(Date.now()<searchEnd){
     const raw=await page.evaluate(readPublicPage);check(raw);
     const candidates=await page.locator('main a[href*="/itm/"]').evaluateAll(els=>els.filter(e=>e.getClientRects().length&&e.innerText.trim()).map(e=>({url:e.href,text:e.innerText})));
     const match=candidates.filter(c=>matches(c.text,t)&&/PSA\s*(?:10|9|8)(?![\d.])/i.test(c.text)).sort((a,b)=>Number(/PSA\s*10\b/.test(b.text))-Number(/PSA\s*10\b/.test(a.text)))[0];
     if(match){url=match.url;candidateText=match.text;break;}
     await page.waitForTimeout(300);
    }
    if(!url)throw Error('公開検索で同一商品のPSA10・9・8のページを特定できませんでした');
   }
   phase='product';
   const parsed=new URL(url);if(parsed.hostname!=='alt.xyz'||!parsed.pathname.startsWith('/itm/')||parsed.search)throw Error('Invalid public item URL');
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:Math.min(15000,remaining())});
   let raw,population;
   while(true){
    raw=await page.evaluate(readPublicPage);check(raw);
    population=await page.evaluate(readPopulation);
    if(raw.title&&population.grades.length)break;
    if(Date.now()>cardStart+35000)throw Error('商品またはPSA人口欄の読み込み未完了');
    await page.waitForTimeout(Math.min(300,remaining()));
   }
   const listingTitle=candidateText||(t.candidates||[]).find(c=>c.url===url)?.text||'';
   if(!matches(raw.title+' '+listingTitle,t))throw Error('商品名・型番・収録弾・レアリティの照合失敗');
   t.sharedPage={url,listingGrade:raw.grade,availableGrades:population.grades,verifiedAt:new Date().toISOString(),requiresPopulationSelection:true};
   t.candidates||=[];
   if(candidateText&&!t.candidates.some(c=>c.url===url))t.candidates.push({url,text:candidateText});
   for(const grade of grades){
    phase='PSA'+grade;
    if(!population.grades.includes(grade)){failed(grade,'PSA人口欄に対象グレードなし（成約なしとは未確定）',phase);continue;}
    t.urlsByGrade={...t.urlsByGrade,[grade]:url};
    if(grade==='8')t.url=url;
    try{
     raw=await page.evaluate(readPublicPage);check(raw);
     population=await page.evaluate(readPopulation);
     let before=null,sawLoading=false;
     if(population.selected!==grade){
      before=historySignature(raw);
      await page.getByText(/^PSA population$/i).locator('..').getByRole('button',{name:new RegExp('^'+grade+'\\s')}).click({timeout:Math.min(3000,remaining())});
     }
     const gradeEnd=Math.min(Date.now()+10000,cardDeadline);
     let ready=false;
     while(Date.now()<gradeEnd){
      raw=await page.evaluate(readPublicPage);check(raw);
      population=await page.evaluate(readPopulation);
      if(!raw.historyReady)sawLoading=true;
      if(freshGradeHistory(raw,population,grade,before,sawLoading)){ready=true;break;}
      await page.waitForTimeout(150);
     }
     if(!ready)throw Error('選択グレードの新しい成約欄を確認できません（前グレードの価格は取込不可）');
     remaining();
     const observedAt=new Date().toISOString();
     raw={...raw,url,selectedGrade:population.selected,imageUrl:''};
     recordFromAlt(raw,{...t,url,listingTitle},grade,observedAt);
     observations.push({catalogId:t.catalogId,grade,observedAt,raw});
     results.push({catalogId:t.catalogId,grade,ok:true,seconds:(Date.now()-cardStart)/1000});
    }catch(e){if(e.message.startsWith('STOP:'))throw e;failed(grade,e.message,phase);}
   }
  };
  try{await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>{void page.close().catch(()=>{});reject(Error('カード処理の時間上限'));},Math.max(1,cardDeadline-Date.now()));})]);}
  catch(e){if(e.message.startsWith('STOP:'))stopReason=e.message;for(const grade of grades)if(!results.some(r=>r.catalogId===t.catalogId&&r.grade===grade))failed(grade,e.message,phase);}
  finally{clearTimeout(timer);await page.close().catch(()=>{});}
  console.log(`${t.name}: `+grades.map(g=>{const r=results.find(r=>r.catalogId===t.catalogId&&r.grade===g);return `PSA${g} ${r?.ok?'OK':r?.error||'未試行'}`;}).join(' / '));
 }
 async function checkpoint(final=false){
  const completedAt=new Date().toISOString(),merged=mergeObservations(previous,catalog,targets,observations,completedAt);
  const total=targets.products.length*3,confirmed=merged.coverage.updatedThisRun;
  const byGrade=Object.fromEntries(grades.map(g=>[g,{confirmed:results.filter(r=>r.grade===g&&r.ok).length,failed:results.filter(r=>r.grade===g&&!r.ok).length}]));
  const status={state:final?(confirmed===total?'succeeded':confirmed?'partial':'failed'):'running',startedAt,completedAt:final?completedAt:null,dataAsOf:merged.data.asOf,durationSeconds:Math.round((Date.now()-started)/1000),coverage:merged.coverage,runCoverage:{total,selected:jobs.length*3,attempted:results.length,confirmed,failed:results.filter(r=>!r.ok).length,unattempted:total-results.length},byGrade,linkedCards:targets.products.filter(t=>t.sharedPage).length,stopReason,message:`PSA10・9・8：今回 ${confirmed}/${total}件確認。URL照合と価格確認は別です。${stopReason}`};
  await save(resolve(runDir,'report.json'),{...status,results,validationFailures:merged.failures});
  if(final&&apply){await save(resolve(root,'scripts/targets.json'),targets);await save(resolve(root,'dist/data.json'),merged.data);await save(resolve(root,'dist/sync-status.json'),status);}
  return status;
 }
 // Probe includes all three grades; stop on a broken control before the large run.
 if(jobs.length){await runCard(jobs[0]);await checkpoint();if(!results.some(r=>r.ok))stopReason=stopReason||'先頭カードの全グレード取得に失敗';}
 for(let i=1;i<jobs.length&&!stopReason;i+=concurrency){
  if(Date.now()>=deadline){stopReason='110分の実行時間上限';break;}
  await Promise.allSettled(jobs.slice(i,i+concurrency).map(runCard));await checkpoint();
 }
 const status=await checkpoint(true);console.log(JSON.stringify(status,null,2));console.log('実行結果：'+runDir);if(status.state!=='succeeded')process.exitCode=2;
}finally{await context?.close();await browser?.close();await rm(lock,{recursive:true,force:true});}
