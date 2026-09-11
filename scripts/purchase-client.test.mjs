import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/purchases.mjs',import.meta.url),'utf8')
 .replace(/import .*?;\n/,'const purchasesEndpoint="https://script.google.com/macros/s/test/exec";\n').replace(/export /g,'');
function client(){
 const listeners=[];
 const element=()=>({style:{},after(){},before(){},append(){},addEventListener(){},setAttribute(){},scrollIntoView(){},classList:{toggle(){}}});
 const ctx={URL,Intl,Date,Event:class{},crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789abc'},
 document:{createElement:element,querySelector:element,getElementById:element,querySelectorAll:()=>[]},
 window:{addEventListener:(name,f)=>{if(name==='message')listeners.push(f);},dispatchEvent(){}}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,message(summary,optimistic=null,origin='https://test.googleusercontent.com'){
  for(const f of listeners)f({origin,data:{type:'alt-purchase-summary',nonce:'12345678-1234-1234-1234-123456789abc',summary,optimistic}});
 }};
}
const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
const snapshot=n=>({day,today:day,items:[{id:'jp-test-001',grade:'8',quantity:n}]});
const pending={day,cardId:'jp-test-001',grade:'8',delta:2};
test('保存中の枚数を即時表示し、確定応答で二重加算しない',()=>{
 const c=client();c.message(snapshot(3),pending);
 assert.equal(c.ctx.purchaseCount('jp-test-001','8'),5);assert.equal(c.ctx.purchasePending('jp-test-001','8'),true);
 c.message(snapshot(5));assert.equal(c.ctx.purchaseCount('jp-test-001','8'),5);assert.equal(c.ctx.purchasePending('jp-test-001','8'),false);
});
test('追加拒否時は確定枚数に戻し、異なる送信元を無視する',()=>{
 const c=client();c.message(snapshot(3),pending);c.message(snapshot(3));
 assert.equal(c.ctx.purchaseCount('jp-test-001','8'),3);
 c.message(snapshot(100),null,'https://example.com');assert.equal(c.ctx.purchaseCount('jp-test-001','8'),3);
});

test('複数カードの保存中表示を独立して加算し、確定後は加算を取り除く',()=>{
 const c=client();c.message(snapshot(3),[pending,{...pending,grade:'9',delta:4}]);
 assert.equal(c.ctx.purchaseCount('jp-test-001','8'),5);assert.equal(c.ctx.purchaseCount('jp-test-001','9'),4);
 c.message({day,today:day,items:[{id:'jp-test-001',grade:'8',quantity:5},{id:'jp-test-001',grade:'9',quantity:4}]});
 assert.equal(c.ctx.purchaseCount('jp-test-001','8'),5);assert.equal(c.ctx.purchasePending('jp-test-001','9'),false);
});
