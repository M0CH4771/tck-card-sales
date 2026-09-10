export function cardKey(p){
 return p.catalogId||JSON.stringify([p.nameEn||p.name,p.number,p.setCode||p.set,p.rarity,p.language]);
}
export function gradeComparison(product,products,source='all'){
 return ['8','9','10'].map(grade=>{
  const p=products.find(p=>cardKey(p)===cardKey(product)&&p.grade===grade);
  const sales=(p?.sales||[]).filter(s=>source==='all'||s.source===source).sort((a,b)=>b.date.localeCompare(a.date));
  return {grade,product:p,latest:sales[0]||null};
 });
}
export function yenAmount(usd,rate){
 return Number.isFinite(usd)&&usd>0&&Number.isFinite(rate)&&rate>0?Math.round(usd*rate):null;
}
export function validateFx(data){
 const rate=data?.rates?.JPY,at=data?.time_last_update_unix*1000;
 if(data?.result!=='success'||data.base_code!=='USD'||typeof rate!=='number'||!Number.isFinite(rate)||rate<=0||!Number.isFinite(at)||at<=0||at>Date.now()+86400000)throw Error('為替データが不正です');
 return {rate,at,fetchedAt:Date.now()};
}
