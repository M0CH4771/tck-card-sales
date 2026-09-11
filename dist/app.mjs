import {selectPurchaseCard,purchaseCount,purchasePending,showPurchaseView,quickPurchase,updatePurchaseControls} from './purchases.mjs';
import {cardKey,gradeComparison,yenAmount,validateFx} from './comparison.mjs';
import {syncConfig} from './sync-config.mjs';
import {validateDataset, filterProducts, exportCsv, datasetFromCsv, safeUrl} from './core.mjs';
import {validateCatalog, catalogProducts, availabilityLabel} from './catalog.mjs';
import {renderPendingDetail} from './catalog-ui.mjs';

const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'$'+new Intl.NumberFormat('en-US',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2}).format(n);
const date=d=>d.replaceAll('-','/');
let dataset={products:[]}, selectedId='', visible=[], loadSequence=0, imported=false;
let fx=null,manualRate=null;
const yen=n=>{const amount=yenAmount(n,manualRate??fx?.rate);return amount===null?'円換算未取得':'約 '+new Intl.NumberFormat('ja-JP').format(amount)+'円';};
let latestRun=null, remoteAvailable=false, runStatusKnown=false;
let catalog={cards:[]},shownLimit=50,comparisonProducts=[];
const controls=['grade','rarity','source','sort','setCode','availability'];
const params=new URLSearchParams(location.search);
$('search').value=params.get('q')||'';
for(const key of controls){const v=params.get(key);if(v&&[...$(key).options].some(o=>o.value===v))$(key).value=v;}
const filters=()=>Object.fromEntries([['query',$('search').value],...controls.map(k=>[k,$(k).value])]);
let toastTimer;
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
function updateUrl(){const f=filters(),p=new URLSearchParams();if(f.query)p.set('q',f.query);for(const k of controls)if(f[k]!== ({grade:'all',rarity:'all',source:'all',sort:'recent',setCode:'all',availability:'all'}[k]))p.set(k,f[k]);history.replaceState(null,'',location.pathname+(p.size?'?'+p.toString():'')+location.hash);}
function populateOptions(){for(const [id,values] of [['grade',dataset.products.map(p=>p.grade)],['rarity',dataset.products.map(p=>p.rarity)],['source',dataset.products.flatMap(p=>p.sales.map(s=>s.source))]]){for(const value of [...new Set(values)])if(![...$(id).options].some(o=>o.value===value)){const option=document.createElement('option');option.value=value;option.textContent=id==='grade'?'PSA '+value:value;$(id).append(option);}}}

