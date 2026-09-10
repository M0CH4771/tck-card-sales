import {normalize, safeUrl} from './core.mjs';

export function validateCatalog(input) {
  if (input?.schemaVersion !== 1 || !Array.isArray(input.cards) || input.cards.length > 10000) throw new Error('カード一覧の形式が正しくありません。');
  const seen = new Set();
  const cards = input.cards.map(card => {
    if (!card?.id || seen.has(card.id) || !card.name || !['AR','CHR'].includes(card.rarity) || !/^\d{3}\/\d{3}$/.test(card.number) || !card.setCode) throw new Error('カード一覧に重複または不正な項目があります。');
    seen.add(card.id);
    return {...card, catalogImageUrl:safeUrl(card.catalogImageUrl), catalogSource:safeUrl(card.catalogSource)};
  });
  return {...input,cards};
}

export function findCatalogCard(product, cards) {
  if (product.catalogId) return cards.find(c=>c.id===product.catalogId);
  const candidates=cards.filter(c=>normalize(c.name)===normalize(product.name)&&Number(c.number.split('/')[0])===Number(String(product.number).split('/')[0])&&(!product.setCode||normalize(c.setCode)===normalize(product.setCode)));
  return candidates.length===1?candidates[0]:undefined;
}

export function catalogProducts(catalog, products, grade='8') {
  if (!catalog?.cards?.length) return products;
  const byKey=new Map();
  for (const product of products) {
    const card=findCatalogCard(product,catalog.cards);
    if (!card) continue;
    const key=card.id+'-psa'+product.grade;
    const previous=byKey.get(key);
    if (!previous || (product.checkedAt||'')>(previous.checkedAt||'') || (product.sales.length&&!previous.sales.length)) byKey.set(key,product);
  }
  const grades=grade==='all'?['8','9','10']:[grade];
  return catalog.cards.flatMap(card=>grades.map(g=>{
    const id=card.id+'-psa'+g,record=byKey.get(id);
    return {...card,id,catalogId:card.id,grader:'PSA',grade:g,year:card.releaseDate?.slice(0,4)||'',sales:[],checkState:'pending',checkedAt:'',imageUrl:'',url:'',provenance:'',...record,id,catalogId:card.id,number:card.number,set:card.set,setCode:card.setCode,catalogImageUrl:card.catalogImageUrl,catalogSource:card.catalogSource};
  }));
}

export function availabilityLabel(product) {
  if (product.checkState==='error') return '取得に失敗';
  if (product.sales.length) return '成約履歴あり';
  if (product.checkState==='no_sales') return '公開履歴なし';
  if (product.checkState==='unavailable') return 'PSAグレードを確認できません';
  return product.url?'成約履歴を未確認':'ALTの商品を未照合';
}
