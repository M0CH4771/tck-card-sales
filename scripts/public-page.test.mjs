import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readPublicPage} from './read-public-page.mjs';
function fixture({noSales=false,boundary=true,blocked=false}={}){
 const el=(tag,text,extra={})=>({tagName:tag,textContent:text,innerText:text,children:[],getClientRects:()=>[{}],getAttribute:()=>'',...extra});
 // Mirrors the observed ALT text-transform discrepancy: source title case, rendered uppercase.
 const heading=el('H3','Recent transactions',{innerText:'RECENT TRANSACTIONS'});
 const title=el('H2','2023 Pokemon Japanese Clay Burst Art Rare Tyranitar #79');
 const sale=el('A','Best offer\nSep 3, 2026\n$20',{href:'https://www.ebay.com/itm/123',querySelector:()=>({alt:'eBay'})});
 const market=el('A','Pokemon',{getAttribute:()=>'/exchange?category=POKEMON_CARDS'});
 const listing=el('A','Fixed price\nSep 9, 2026\n$999',{href:'https://www.ebay.com/itm/listing',querySelector:()=>({alt:'eBay'})});
 const empty=el('P','No recent transactions');
 const order=[title,heading,...(noSales?[empty]:[sale]),...(boundary?[market]:[]),listing];
 const main={innerText:'PSA\n8\nPOP\n214',querySelector:()=>title,querySelectorAll:selector=>selector==='*'?order:selector.startsWith('h1')?[title,heading]:selector==='a,h2,h3'?order.filter(e=>['A','H2','H3'].includes(e.tagName)):selector==='a'?order.filter(e=>e.tagName==='A'):order.filter(e=>['P','DIV','SPAN'].includes(e.tagName))};
 return {document:{body:{innerText:blocked?'Verify you are human':''},querySelector:()=>main},location:{hostname:'alt.xyz',pathname:'/itm/test/external'},getComputedStyle:()=>({visibility:'visible'})};
}
const read=options=>vm.runInNewContext('('+readPublicPage.toString()+')()',fixture(options));
test('CSSで大文字の成約見出しも読め、日付付き出品価格を含めない',()=>{const r=read();assert.equal(r.historyReady,true);assert.equal(r.grade,'8');assert.equal(r.rows.length,1);assert.match(r.rows[0].text,/\$20/);});
test('明示された履歴なしと読込中を区別する',()=>{const r=read({noSales:true});assert.equal(r.noSales,true);assert.equal(r.rows.length,0);assert.equal(r.historyReady,true);assert.equal(read({boundary:false}).historyReady,false);});
test('人間確認を成功扱いしないためのフラグを返す',()=>{assert.equal(read({blocked:true}).blocked,true);});
