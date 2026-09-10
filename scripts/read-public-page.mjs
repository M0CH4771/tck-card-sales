// Runs in the page. Read only rendered page elements, never application state or private APIs.
export function readPublicPage(){
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
 const body=document.body?.innerText||'';
 const blocked=/verify you are human|checking your browser|just a moment|unusual traffic|access denied/i.test(body);
 const auth=/Unauthorized action|Verify your identity|Access all of the market data for this asset with a free account/i.test(body)||/\/(?:mfa-challenge|login)(?:\/|$)/.test(location.pathname)||!['alt.xyz','www.alt.xyz'].includes(location.hostname);
 const main=document.querySelector('main');
 const out={blocked,auth,title:'',grade:'',rows:[],noSales:false,historyReady:false,diagnostic:{headingFound:false,transactionText:''}};
 if(!main)return out;
 out.title=[...main.querySelectorAll('h1,h2')].map(e=>e.textContent?.trim()||'').find(t=>/^\d{4}\s/.test(t)&&/#\d+/.test(t))||'';
 out.grade=(main.innerText||'').match(/(?:^|\n)PSA\s*\n\s*([\d.]+)\s*\n/i)?.[1]||'';
 // CSS text-transform changes innerText to uppercase. Match textContent case-insensitively.
 const heading=[...main.querySelectorAll('h1,h2,h3,[role="heading"]')].find(e=>visible(e)&&/^recent transactions$/i.test(e.textContent.trim()));
 if(!heading)return out;
 out.diagnostic.headingFound=true;
 const ordered=[...main.querySelectorAll('*')];
 const follows=(a,b)=>ordered.indexOf(a)<ordered.indexOf(b);
 const boundary=[...main.querySelectorAll('a,h2,h3')].find(e=>follows(heading,e)&&((e.tagName==='A'&&e.getAttribute('href')?.includes('/exchange?category='))||/^similar listings$/i.test(e.textContent.trim())));
 if(!boundary)return out; // Unknown layout: never include listings or the footer as sales.
 const inSection=e=>follows(heading,e)&&follows(e,boundary)&&visible(e);
 const links=[...main.querySelectorAll('a')].filter(inSection);
 out.rows=links.filter(a=>/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}\b/.test(a.innerText)).map(a=>({text:a.innerText,source:a.querySelector('img')?.alt||'',url:a.href}));
 const texts=[...main.querySelectorAll('p,div,span')].filter(e=>inSection(e)&&e.children.length===0).map(e=>e.innerText.trim());
 out.noSales=texts.some(t=>/^(?:There are no recent transactions|No recent transactions)[.!]?$/i.test(t));
 out.historyReady=out.rows.length>0||out.noSales;
 out.diagnostic.transactionText=[...new Set(texts)].join('\n').slice(0,1800);
 return out;
}