function render(){
  comparisonProducts=imported?dataset.products:catalogProducts(catalog,dataset.products,'all');
  const drafts=new Map([...document.querySelectorAll('.quick-entry')].map(el=>{const b=el.querySelector('button');return [b.dataset.card+':'+b.dataset.grade,el.querySelector('input').value];}));
  const activeEntry=document.activeElement?.closest('.quick-entry');const activeButton=activeEntry?.querySelector('button');const focusedQuantity=document.activeElement?.tagName==='INPUT'&&activeButton?activeButton.dataset.card+':'+activeButton.dataset.grade:null;
  visible=filterProducts(imported?dataset.products:catalogProducts(catalog,dataset.products,$('grade').value),filters());
  if(!visible.some(p=>p.id===selectedId))selectedId=visible[0]?.id||'';
  const listed=[...new Map(visible.map(p=>[cardKey(p),p])).values()];
  $('count').textContent=`${listed.length.toLocaleString()}種類`;$('export').disabled=!visible.some(p=>p.sales.length);
  document.querySelectorAll('[data-preset]').forEach(b=>{const active=$('grade').value==='8'&&$('rarity').value===b.dataset.preset;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  if(!visible.length){
    const hasData=catalog.cards.length>0||dataset.products.length>0;
    $('results').innerHTML=`<div class="empty"><h3>${hasData?'条件に合うカードがありません':'カードデータがありません'}</h3><p>${hasData?'検索語や収録弾、価格の確認状況を変更してください。':'データを読み込んで再度お試しください。'}</p>${hasData?'<button class="button" id="empty-clear">条件を解除して表示</button>':''}</div>`;
    $('detail').innerHTML='<div class="empty-detail">条件に合うカードを選ぶと、最近の取引を確認できます。</div>';
    $('empty-clear')?.addEventListener('click',clearFilters);updateUrl();return;
  }
  $('results').innerHTML=listed.slice(0,shownLimit).map(p=>`<article class="result-card ${cardKey(p)===cardKey(visible.find(x=>x.id===selectedId)||{})?'selected':''}" ><span class="card-top"><span class="tag grade">PSA 8・9・10</span><span class="tag rarity">${escapeHtml(p.rarity)}</span></span><div class="card-name">${escapeHtml(p.name)}</div><p class="card-subtitle">${escapeHtml(p.number)}${p.number?' · ':''}${escapeHtml(p.set||p.nameEn)}</p><div class="card-bottom">${p.latest?`<div class="card-price">${money(p.latest.price)}<small>USD</small></div><div class="card-date">${date(p.latest.date)}<span>${escapeHtml(p.latest.source)} · 直近の取引</span></div>`:`<div class="price-pending">${escapeHtml(availabilityLabel(p))}</div>`}</div>${comparisonHtml(p,true)}<button class="text-button history-open" data-id="${escapeHtml(p.id)}">成約履歴を見る →</button></article>`).join('')+(listed.length>shownLimit?`<button class="button show-more" id="show-more">さらに50件を表示（${shownLimit} / ${listed.length}種類）</button>`:'')+`<p class="result-note">成約履歴あり ${visible.filter(p=>p.latest).length}件 / 未確認・公開履歴なし ${visible.filter(p=>!p.latest).length}件</p>`;
  $('results').querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>{selectedId=b.dataset.id;render();$('detail-dialog').showModal();}));
  $('results').querySelectorAll('[data-quick-add]').forEach(b=>b.addEventListener('click',()=>{
   const input=b.closest('.quick-entry').querySelector('input');quickPurchase(b.dataset.card,b.dataset.grade,Number(input.value));
  }));
  $('results').querySelectorAll('.quick-entry').forEach(el=>{const b=el.querySelector('button'),key=b.dataset.card+':'+b.dataset.grade,input=el.querySelector('input');if(drafts.has(key))input.value=drafts.get(key);if(key===focusedQuantity)input.focus({preventScroll:true});});
  updatePurchaseControls();
  $('show-more')?.addEventListener('click',()=>{shownLimit+=50;render();});
  const selected=visible.find(p=>p.id===selectedId);
  renderDetail(selected);
  selectPurchaseCard(selected);
  const comparison=document.createElement('section');comparison.className='comparison-section';comparison.innerHTML='<p class="eyebrow">選択中のカード</p><h2>'+escapeHtml(selected.name)+'</h2><p class="comparison-subtitle">'+escapeHtml([selected.number,selected.set].filter(Boolean).join(' / '))+'</p><h3>PSA 8・9・10 の直近成約</h3>'+comparisonHtml(selected,false)+'<p class=\"fx-caption\">円は表示中の為替レートによる参考換算です。各グレードの成約日は異なります。</p>';
  const entryButton=document.createElement('button');entryButton.className='button primary';entryButton.textContent='このカードの買取枚数を入力';entryButton.addEventListener('click',()=>{$('detail-dialog').close();showPurchaseView(true);});comparison.append(entryButton);
  $('detail').prepend(comparison);
  const back=document.createElement('button');back.className='button mobile-back';back.textContent='↑ 検索結果に戻る';back.addEventListener('click',()=>$('results').scrollIntoView({behavior:'smooth',block:'start'}));$('detail').prepend(back);updateUrl();
}

