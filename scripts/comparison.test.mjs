import test from 'node:test';
import assert from 'node:assert/strict';
import {gradeComparison,yenAmount,validateFx} from '../dist/comparison.mjs';
const p=(grade,price,extra={})=>({catalogId:'one',grade,sales:[{date:'2026-09-01',price,source:'eBay'}],...extra});
test('同じ型番でも別の収録弾やカードの価格を混ぜない',()=>{
 const products=[p('8',10),p('9',20),p('10',30),p('10',999,{catalogId:'other'})];
 assert.deepEqual(gradeComparison(products[0],products).map(x=>x.latest.price),[10,20,30]);
});
test('取引元の絞り込みを3グレードすべてに適用し未確認は0円にしない',()=>{
 const products=[p('8',10),p('9',20,{sales:[{date:'2026-09-01',price:20,source:'ALT'}]})];
 assert.deepEqual(gradeComparison(products[0],products,'ALT').map(x=>x.latest?.price??null),[null,20,null]);
});
test('円換算を1円単位に丸め、未取得レートや不正値を拒否する',()=>{
 assert.equal(yenAmount(20,153.594001),3072);assert.equal(yenAmount(20,undefined),null);assert.equal(yenAmount(20,-1),null);
 assert.throws(()=>validateFx({result:'success',base_code:'EUR',rates:{JPY:150},time_last_update_unix:1}));
});
