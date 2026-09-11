import test from 'node:test';
import assert from 'node:assert/strict';
import {gradeComparison,yenAmount,validateFx} from '../dist/comparison.mjs';
const p=(grade,price,extra={})=>({catalogId:'one',grade,sales:[{date:'2026-09-01',price,source:'eBay'}],...extra});
test('同じ型番でも別の収録弾やカードの価格を混ぜない',()=>{
 const products=[p('8',10),p('9',20),p('10',30),p('10',999,{catalogId:'other'})];
 assert.deepEqual(gradeComparison(products[0],products).map(x=>x.latest.price),[30,20,10]);
});
test('取引元の絞り込みを3グレードすべてに適用し未確認は0円にしない',()=>{
 const products=[p('8',10),p('9',20,{sales:[{date:'2026-09-01',price:20,source:'ALT'}]})];
 assert.deepEqual(gradeComparison(products[0],products,'ALT').map(x=>x.latest?.price??null),[null,20,null]);
});
test('円換算を1円単位に丸め、未取得レートや不正値を拒否する',()=>{
 assert.equal(yenAmount(20,153.594001),3072);assert.equal(yenAmount(20,undefined),null);assert.equal(yenAmount(20,-1),null);
 assert.throws(()=>validateFx({result:'success',base_code:'EUR',rates:{JPY:150},time_last_update_unix:1}));
});

test('PSA10・9・8の順で、取引元を絞った最新3件だけを返す',()=>{
 const sales=[{date:'2026-01-01',price:1,source:'ALT'},{date:'2026-01-04',price:4,source:'ALT'},{date:'2026-01-05',price:99,source:'eBay'},{date:'2026-01-02',price:2,source:'ALT'},{date:'2026-01-03',price:3,source:'ALT'}];
 const product=p('10',0,{sales}),result=gradeComparison(product,[product],'ALT');
 assert.deepEqual(result.map(x=>x.grade),['10','9','8']);
 assert.deepEqual(result[0].recent.map(x=>x.price),[4,3,2]);
 assert.equal(result[0].latest.price,4);assert.deepEqual(result[1].recent,[]);
 assert.equal(sales[0].price,1);
});
