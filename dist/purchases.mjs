import {purchasesEndpoint} from './purchases-config.mjs';
const section=document.createElement('section');section.id='purchases';section.className='purchase-section';section.hidden=true;
document.querySelector('.workspace').after(section);
let peer=null,peerOrigin='',selected='',summary=null,optimistic=[];
const nonce=crypto.randomUUID();
function sendSelection(){if(peer&&selected)peer.postMessage({type:'alt-purchase-select',nonce,id:selected},peerOrigin);}
export function selectPurchaseCard(product){const id=product?.catalogId||'';if(id===selected)return;selected=id;sendSelection();}
export function purchaseCount(cardId,grade){if(!summary||summary.day!==summary.today||summary.day!==new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date()))return null;return (summary.items.find(x=>x.id===cardId&&x.grade===grade)?.quantity||0)+(optimistic.filter(x=>x.day===summary.day&&x.cardId===cardId&&x.grade===grade).reduce((n,x)=>n+x.delta,0));}
export function purchasePending(cardId,grade){return !!summary&&optimistic.some(x=>x.day===summary.day&&x.cardId===cardId&&x.grade===grade);}
export function purchaseTotal(){return summary&&summary.day===summary.today&&summary.day===new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date())?summary.total:null;}
if(!purchasesEndpoint){section.innerHTML='<h2>共有の買取記録</h2><p>買取記録は接続準備中です。</p>';}
else{
 const url=new URL(purchasesEndpoint);
 if(url.origin!=='https://script.google.com'||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname))throw Error('Invalid purchase endpoint');
 url.searchParams.set('nonce',nonce);
 const heading=document.createElement('h2');heading.textContent='買取枚数・日別リスト';
 const frame=document.createElement('iframe');frame.title='共有の買取枚数とPDF出力';frame.src=url.href;frame.style.cssText='width:100%;height:900px;border:0;background:white';
 section.append(heading,frame);
 window.addEventListener('message',event=>{
  if(!/^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(event.origin)||event.data?.nonce!==nonce)return;
  if(event.data.type==='alt-purchase-ready'){peer=event.source;peerOrigin=event.origin;sendSelection();}
  if(event.data.type==='alt-purchase-summary'){
   const s=event.data.summary;if(!s||!Array.isArray(s.items)||s.items.some(x=>!Number.isInteger(x.quantity)||x.quantity<0))return;
   summary=s;
   const op=event.data.optimistic;
   optimistic=(Array.isArray(op)?op:op?[op]:[]).filter(x=>Number.isInteger(x.delta)&&Math.abs(x.delta)<=1000);
   window.dispatchEvent(new Event('purchase-counts-updated'));
  }
 });
}

export function showPurchaseView(show=true){
 section.hidden=!show;
 for(const selector of ['.search-area','.workspace','.fx-settings','.sync-strip','#notice','#batch-bar']){
  const element=document.querySelector(selector);if(element)element.hidden=show;
 }
 for(const [id,active] of [['view-search',!show],['view-purchases',show]]){
  const button=document.getElementById(id);button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
 }
 document.querySelector('.view-nav').scrollIntoView({block:'start'});
}
document.getElementById('view-search').addEventListener('click',()=>showPurchaseView(false));
document.getElementById('view-purchases').addEventListener('click',()=>showPurchaseView(true));

let inlineReady=false,inlineBlocked=true,batchReady=false,ackReady=false;
const feedback=document.createElement('p');feedback.id='purchase-feedback';feedback.setAttribute('role','status');feedback.textContent='共有の買取記録に接続中…';document.querySelector('.workspace').before(feedback);
function controls(){document.querySelectorAll('[data-quick-add]').forEach(b=>{const value=Number(b.closest('.quick-entry').querySelector('input').value);b.disabled=!inlineReady||!ackReady||inlineBlocked||!Number.isInteger(value)||value<1||value>1000;});window.dispatchEvent(new Event('purchase-controls-updated'));}
export function canPurchaseBatch(){return batchReady&&!inlineBlocked&&!!peer;}
export function updatePurchaseControls(){controls();}
export function quickPurchase(cardId,grade,quantity,revision){
 if(!ackReady||!inlineReady||inlineBlocked||!peer)return;
 if(!Number.isInteger(quantity)||quantity<1||quantity>1000){feedback.textContent='枚数は1〜1000で入力してください';return;}
 inlineBlocked=true;controls();feedback.textContent='買取枚数を保存中…';
 peer.postMessage({type:'alt-purchase-add',nonce,cardId,grade,quantity,revision},peerOrigin);
}
window.addEventListener('message',e=>{
 if(!/^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(e.origin)||e.data?.nonce!==nonce)return;
 if(e.data.type==='alt-purchase-ready'&&!e.data.ack){feedback.textContent='一覧からの追加は接続先の更新待ちです。「買取を記録・PDF」は利用できます。';}
 if(e.data.type==='alt-purchase-controls'){
  batchReady=e.data.batch===true;ackReady=e.data.ack===true;
  inlineReady=true;inlineBlocked=e.data.blocked===true;controls();
 }
 if(e.data.type==='alt-purchase-saved'&&Array.isArray(e.data.operations))window.dispatchEvent(new CustomEvent('purchase-saved',{detail:e.data.operations}));
 if(e.data.type==='alt-purchase-feedback')feedback.textContent=String(e.data.text||'');
});

export function batchPurchase(entries){
 if(!canPurchaseBatch())return false;
 if(!entries.length||entries.some(x=>!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>1000)){feedback.textContent='枚数は1〜1000で入力してください';return false;}
 inlineBlocked=true;controls();feedback.textContent=entries.length+'件の買取枚数をまとめて保存中…';
 peer.postMessage({type:'alt-purchase-batch',nonce,entries},peerOrigin);return true;
}
