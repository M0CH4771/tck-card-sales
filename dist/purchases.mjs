import {purchasesEndpoint} from './purchases-config.mjs';
const section=document.createElement('section');section.id='purchases';section.className='purchase-section';section.hidden=true;
document.querySelector('.workspace').after(section);
let peer=null,peerOrigin='',selected='',summary=null;
const nonce=crypto.randomUUID();
function sendSelection(){if(peer&&selected)peer.postMessage({type:'alt-purchase-select',nonce,id:selected},peerOrigin);}
export function selectPurchaseCard(product){const id=product?.catalogId||'';if(id===selected)return;selected=id;sendSelection();}
export function purchaseCount(cardId,grade){if(!summary||summary.day!==summary.today||summary.day!==new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date()))return null;return summary.items.find(x=>x.id===cardId&&x.grade===grade)?.quantity||0;}
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
   summary=s;window.dispatchEvent(new Event('purchase-counts-updated'));
  }
 });
}

export function showPurchaseView(show=true){
 section.hidden=!show;
 for(const selector of ['.search-area','.workspace','.fx-settings','.sync-strip','#notice']){
  const element=document.querySelector(selector);if(element)element.hidden=show;
 }
 for(const [id,active] of [['view-search',!show],['view-purchases',show]]){
  const button=document.getElementById(id);button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
 }
 document.querySelector('.view-nav').scrollIntoView({block:'start'});
}
document.getElementById('view-search').addEventListener('click',()=>showPurchaseView(false));
document.getElementById('view-purchases').addEventListener('click',()=>showPurchaseView(true));
