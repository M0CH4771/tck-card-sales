import test from 'node:test';import assert from 'node:assert/strict';
import {kanaGroup,draftSummary,acknowledgeDrafts,draftKey} from '../dist/entry-tools.mjs';
test('濁音・半濁音・半角カナ・小文字を五十音の行で絞り込む',()=>{
 for(const [name,expected] of [['ガーディ','か'],['パピモッチ','は'],['ﾊﾟﾋﾟﾓｯﾁ','は'],['ピカチュウ','は'],['ヌオー','な'],['ニャース','な'],['ウパー','あ'],['ワッカネズミ','わ'],['Nのゾロア','他']])assert.equal(kanaGroup(name),expected);
});
test('一括追加の集計では初期値0を数えず、不正枚数を検出する',()=>{
 const d=new Map([['a',{cardId:'a',grade:'8',quantity:0}],['b',{cardId:'b',grade:'8',quantity:2}],['c',{cardId:'b',grade:'9',quantity:3}]]);
 assert.deepEqual(draftSummary(d),{cards:1,entries:2,total:5,invalid:false});
 d.set('d',{cardId:'d',quantity:1.5});assert.equal(draftSummary(d).invalid,true);
});
test('保存確認後はその入力だけをクリアし、保存中に編集した新しい入力は残す',()=>{
 const d=new Map([[draftKey('a','8'),{cardId:'a',grade:'8',quantity:2,revision:'new'}],[draftKey('b','9'),{cardId:'b',grade:'9',quantity:3,revision:'same'}]]);
 acknowledgeDrafts(d,[{cardId:'a',grade:'8',revision:'old'},{cardId:'b',grade:'9',revision:'same'}]);
 assert.equal(d.size,1);assert.equal(d.get('a:8').quantity,2);
});