function renderDetail(p){
  if(!p.sales.length){renderPendingDetail($('detail'),p);return;}
  const latest=p.sales[0], oldest=p.sales.at(-1), image=safeUrl(p.imageUrl), url=safeUrl(p.url,{altOnly:true});
  const subtitle=[p.nameEn,p.number?'#'+p.number:'',p.set,p.setCode].filter(Boolean).join(' / ');
  $('detail').innerHTML=`<div class="detail-head"><div class="detail-topline"><div class="detail-tags"><span class="tag grade">PSA ${escapeHtml(p.grade)}</span><span class="tag rarity">${escapeHtml(p.rarity)}</span>${p.language?`<span class="tag">${escapeHtml(p.language)}</span>`:''}</div>${url?`<a class="source-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">ALTで見る ↗</a>`:''}</div><h2>${escapeHtml(p.name)}</h2><p class="detail-subtitle">${escapeHtml(subtitle)}</p><div class="overview"><div class="product-image">${image?`<img id="card-image" src="${escapeHtml(image)}" alt="${escapeHtml(p.name)} PSA ${escapeHtml(p.grade)}" referrerpolicy="no-referrer">`:`<div class="no-image"><strong>PSA ${escapeHtml(p.grade)}</strong>商品画像未登録</div>`}</div><div class="latest"><div class="latest-label">直近の成約価格 <span class="tag">LATEST SALE</span></div><div class="big-price">${money(latest.price)}<span>USD</span></div><div class="yen-price">${yen(latest.price)}</div><div class="latest-meta"><time datetime="${latest.date}">${date(latest.date)}</time><span class="source-badge">${escapeHtml(latest.source)}</span><span>${escapeHtml(latest.type)}</span></div></div></div><dl class="detail-facts"><div><dt>鑑定グレード</dt><dd>PSA ${escapeHtml(p.grade)}</dd></div><div><dt>収録した取引</dt><dd>${p.sales.length.toLocaleString()}件</dd></div><div><dt>収録期間</dt><dd>${date(oldest.date)}〜</dd></div></dl></div><section class="history-section"><div class="history-title"><h3>最近の取引</h3><span>TRANSACTION HISTORY</span></div><div class="table-wrap"><table><thead><tr><th scope="col">成約日</th><th scope="col">取引元</th><th scope="col">取引方法</th><th scope="col">価格（USD）</th></tr></thead><tbody>${p.sales.map((s,i)=>`<tr><td><time datetime="${s.date}">${date(s.date)}</time>${i===0?'<span class="new-tag">最新</span>':''}</td><td><span class="source-badge">${escapeHtml(s.source)}</span></td><td>${escapeHtml(s.type)}</td><td class="price">${money(s.price)}<small class="yen-price">${yen(s.price)}</small></td></tr>`).join('')}</tbody></table></div><div class="provenance">データの出典：${escapeHtml(p.provenance)}<br>収録範囲内の履歴です。同日取引の時間・順序、送料・税の内訳は確認できていません。</div></section>`;
  $('card-image')?.addEventListener('error',e=>{e.target.parentElement.innerHTML='<div class="no-image">画像を表示できません</div>';});
  const note=document.createElement('p');note.className='record-check';note.textContent='このPSAグレードの履歴確認：'+(p.checkedAt?formatAsOf(p.checkedAt)+'（日本時間）':'未確認')+(p.checkState==='error'?' / 直近の取得に失敗':p.checkState==='no_sales'?' / 現在の公開欄は履歴なし。保存済みの取引を表示中':'');$('detail').querySelector('.detail-head').append(note);
}

