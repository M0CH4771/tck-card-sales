export const CSV_COLUMNS = ['product_id','name','name_en','number','set','set_code','year','rarity','grader','grade','language','image_url','alt_url','provenance','catalog_id','check_state','checked_at','sale_id','date','price','currency','source','type'];

export function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[‐‑–—−]/g, '-').replace(/(\d{3})(\d{3})(?!\d)/g, '$1/$2')
    .replace(/\bpsa\s+(\d+(?:\.\d+)?)/g, 'psa$1').trim();
}

export function safeUrl(value, {altOnly = false} = {}) {
  if (!value) return '';
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!altOnly || u.hostname === 'alt.xyz') ? u.href : ''; }
  catch { return ''; }
}

const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;

export function validateDataset(input) {
  if (!input || input.schemaVersion !== 1 || !Array.isArray(input.products)) throw new Error('schemaVersion: 1とproducts配列が必要です。');
  if (input.products.length > 20000) throw new Error('一度に読み込める商品は20,000件までです。');
  const ids = new Set(); let totalSales = 0;
  const products = input.products.map((p, i) => {
    if (!p || typeof p !== 'object') throw new Error(`商品${i+1}の形式が正しくありません。`);
    const id = str(p.id), name = str(p.name), grader = str(p.grader).toUpperCase(), grade = str(p.grade);
    if (!id || !name || ids.has(id)) throw new Error(`商品${i+1}：商品ID・名前がないか、IDが重複しています。`);
    ids.add(id);
    if (grader !== 'PSA' || !/^\d+(?:\.5)?$/.test(grade) || Number(grade)<1 || Number(grade)>10) throw new Error(`${name}：PSAグレードは1〜10で指定してください。`);
    if (!Array.isArray(p.sales)) throw new Error(`${name}：sales配列が必要です。`);
    totalSales += p.sales.length;
    if (totalSales > 100000) throw new Error('取引履歴は合計100,000件までです。');
    const saleIds = new Set();
    const sales = p.sales.map((s, j) => {
      if (!s || typeof s !== 'object') throw new Error(`${name}：取引${j+1}の形式が不正です。`);
      const sid = str(s.id || `${id}-${j+1}`), date = str(s.date), rawPrice = s.price;
      const price = typeof rawPrice === 'number' ? rawPrice : typeof rawPrice === 'string' && rawPrice.trim() !== '' ? Number(rawPrice) : NaN;
      const currency = str(s.currency).toUpperCase();
      if (!validDate(date) || !Number.isFinite(price) || price <= 0 || currency !== 'USD') throw new Error(`${name}：取引${j+1}の日付・正の価格・通貨USDを確認してください。`);
      if (saleIds.has(sid)) throw new Error(`${name}：取引ID ${sid} が重複しています。`);
      saleIds.add(sid);
      const sourceRaw = str(s.source), source = sourceRaw.toLowerCase() === 'ebay' ? 'eBay' : sourceRaw.toLowerCase() === 'alt' ? 'ALT' : sourceRaw;
      if (!source) throw new Error(`${name}：取引元が必要です。`);
      return {id:sid,date,price,currency,source,type:str(s.type || '成約')};
    }).sort((a,b) => b.date.localeCompare(a.date));
    const checkState = ['verified','no_sales','pending','error','unavailable'].includes(p.checkState) ? p.checkState : sales.length ? 'verified' : 'pending';
    return {id,name,nameEn:str(p.nameEn),number:str(p.number),set:str(p.set),setCode:str(p.setCode),year:str(p.year,4),rarity:str(p.rarity).toUpperCase()||'不明',grader,grade,language:str(p.language),imageUrl:safeUrl(str(p.imageUrl,2000)),url:safeUrl(str(p.url,2000),{altOnly:true}),provenance:str(p.provenance)||'取込データ',catalogId:str(p.catalogId),checkState,checkedAt:Number.isFinite(Date.parse(p.checkedAt))?str(p.checkedAt):'',sales};
  });
  return {schemaVersion:1,mode:str(input.mode)||'import',asOf:str(input.asOf),notice:str(input.notice,500),products};
}

