import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../gas/Code.gs',import.meta.url),'utf8');
function server(){
 const data=[],cache=new Map();let locked=false,reads=0;
 const ctx={console,CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v)})},Utilities:{newBlob:s=>({getBytes:()=>Buffer.from(s)}),formatDate:()=> '2026-09-10 12:00:00'},SpreadsheetApp:{flush:()=>{}},LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 ctx.today_=()=> '2026-09-10';ctx.catalog_=()=>[{id:'jp-test-001',name:'テストカード',number:'001/001',set:'テスト弾'}];
 ctx.log_=()=>({getLastRow:()=>data.length+1,getRange:()=>({setValues(rows){assert.equal(locked,true);data.push(...rows);}})});
 ctx.rows_=()=>{reads++;return data.map(r=>[...r]);};
 return {ctx,data,cache,get reads(){return reads;}};
}
const op=(overrides={})=>({id:'12345678-1234-1234-1234-123456789abc',day:'2026-09-10',cardId:'jp-test-001',grade:'8',delta:2,...overrides});
test('再送は二重加算せず、書き込み時にロックを保持する',()=>{
 const {ctx,data}=server();assert.equal(ctx.purchaseAdd(op()).summary.total,2);assert.equal(ctx.purchaseAdd(op()).summary.total,2);assert.equal(data.length,1);
});
test('別端末からの操作を加算し、PSAグレードを分けて集計する',()=>{
 const {ctx}=server();ctx.purchaseAdd(op());const r=ctx.purchaseAdd(op({id:'22345678-1234-1234-1234-123456789abc',grade:'9',delta:3}));assert.equal(r.summary.total,5);assert.equal(r.summary.items.length,2);
});
test('訂正で0枚に戻せるがマイナス枚数にはできない',()=>{
 const {ctx}=server();ctx.purchaseAdd(op());assert.equal(ctx.purchaseAdd(op({id:'22345678-1234-1234-1234-123456789abc',delta:-3})).ok,false);
 assert.equal(ctx.purchaseAdd(op({id:'32345678-1234-1234-1234-123456789abc',delta:-2})).summary.total,0);
});
test('日付変更後の再送も元の日の保存を確認し、新規の過去日入力は拒否する',()=>{
 const {ctx,data}=server();ctx.purchaseAdd(op());ctx.today_=()=> '2026-09-11';assert.equal(ctx.purchaseAdd(op()).ok,true);assert.equal(data.length,1);
 assert.equal(ctx.purchaseAdd(op({id:'22345678-1234-1234-1234-123456789abc'})).ok,false);
});
test('操作IDの使い回し、不正グレード、小数枚数、存在しないカードを拒否する',()=>{
 const {ctx,data}=server();ctx.purchaseAdd(op());for(const bad of [{delta:3},{grade:'7'},{delta:1.5},{cardId:'jp-missing-001'}])assert.equal(ctx.purchaseAdd(op(bad)).ok,false);assert.equal(data.length,1);
});
test('PDF用HTMLにカード名由来のタグを埋め込まない',()=>{const {ctx}=server();assert.equal(ctx.escape_('<script>"&'), '&lt;script&gt;&quot;&amp;');});

test('連続した共有確認はキャッシュを使い、追加後には更新済みの枚数を返す',()=>{
 const s=server();
 assert.equal(s.ctx.purchaseList('2026-09-10').total,0);
 const reads=s.reads;
 assert.equal(s.ctx.purchaseList('2026-09-10').total,0);
 assert.equal(s.reads,reads);
 s.ctx.purchaseAdd(op());
 const after=s.reads;
 assert.equal(s.ctx.purchaseList('2026-09-10').total,2);
 assert.equal(s.reads,after);
 s.ctx.purchaseAdd(op({id:'22345678-1234-1234-1234-123456789abc',delta:3}));
 assert.equal(s.ctx.purchaseList('2026-09-10').total,5);
});
test('PDF用の強制読み取りはキャッシュを使わず、キャッシュ消失でも正しく集計する',()=>{
 const s=server();s.ctx.purchaseAdd(op());const reads=s.reads;
 assert.equal(s.ctx.purchaseList('2026-09-10',true).total,2);assert.equal(s.reads,reads+1);
 s.cache.clear();assert.equal(s.ctx.purchaseList('2026-09-10').total,2);
});
