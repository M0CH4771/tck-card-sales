import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {filterProducts,validateDataset,exportCsv,datasetFromCsv,parseCsv,safeUrl} from '../dist/core.mjs';
import {parseAltRow,recordFromAlt} from './parse-alt.mjs';
import {validateCatalog,catalogProducts,findCatalogCard} from '../dist/catalog.mjs';
import {mergeObservations} from './merge-observations.mjs';
const data=validateDataset(JSON.parse(await readFile(new URL('./fixtures/sample-data.json',import.meta.url),'utf8')));
const catalog=validateCatalog(JSON.parse(await readFile(new URL('../dist/catalog.json',import.meta.url),'utf8')));

test('日本語・英語・全角型番で検索できる',()=>{
  for(const query of ['ゆきわらし','Snorunt','２００１９３','200/193']) assert.ok(filterProducts(data.products,{query}).some(p=>p.name==='ユキワラシ'));
});
test('PSA8とPSA9の価格を混在させない',()=>{
  const p8=filterProducts(data.products,{query:'ユキワラシ',grade:'8'}),p9=filterProducts(data.products,{query:'ユキワラシ',grade:'9'});
  assert.equal(p8[0].latest.price,7);assert.equal(p9[0].latest.price,10);
});
test('取引元を絞ってから直近価格を決定する',()=>{
  const products=[{...data.products[0],sales:[{id:'a',date:'2026-09-09',price:50,currency:'USD',source:'eBay'},{id:'b',date:'2026-09-01',price:11,currency:'USD',source:'ALT'}]}];
  assert.equal(filterProducts(products,{source:'ALT'})[0].latest.price,11);
});
test('履歴CSVを出力・再読込して価格と件数を維持する',()=>{
  const round=datasetFromCsv(exportCsv(data.products));
  assert.deepEqual(round.products,data.products);
  assert.deepEqual(parseCsv('a,b\r\n"日本語,名前","1"\r\n'),[['a','b'],['日本語,名前','1']]);
});
test('空・負数・不正日付・別通貨を成約価格にしない',()=>{
  for(const override of [{price:''},{price:0},{price:-1},{date:'2026-02-30'},{currency:'JPY'}]){
    const copy=structuredClone(data);copy.products[0].sales[0]={...copy.products[0].sales[0],...override};assert.throws(()=>validateDataset(copy));
  }
});
test('同じCSV商品IDに異なるグレードを混ぜたら拒否する',()=>{
  const a=structuredClone(data.products[0]),b=structuredClone(a);b.grade=a.grade==='8'?'9':'8';b.sales=b.sales.map(s=>({...s,id:'other-'+s.id}));
  assert.throws(()=>datasetFromCsv(exportCsv([a,b])),/混在/);
});
test('危険なURLとCSVの数式をそのまま出力しない',()=>{
  assert.equal(safeUrl('javascript:alert(1)'), '');assert.equal(safeUrl('https://attacker.test/',{altOnly:true}),'');
  const p=structuredClone(data.products[0]);p.name='=1+1';assert.ok(exportCsv([p]).includes("'=1+1"));
});
test('公開ページの取引行を解析し、出品価格は拒否する',()=>{
  const s=parseAltRow({text:'Auction\nJul 31, 2026\n$7',source:'eBay',url:'https://www.ebay.com/itm/800413143241'},0);
  assert.equal(s.date,'2026-07-31');assert.equal(s.price,7);assert.equal(s.type,'オークション');
  assert.throws(()=>parseAltRow({text:'Fixed price\n$45',source:'eBay'},0));
});
test('SARや型番違いの商品をARとして取り込まない',()=>{
  const target={name:'ユキワラシ',nameEn:'Snorunt',number:'200/193',rarity:'AR',url:'https://alt.xyz/itm/eb74c4d7-1c23-4773-8f7c-883a50b0c504/external'};
  assert.throws(()=>recordFromAlt({title:'Special Art Rare Snorunt #200',rows:[]},target,'8','2026-09-10'));
  assert.throws(()=>recordFromAlt({title:'Art Rare Snorunt #201',rows:[]},target,'8','2026-09-10'));
});
test('発売済みAR547種類とCHR58種類を収録弾ごとに重複なく収録する',()=>{
  const baseline=catalog.cards.filter(c=>c.releaseDate<='2026-09-10');
  assert.equal(baseline.length,605);
  assert.equal(baseline.filter(c=>c.rarity==='AR').length,547);
  assert.equal(baseline.filter(c=>c.rarity==='CHR').length,58);
  assert.equal(new Set(baseline.map(c=>c.setCode)).size,38);
  for(const set of catalog.sets){
    const cards=catalog.cards.filter(c=>c.setCode===set.setCode);
    assert.equal(cards.length,set.expected,set.setCode);
    assert.ok(cards.every(c=>c.rarity===set.rarity&&c.releaseDate<=catalog.asOf));
  }
  assert.equal(catalog.cards.find(c=>c.id==='jp-m1s-070').name,'エリキテル');
  assert.equal(catalog.cards.find(c=>c.id==='jp-sv10-107').name,'ザマゼンタ');
});
test('未確認価格を0円にせず全種類を検索でき、PSA別に分離する',()=>{
  const products=catalogProducts(catalog,data.products,'8');
  assert.equal(filterProducts(products,{grade:'8',availability:'all'}).length,catalog.cards.length);
  const unpriced=filterProducts(products,{availability:'unpriced'});
  assert.ok(unpriced.length>500);assert.ok(unpriced.every(p=>p.latest===undefined&&p.sales.length===0));
  assert.equal(filterProducts(products,{setCode:'SM11b',availability:'all'}).length,12);
  assert.equal(filterProducts(products,{query:'ポッチャマ',rarity:'CHR',availability:'all'}).length,1);
  assert.equal(filterProducts(catalogProducts(catalog,data.products,'9'),{query:'ユキワラシ',grade:'9'})[0].latest.price,10);
  assert.equal(filterProducts(products,{query:'ユキワラシ',grade:'8'})[0].latest.price,7);
});
test('CHRはCSR・別言語・別グレード・読込中から取り込まない',()=>{
  const target={catalogId:'jp-s10a-073',name:'ピカチュウ',nameEn:'Pikachu',number:'073/071',rarity:'CHR',url:'https://alt.xyz/itm/example/external'};
  const raw={title:'2022 Pokemon Japanese Character Rare Pikachu #073',grade:'8',rows:[],noSales:true};
  assert.equal(recordFromAlt(raw,target,'8','2026-09-10T05:00:00Z').checkState,'no_sales');
  for(const override of [{title:raw.title.replace('Character Rare','Character Super Rare')},{title:raw.title.replace('Japanese','English')},{grade:'9'},{noSales:false}])assert.throws(()=>recordFromAlt({...raw,...override},target,'8','2026-09-10T05:00:00Z'));
});
test('一部商品の読み込み失敗で前回価格や確認日時を上書きしない',()=>{
  const card=findCatalogCard(data.products.find(p=>p.grade==='8'&&p.name==='ユキワラシ'),catalog.cards);
  const previous={...data,asOf:'2026-09-10T01:00:00Z'};
  const targets={products:[{...card,catalogId:card.id,grades:['8'],url:'https://alt.xyz/itm/example/external'}]};
  const result=mergeObservations(previous,catalog,targets,[{catalogId:card.id,observedAt:'2026-09-10T02:00:00Z',raw:{url:targets.products[0].url,title:'Loading',grade:'8',rows:[]}}],'2026-09-10T03:00:00Z');
  const retained=result.data.products.find(p=>p.catalogId===card.id&&p.grade==='8');
  assert.equal(retained.sales[0].price,7);assert.equal(retained.checkedAt,previous.asOf);assert.equal(result.data.asOf,previous.asOf);assert.equal(result.failures.length,1);
});
test('ページで省略されたAR表記は同URLの公開検索結果で補い、SARは拒否する',()=>{
  const target={catalogId:'jp-sv11b-142',name:'ワルビル',nameEn:'Krokorok',number:'142/086',rarity:'AR',url:'https://alt.xyz/itm/65dffbac-3ea7-45af-8f74-8c482b54cb39/external',listingTitle:'2025 Pokemon Black Bolt Japanese Art Rare Krokorok #142 PSA 8'};
  const raw={url:target.url,title:'2025 TCG Scarlet and Violet Black Bolt Japanese Krokorok #142',grade:'8',noSales:true,rows:[]};
  assert.equal(recordFromAlt(raw,target,'8','2026-09-10T05:00:00Z').rarity,'AR');
  assert.throws(()=>recordFromAlt({...raw,title:raw.title+' Special Art Rare'},target,'8','2026-09-10T05:00:00Z'));
});