export function filterProducts(products, filters = {}) {
  const {query='',grade='all',rarity='all',source='all',sort='recent',availability='priced',setCode='all'} = filters;
  const q = normalize(query), terms = q.split(/\s+/).filter(Boolean);
  const found = products.flatMap(p => {
    if (grade !== 'all' && p.grade !== grade || rarity !== 'all' && p.rarity !== rarity) return [];
    if (setCode !== 'all' && p.setCode !== setCode) return [];
    const haystack = normalize([p.name,p.nameEn,p.number,p.set,p.setCode,p.rarity,p.year,p.language,`PSA${p.grade}`].join(' '));
    if (!terms.every(t => haystack.includes(t))) return [];
    const sales = p.sales.filter(s => source === 'all' || s.source === source).slice().sort((a,b) => b.date.localeCompare(a.date));
    if (!sales.length && (availability === 'priced' || source !== 'all')) return [];
    if (availability === 'unpriced' && sales.length) return [];
    const exact = q && (normalize(p.name)===q || normalize(p.number)===q) ? 1 : 0;
    return [{...p,sales,latest:sales[0],exact}];
  });
  return found.sort((a,b) => {
    if (!!a.latest !== !!b.latest && sort !== 'name') return a.latest ? -1 : 1;
    if (sort==='high') return (b.latest?.price??0)-(a.latest?.price??0) || a.name.localeCompare(b.name,'ja');
    if (sort==='low') return (a.latest?.price??0)-(b.latest?.price??0) || a.name.localeCompare(b.name,'ja');
    if (sort==='name') return a.name.localeCompare(b.name,'ja',{numeric:true});
    return b.exact-a.exact || (b.latest?.date??'').localeCompare(a.latest?.date??'') || a.name.localeCompare(b.name,'ja');
  });
}

function csvCell(v) {
  let value = String(v ?? '');
  // Neutralize spreadsheet formula injection in text columns. Numeric prices are passed as numbers.
  if (typeof v === 'string' && /^[\s]*[=+\-@\t\r]/.test(value)) value = "'" + value;
  return '"'+value.replace(/"/g,'""')+'"';
}

export function exportCsv(products) {
  const rows = [CSV_COLUMNS];
  for (const p of products) for (const s of p.sales) rows.push([p.id,p.name,p.nameEn,p.number,p.set,p.setCode,p.year,p.rarity,p.grader,p.grade,p.language,p.imageUrl,p.url,p.provenance,p.catalogId,p.checkState,p.checkedAt,s.id,s.date,s.price,s.currency,s.source,s.type]);
  return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}

export function parseCsv(text) {
  const raw = String(text).replace(/^\uFEFF/,''); const rows=[]; let row=[],cell='',quoted=false,closed=false;
  for(let i=0;i<raw.length;i++) {
    const c=raw[i];
    if(quoted){ if(c==='"'){if(raw[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c; continue; }
    if(closed && ![',','\n','\r'].includes(c)) throw new Error('CSVの引用符の後に不正な文字があります。');
    if(c==='"'){if(cell!=='')throw new Error('CSVの引用符が不正です。');quoted=true;}
    else if(c===','){row.push(cell);cell='';closed=false;}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&raw[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell='';closed=false;}
    else cell+=c;
  }
  if(quoted)throw new Error('CSVの引用符が閉じていません。');
  row.push(cell);if(row.some(v=>v!==''))rows.push(row);
  return rows;
}

export function datasetFromCsv(text) {
  const rows = parseCsv(text); if(rows.length<2)throw new Error('CSVに取引データがありません。');
  const headers = rows.shift().map(h=>h.trim());
  if (new Set(headers).size !== headers.length) throw new Error('CSVの列名が重複しています。');
  const required=['product_id','name','rarity','grader','grade','date','price','currency','source'];
  if(required.some(k=>!headers.includes(k)))throw new Error('必要なCSV列が足りません：'+required.filter(k=>!headers.includes(k)).join(', '));
  const map=new Map();
  rows.forEach((r,i)=>{
    if(r.length!==headers.length)throw new Error(`CSV ${i+2}行目の列数が合いません。`);
    const d=Object.fromEntries(headers.map((k,j)=>[k,r[j]]));
    const fields={id:d.product_id,name:d.name,nameEn:d.name_en,number:d.number,set:d.set,setCode:d.set_code,year:d.year,rarity:d.rarity,grader:d.grader,grade:d.grade,language:d.language,imageUrl:d.image_url,url:d.alt_url,provenance:d.provenance,catalogId:d.catalog_id,checkState:d.check_state,checkedAt:d.checked_at};
    let p=map.get(d.product_id);
    if(!p){p={...fields,sales:[]};map.set(p.id,p);}
    else if(Object.keys(fields).some(k=>String(p[k]??'').trim()!==String(fields[k]??'').trim()))throw new Error(`CSV ${i+2}行目：同じ商品IDに異なる商品情報・鑑定グレードが混在しています。`);
    p.sales.push({id:d.sale_id||`csv-${i+1}`,date:d.date,price:d.price,currency:d.currency,source:d.source,type:d.type});
  });
  return validateDataset({schemaVersion:1,mode:'import',notice:'この画面に読み込んだデータを表示しています。再読込すると共通データに戻ります。',products:[...map.values()]});
}