function clearFilters(){ $('search').value='';$('grade').value='all';for(const id of ['rarity','source','setCode','availability'])$(id).value='all';shownLimit=50;render();}
const formatAsOf=value=>{const d=new Date(value);return Number.isNaN(d.valueOf())?'未確認':new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d);};
function showSyncState(){
  $('sync-schedule').textContent='自動取得：'+syncConfig.scheduleLabel;
  const status=$('sync-state');status.className='';
  const last='データ更新 '+formatAsOf(dataset.asOf)+'（日本時間）';
  if(!remoteAvailable){status.textContent='最新データを確認できません / '+last;status.className='failed';}
  else if(!runStatusKnown){status.textContent=last+' / 実行状況は未確認';}
  else if(latestRun&&latestRun.state==='running'){status.textContent='ALTから取得中 / '+last;status.className='running';}
  else if(latestRun&&latestRun.state==='failed'){status.textContent='直近の取得に失敗 / '+last;status.className='failed';}
  else if(latestRun&&latestRun.state==='partial'){status.textContent='一部の履歴を更新 / '+last;status.className='running';}
  else if(latestRun&&latestRun.state==='succeeded'&&Date.parse(dataset.asOf)<Date.parse(latestRun.dataAsOf)){status.textContent='取得完了・データ反映待ち / '+last;status.className='running';}
  else{status.textContent=last+(latestRun?.state==='succeeded'?' / 更新完了':' / 定期更新を待機中');status.className=latestRun?.state==='succeeded'?'complete':'';}
}
async function checkRun(){
  try{const response=await fetch(syncConfig.statusUrl+'?v='+Math.floor(Date.now()/60000),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Status unavailable');const value=await response.json();if(!['scheduled','running','succeeded','failed','partial'].includes(value.state))throw new Error('Invalid status');latestRun=value;runStatusKnown=true;showSyncState();}catch{runStatusKnown=false;showSyncState();}
}
function showDataNotice(){
  const count=dataset.products.reduce((n,p)=>n+p.sales.length,0);
  const gradeCounts=['10','9','8'].map(g=>{const records=catalogProducts(catalog,dataset.products,g);return `PSA${g}：確認済み ${records.filter(p=>p.checkedAt).length} / ${records.length}種類`;}).join(' ／ ');
  $('notice').textContent=catalog.cards.length?`日本語版 AR ${catalog.cards.filter(c=>c.rarity==='AR').length}種類・CHR ${catalog.cards.filter(c=>c.rarity==='CHR').length}種類。${gradeCounts}。カード一覧 ${catalog.asOf}時点。`:`${dataset.products.length}商品・${count}件の成約履歴。登録商品のRecent transactions欄が対象です。`;
  $('notice').className='notice';
}
async function loadData({silent=false}={}){
  const seq=++loadSequence;$('reload').disabled=true;
  try {
    await loadCatalog(true);
    const endpoint=new URL(syncConfig.dataUrl, location.href);endpoint.searchParams.set('v',String(Math.floor(Date.now()/60000)));
    const response=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('共通データを読み込めません。');
    const next=validateDataset(await response.json());if(!Number.isFinite(Date.parse(next.asOf)))throw new Error('取得時刻が不明です。');if(seq!==loadSequence)return;
    remoteAvailable=true;
    if(!dataset.asOf||Date.parse(next.asOf)>=Date.parse(dataset.asOf)||imported)dataset=next;
    imported=false;populateOptions();showDataNotice();render();showSyncState();
    if(!silent)toast('取得済みの最新データを表示しました');
    await checkRun();
  }catch(error){if(seq!==loadSequence)return;remoteAvailable=false;$('notice').className='notice error';$('notice').textContent=dataset.products.length?'最新データを確認できません。保存済みの成約履歴を表示しています。':'データを読み込めませんでした。しばらくして再試行してください。';if(!dataset.products.length)render();showSyncState();}
  finally{if(seq===loadSequence)$('reload').disabled=false;}
}
async function boot(){
  await loadCatalog(false);
  try{const response=await fetch('./data.json',{cache:'no-store'});if(response.ok){dataset=validateDataset(await response.json());populateOptions();render();$('notice').textContent='保存済みデータを表示し、最新の取得結果を確認しています。';}}
  catch{}
  await loadData({silent:true});
}
let catalogParamsApplied=false;
async function loadCatalog(remote=false){
  try{const response=await fetch(remote?syncConfig.catalogUrl+'?v='+Math.floor(Date.now()/60000):'./catalog.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('一覧を取得できません');const next=validateCatalog(await response.json());if(!catalog.asOf||next.asOf>=catalog.asOf)catalog=next;
    for(const card of catalog.cards)if(![...$('setCode').options].some(o=>o.value===card.setCode)){const option=document.createElement('option');option.value=card.setCode;option.textContent=card.setCode+' '+card.set;$('setCode').append(option);}
    if(!catalogParamsApplied){const value=params.get('setCode');if(value&&[...$('setCode').options].some(o=>o.value===value))$('setCode').value=value;catalogParamsApplied=true;}
  }catch{/* Keep the previously loaded catalog when the shared file is unavailable. */}
}
$('search-form').addEventListener('submit',e=>e.preventDefault());$('search').addEventListener('input',()=>{shownLimit=50;render();});
for(const id of controls)$(id).addEventListener('change',()=>{shownLimit=50;render();});
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{$('grade').value='8';$('rarity').value=b.dataset.preset;shownLimit=50;render();}));
$('clear').addEventListener('click',clearFilters);$('reload').addEventListener('click',()=>loadData());
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('import-dialog').open){e.preventDefault();$('search').focus();}});
$('export').addEventListener('click',()=>{const blob=new Blob([exportCsv(visible)],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='alt-sales-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`${visible.filter(p=>p.sales.length).length}商品・${visible.reduce((n,p)=>n+p.sales.length,0)}件の履歴を書き出しました`);});
$('import-open').addEventListener('click',()=>{$('import-error').textContent='';$('import-file').value='';$('import-dialog').showModal();});
$('import-file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{if(file.size>20*1024*1024)throw new Error('ファイルは20MB以下にしてください。');const text=await file.text();const next=file.name.toLowerCase().endsWith('.csv')?datasetFromCsv(text):validateDataset(JSON.parse(text));loadSequence++;$('reload').disabled=false;dataset=next;imported=true;populateOptions();selectedId='';$('notice').className='notice';$('notice').textContent='この画面に読み込んだデータを表示しています。再読込すると共通データに戻ります。';render();$('import-dialog').close();toast(`${dataset.products.length}商品を読み込みました`);}catch(error){$('import-error').textContent=error.message;}
});
setInterval(()=>{if(!document.hidden&&!imported)loadData({silent:true});},5*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!imported)loadData({silent:true});});

