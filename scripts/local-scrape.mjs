import {chromium} from 'playwright';
import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {mergeObservations} from './merge-observations.mjs';
import {validateCatalog} from '../dist/catalog.mjs';
import {recordFromAlt} from './parse-alt.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2), login=args.includes('--login'), apply=args.includes('--apply');
const value=k=>args.includes(k)?args[args.indexOf(k)+1]:undefined;
const limit=Number(value('--limit')||Infinity);
if(!(limit>0)||(!Number.isInteger(limit)&&limit!==Infinity))throw Error('--limit は正の整数です');
const profile=resolve(homedir(),'Library/Application Support/alt-market-scraper');
const runDir=resolve(root,'.local-runs',new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(profile,{recursive:true,mode:0o700});
await mkdir(resolve(root,'.local-runs'),{recursive:true});
const lock=resolve(root,'.local-runs/lock');
try{await mkdir(lock);}catch{throw Error('別の取得処理が実行中です。異常終了した場合のみ .local-runs/lock を削除してください。');}
const load=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'));
const save=async(p,v)=>{await writeFile(p+'.tmp',JSON.stringify(v,null,2)+'\n');await rename(p+'.tmp',p);};
const norm=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases={M6:['Storm Emeralda'],M5:['Abyss Eye'],M4:['Ninja Spinner'],M3:['Nihil Zero','Munikis Zero'],M2a:['Mega Dream'],M2:['Inferno X'],M1S:['Mega Symphonia'],M1L:['Mega Brave'],SV11W:['White Flare'],SV11B:['Black Bolt'],SV10:['Glory of Team Rocket','Rocket Glory'],SV9a:['Heat Wave Arena','Hot Air Arena'],SV9:['Battle Partners'],SV8:['Super Electric Breaker'],SV7a:['Paradise Dragona'],SV7:['Stellar Miracle'],SV6a:['Night Wanderer'],SV6:['Mask of Change'],SV5a:['Crimson Haze'],SV5K:['Wild Force'],SV5M:['Cyber Judge'],SV4a:['Shiny Treasure'],SV4K:['Ancient Roar'],SV4M:['Future Flash'],SV3a:['Raging Surf'],SV3:['Ruler of the Black Flame'],SV2a:['151'],SV2P:['Snow Hazard'],SV2D:['Clay Burst'],SV1a:['Triplet Beat'],SV1V:['Violet'],SV1S:['Scarlet'],S12a:['Vstar Universe'],S11a:['Incandescent Arcana'],S10a:['Dark Phantasma'],S9a:['Battle Region'],S8b:['Vmax Climax'],SM11b:['Dream League']};
function matches(text,t){
 const rarity=t.rarity==='AR'?/\bArt Rare\b|\bAR\b/i:/\bCharacter (?:Holo )?Rare\b|\bCHR\b/i;
 return /Japanese/i.test(text)&&norm(text).includes(norm(t.nameEn))&&Number(text.match(/#(\d+)/)?.[1])===Number(t.number.split('/')[0])&&rarity.test(text)&&!/Special Art Rare|Character Super Rare|\bSAR\b|\bCSR\b/i.test(text)&&(aliases[t.setCode]||[]).some(a=>norm(text).includes(norm(a)));
}
let context,stop=false;
process.on('SIGINT',()=>{stop=true;console.log('\n中断要求：現在のカードを終えて結果を保存します。');});
const startedAt=new Date().toISOString(),started=Date.now();
try{
 context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:false,locale:'en-US',viewport:{width:1440,height:1000}});
 const page=context.pages()[0]||await context.newPage();
 page.setDefaultTimeout(45000);
 if(login){
  await page.goto('https://alt.xyz/login',{waitUntil:'domcontentloaded'});
  const rl=createInterface({input:process.stdin,output:process.stdout});
  await rl.question('Chromeで自分でALTにログインしてください。ALTに戻ったら、このターミナルでEnter：');rl.close();
  console.log('専用Chromeを閉じます。次に npm run scrape:sample を実行してください。');
 }else{
  await mkdir(runDir,{recursive:true});
  const previous=await load('dist/data.json'),catalog=validateCatalog(await load('dist/catalog.json')),targets=await load('scripts/targets.json');
  const all=targets.products.flatMap(t=>t.grades.map(grade=>({t,grade})));
  const jobs=(args.includes('--known-only')?all.filter(j=>j.t.urlsByGrade?.[j.grade]||j.t.url):all).slice(0,limit);
  const observations=[],results=[];
  async function checkpoint(final=false){
   const completedAt=new Date().toISOString();
   const merged=mergeObservations(previous,catalog,targets,observations,completedAt);
   const confirmed=merged.coverage.updatedThisRun;
   const status={state:final?(confirmed===all.length?'succeeded':confirmed?'partial':'failed'):'running',startedAt,completedAt:final?completedAt:null,dataAsOf:merged.data.asOf,durationSeconds:Math.round((Date.now()-started)/1000),coverage:merged.coverage,runCoverage:{total:all.length,selected:jobs.length,attempted:results.length,confirmed,failed:results.filter(r=>!r.ok).length,unattempted:all.length-results.length},message:`今回 ${confirmed}/${all.length}件確認。詳細はローカル実行レポートを参照。`};
   await save(resolve(runDir,'observations.json'),observations);
   await save(resolve(runDir,'data.json'),merged.data);await save(resolve(runDir,'targets.json'),targets);
   await save(resolve(runDir,'sync-status.json'),status);await save(resolve(runDir,'report.json'),{...status,results,validationFailures:merged.failures});
   if(final&&apply){for(const [p,v]of [['dist/data.json',merged.data],['dist/sync-status.json',status],['scripts/targets.json',targets]])await save(resolve(root,p),v);}
   return status;
  }
  async function blocked(){
   const text=await page.locator('body').innerText();
   if(/Verify you are human|Checking your browser|Just a moment|unusual traffic|ログインがブロック|Access denied/i.test(text))throw Error('STOP: 人間確認・アクセス制限が表示されました');
   if(new URL(page.url()).hostname!=='alt.xyz')throw Error('STOP: ALTへのログインが必要です。npm run scrape:login を実行してください');
  }
  for(const [i,{t,grade}]of jobs.entries()){
   if(stop)break;
   const itemStart=Date.now();
   try{
    let url=t.urlsByGrade?.[grade]||t.url;
    if(!url){
     const query=`${t.nameEn} ${Number(t.number.split('/')[0])} Japanese ${t.rarity==='AR'?'Art Rare':'Character Rare'}`;
     await page.goto('https://alt.xyz/browse?query='+encodeURIComponent(query),{waitUntil:'domcontentloaded'});
     await page.getByRole('heading',{name:'Search',exact:true}).waitFor();
     await page.waitForTimeout(4000);await blocked();
     const candidates=await page.locator('main a[href*="/itm/"]').evaluateAll(els=>els.map(a=>({url:a.href,text:a.innerText})));
     const found=candidates.filter(c=>matches(c.text,t)&&new RegExp(`PSA\\s*${grade}(?![\\d.])`).test(c.text));
     const chosen=found[0];
     if(!chosen)throw Error('対象カード・収録弾・PSAグレードを照合できる商品リンクなし（履歴なしとは扱いません）');
     url=chosen.url;
    }
    const parsed=new URL(url);if(parsed.hostname!=='alt.xyz'||!parsed.pathname.startsWith('/itm/'))throw Error('ALT商品URLではありません');
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:'Recent transactions',exact:true}).waitFor();await blocked();
    // Only visible transaction links between the heading and the following market/listing section.
    const read=()=>page.evaluate(()=>{
     const main=document.querySelector('main');if(!main)return null;
     const title=main.querySelector('h2')?.innerText||'';
     const text=main.innerText,grade=text.match(/(?:^|\n)PSA\s*\n\s*([\d.]+)\s*\n/)?.[1]||'';
     const heading=[...main.querySelectorAll('h3')].find(e=>e.innerText.trim()==='Recent transactions');
     if(!heading)return {title,grade,rows:[],noSales:false};
     const after=text.split('Recent transactions')[1]?.split(/\n(?:Listings|Similar listings|Pokemon)\n/)[0]||'';
     let boundary=[...main.querySelectorAll('a,h2,h3')].find(e=>(heading.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING)&&((e.tagName==='A'&&e.getAttribute('href')?.includes('/exchange?category='))||e.innerText==='Similar listings'));
     const rows=[...main.querySelectorAll('a')].filter(a=>(heading.compareDocumentPosition(a)&Node.DOCUMENT_POSITION_FOLLOWING)&&(!boundary||(a.compareDocumentPosition(boundary)&Node.DOCUMENT_POSITION_FOLLOWING))&&a.getClientRects().length&&/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}\b/.test(a.innerText)).map(a=>({text:a.innerText,source:a.querySelector('img')?.alt||'',url:a.href}));
     return {title,grade,rows,noSales:/There are no recent transactions|No recent transactions/i.test(after)};
    });
    let raw;
    const deadline=Date.now()+45000;
    do{await blocked();raw=await read();if(raw&&(raw.rows.length||raw.noSales))break;await page.waitForTimeout(1000);}while(Date.now()<deadline);
    if(!raw||(!raw.rows.length&&!raw.noSales))throw Error('成約欄の読み込み未完了');
    if(raw.grade!==grade)throw Error(`表示PSA ${raw.grade||'不明'}：対象PSA ${grade}を確認できません`);
    if(!matches(raw.title,t))throw Error('商品名・番号・言語・レアリティ・収録弾が不一致または表記不足');
    raw={...raw,url:page.url(),historyReady:true,imageUrl:''};
    const observedAt=new Date().toISOString();recordFromAlt(raw,{...t,url:raw.url},grade,observedAt);
    t.urlsByGrade={...t.urlsByGrade,[grade]:raw.url};if(grade==='8')t.url=raw.url;
    observations.push({catalogId:t.catalogId,grade,observedAt,raw});
    results.push({catalogId:t.catalogId,grade,ok:true,seconds:(Date.now()-itemStart)/1000});
   }catch(e){results.push({catalogId:t.catalogId,grade,ok:false,seconds:(Date.now()-itemStart)/1000,error:e.message});if(e.message.startsWith('STOP:'))stop=true;}
   console.log(`[${i+1}/${jobs.length}] ${t.name} PSA${grade} ${results.at(-1).ok?'OK':results.at(-1).error} / 経過 ${Math.round((Date.now()-started)/60000)}分`);
   await checkpoint();if(!stop)await page.waitForTimeout(2000);
  }
  const status=await checkpoint(true);console.log(JSON.stringify(status,null,2));console.log('実行結果：'+runDir);
  if(status.state!=='succeeded')process.exitCode=2;
 }
}finally{await context?.close();await rm(lock,{recursive:true,force:true});}
