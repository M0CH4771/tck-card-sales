import {readFile,writeFile} from 'node:fs/promises';
import {validateDataset} from '../dist/core.mjs';
import {validateCatalog,findCatalogCard,catalogProducts} from '../dist/catalog.mjs';
import {recordFromAlt} from './parse-alt.mjs';

// Input is visible ALT page content observed with the authorized browser workflow.
// This module performs no network requests and never invents missing prices.
export function mergeObservations(previous,catalog,targets,observations,completedAt){
  const existing=validateDataset(previous);
  const records=existing.products.map(p=>{
    const card=findCatalogCard(p,catalog.cards);
    return card?{...p,id:card.id+'-psa'+p.grade,catalogId:card.id,number:card.number,set:card.set,setCode:card.setCode,checkedAt:p.checkedAt||(p.sales.length?existing.asOf:'')}:p;
  });
  const multiGrade=targets.products.some(t=>t.grades.includes('10'));
  const products=new Map(catalogProducts(catalog,records,multiGrade?'all':'8').map(p=>[p.id,p]));
  for(const p of records)if(p.grade!=='8')products.set(p.id,p);
  const targetMap=new Map(targets.products.map(p=>[p.catalogId,p]));
  for(const p of products.values()){
    const t=targetMap.get(p.catalogId);
    if(t&&!p.url)p.url=t.urlsByGrade?.[p.grade]||t.url||'';
  }
  const failures=[],updated=new Set();
  for(const observation of observations){
    const target=targetMap.get(observation.catalogId);
    const grade=String(observation.grade||observation.raw?.selectedGrade||observation.raw?.grade||'');
    const id=observation.catalogId+'-psa'+grade;
    try{
      if(!target||!target.grades.includes(grade))throw new Error('対象のPSAグレードを確認できません');
      if(!Number.isFinite(Date.parse(observation.observedAt)))throw new Error('確認時刻が不正です');
      const known=new Set([target.url,...Object.values(target.urlsByGrade||{}),...(target.candidates||[]).map(c=>c.url)]);
      if(!known.has(observation.raw.url))throw new Error('未照合の商品URLです');
      const listingTitle=(target.candidates||[]).find(c=>c.url===observation.raw.url)?.text||'';
      const next=recordFromAlt(observation.raw,{...target,url:observation.raw.url,listingTitle},grade,observation.observedAt);
      const validated=validateDataset({schemaVersion:1,products:[next]}).products[0];
      const old=products.get(id);
      if(old?.checkedAt&&Date.parse(old.checkedAt)>=Date.parse(validated.checkedAt))continue;
      // Keep previously observed history even when it drops out of the recent preview.
      const sales=new Map((old?.sales||[]).map(s=>[s.id,s]));
      for(const sale of validated.sales)sales.set(sale.id,sale);
      products.set(id,{...validated,sales:[...sales.values()].sort((a,b)=>b.date.localeCompare(a.date))});
      updated.add(id);
    }catch(error){failures.push({catalogId:observation.catalogId,error:error.message});}
  }
  const next=validateDataset({...existing,mode:'live',asOf:updated.size?completedAt:existing.asOf,notice:'日本語版AR・CHR一覧。未確認の商品も表示します。価格は各PSAグレードで確認できた成約履歴のみ。',products:[...products.values()]});
  const psa8=next.products.filter(p=>p.grade==='8');
  const coverage={catalogCards:catalog.cards.length,checkedPsa8:psa8.filter(p=>p.checkedAt).length,pricedPsa8:psa8.filter(p=>p.sales.length).length,publicNoSalesPsa8:psa8.filter(p=>p.checkState==='no_sales').length,pendingPsa8:psa8.filter(p=>!p.checkedAt).length,updatedThisRun:updated.size};
  return {data:next,coverage,failures};
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  const [inputPath]=process.argv.slice(2);
  if(!inputPath)throw new Error('Usage: node scripts/merge-observations.mjs observations.json');
  const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
  const observations=JSON.parse(await readFile(inputPath,'utf8'));
  const completedAt=new Date().toISOString();
  const result=mergeObservations(await json('../dist/data.json'),validateCatalog(await json('../dist/catalog.json')),await json('./targets.json'),observations,completedAt);
  await writeFile(new URL('../dist/data.json',import.meta.url),JSON.stringify(result.data,null,2)+'\n');
  await writeFile(new URL('../dist/sync-status.json',import.meta.url),JSON.stringify({state:result.coverage.pendingPsa8||result.failures.length?'partial':'succeeded',completedAt,dataAsOf:result.data.asOf,coverage:result.coverage,message:'確認できた成約履歴を反映。各カードの確認日時を参照してください。'},null,2)+'\n');
  console.log(JSON.stringify({coverage:result.coverage,failures:result.failures},null,2));
}