if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  Promise.resolve(document.modelContext.registerTool({name:'search_recorded_card_sales',title:'登録済み成約履歴を検索',description:'登録済み商品の検索条件を変更して画面に反映する。ALTへの新規取得は行わない。',inputSchema:{type:'object',properties:{query:{type:'string',maxLength:300},grade:{type:'string'},rarity:{type:'string'},source:{type:'string'},setCode:{type:'string'},availability:{type:'string'}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('検索条件を指定してください。');for(const key of Object.keys(input))if(!['query','grade','rarity','source','setCode','availability'].includes(key)||typeof input[key]!=='string')throw new Error('無効な検索条件です。');if((input.query?.length||0)>300)throw new Error('検索語が長すぎます。');for(const id of ['grade','rarity','source','setCode','availability'])if(input[id]&&!([...$(id).options].some(o=>o.value===input[id])))throw new Error('選択できない条件です：'+id);if(input.query!==undefined)$('search').value=input.query;for(const id of ['grade','rarity','source','setCode','availability'])if(input[id]!==undefined)$(id).value=input[id];render();return{count:visible.length,products:visible.slice(0,50).map(p=>({id:p.id,name:p.name,number:p.number,grade:p.grade,rarity:p.rarity,setCode:p.setCode,checkedAt:p.checkedAt,checkState:p.checkState,latest:p.latest||null})),truncated:visible.length>50};}},{signal:lifecycle.signal})).catch(()=>{});
  addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
loadFx();
boot();

function comparisonHtml(p,compact){
 const products=comparisonProducts;
 return '<div class="grade-comparison '+(compact?'compact':'')+'">'+gradeComparison(p,products,$('source').value).map(({grade,product,latest})=>`<div class="grade-cell"><strong>PSA ${grade}</strong>${latest?`<span class="grade-usd">${money(latest.price)}</span><span class="grade-yen">${yen(latest.price)}</span><small>${date(latest.date)}</small>${compact?'':`<small>${escapeHtml(latest.source)}</small>`}`:`<span class="grade-empty">${product?.sales.length?'該当取引なし':product?.checkState==='no_sales'?'公開履歴なし':'未確認'}</span>`}${compact?`<div class="quick-entry"><input aria-label="${escapeHtml(p.name)} PSA ${grade} 追加枚数" type="number" min="1" max="1000" step="1" value="1"><button type="button" data-quick-add data-card="${escapeHtml(p.catalogId||'')}" data-grade="${grade}" disabled>＋追加</button></div>`:''}<small class="purchase-count" data-purchase-card="${escapeHtml(p.catalogId||'')}" data-purchase-grade="${grade}">${purchaseCount(p.catalogId,grade)===null?'共有枚数を確認中':`本日買取 ${purchaseCount(p.catalogId,grade)}枚${purchasePending(p.catalogId,grade)?'（保存中）':''}`}</small></div>`).join('')+'</div>';
}
function showFx(){
 const rate=manualRate??fx?.rate;
 $('fx-status').textContent=rate?`1 USD = ${rate.toFixed(4)}円 ／ `+(manualRate!==null?'手動設定':new Date(fx.at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（日本時間）'+(Date.now()-fx.at>48*3600000?'・古いレート':'')):'為替レート未取得。手動入力でも円換算できます。';
 if(dataset.products.length)render();
}
async function loadFx(){
 try{const saved=JSON.parse(localStorage.getItem('alt-fx-v1')||'null');if(saved&&Number.isFinite(saved.rate)&&saved.rate>0&&Number.isFinite(saved.at)&&Number.isFinite(saved.fetchedAt))fx=saved;}catch{}
 showFx();
 if(fx&&Date.now()-fx.fetchedAt<24*3600000)return;
 try{const response=await fetch('https://open.er-api.com/v6/latest/USD',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('FX unavailable');fx=validateFx(await response.json());try{localStorage.setItem('alt-fx-v1',JSON.stringify(fx));}catch{}}catch{}
 showFx();
}
$('fx-rate').addEventListener('input',()=>{const input=$('fx-rate');const n=Number(input.value);manualRate=input.value&&Number.isFinite(n)&&n>0?n:null;showFx();});
setInterval(()=>{if(!document.hidden)loadFx();},3600000);

window.addEventListener('purchase-counts-updated',()=>{
 document.querySelectorAll('[data-purchase-card]').forEach(el=>{
  const {purchaseCard:card,purchaseGrade:grade}=el.dataset,n=purchaseCount(card,grade);
  el.textContent=n===null?'共有枚数を確認中':'本日買取 '+n+'枚'+(purchasePending(card,grade)?'（保存中）':'');
 });
});
