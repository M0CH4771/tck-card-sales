import {safeUrl} from '../dist/core.mjs';

const months={Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
export function parseAltRow(row,index){
  const parts=String(row.text||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const d=parts.find(s=>/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}$/.test(s));
  const dateMatch=d?.match(/^(\w+) (\d{1,2}), (\d{4})$/);
  const prices=parts.filter(s=>/^\$[\d,]+(?:\.\d+)?$/.test(s));
  if(!dateMatch||prices.length!==1)throw new Error('取引の日付または単一のUSD価格を確認できません。');
  const price=Number(prices[0].replace(/[$,]/g,''));
  if(!Number.isFinite(price)||price<=0)throw new Error('取引価格が不正です。');
  let source=String(row.source||'').trim();
  if(!source)throw new Error('取引元が不明です。');
  if(source.toLowerCase()==='alt')source='ALT';
  if(source==='PWCC Fixed Price'||source==='PWCC Weekly Auctions')source='Fanatics Collect';
  const typeMap={'Auction':'オークション','Best offer':'ベストオファー','Buy now':'即決','Fixed price':'固定価格'};
  const typeRaw=parts.find(s=>typeMap[s]);
  if(!typeRaw)throw new Error('未対応の取引方法です。');
  const url=safeUrl(row.url);
  // Strip affiliate/search parameters from identifiers; never include account/session data.
  const destination=url&&new URL(url).hostname==='fanaticscollect.pxf.io'?safeUrl(new URL(url).searchParams.get('u')):url;
  const id=destination?new URL(destination).origin+new URL(destination).pathname:`row-${index}`;
  return {id,date:`${dateMatch[3]}-${months[dateMatch[1]]}-${dateMatch[2].padStart(2,'0')}`,price,currency:'USD',source,type:typeMap[typeRaw]};
}

export function recordFromAlt(raw,target,grade,asOf){
  if(raw.url&&new URL(raw.url).href!==new URL(target.url).href)throw new Error('取得した商品URLが対象と一致しません。');
  const normalized=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
  const rarityText=[raw.title,target.listingTitle||''].join(' ');
  const contradictory=/Special Art Rare|Special Illustration Rare|Character Super Rare|\bSAR\b|\bCSR\b/i.test(raw.title);
  const rarityOk=!contradictory&&(target.rarity==='AR'?/\bArt Rare\b|\bAR\b/i.test(rarityText)&&!/\bCharacter (?:Holo )?Rare\b|\bCHR\b/i.test(raw.title):target.rarity==='CHR'?/\bCharacter (?:Holo )?Rare\b|\bCHR\b/i.test(rarityText):false);
  if(!raw.title||!target.nameEn||!normalized(raw.title).includes(normalized(target.nameEn))||!rarityOk||!/Japanese/i.test(raw.title))throw new Error('商品名・言語・レアリティが対象と一致しません。');
  const observedNo=raw.title.match(/#([0-9]+)/)?.[1];
  if(!observedNo||Number(observedNo)!==Number(target.number.split('/')[0]))throw new Error('商品番号が対象と一致しません。');
  const itemId=new URL(target.url).pathname.split('/')[2];
  if(String(raw.selectedGrade??raw.grade)!==String(grade))throw new Error('選択したPSAグレードを確認できません。');
  if(!raw.rows.length&&!raw.noSales)throw new Error('履歴が空ですが、履歴なしの表示は未確認です。');
  const sales=raw.rows.map(parseAltRow);
  // A listing image can retain the default grade after selecting another population grade.
  const imageUrl=raw.grade===grade?safeUrl(raw.imageUrl):'';
  return {id:target.catalogId?`${target.catalogId}-psa${grade}`:`${itemId}-psa${grade}`,catalogId:target.catalogId||'',name:target.name,nameEn:target.nameEn,number:target.number,set:target.set||'',setCode:target.setCode||'',year:raw.title.match(/^\d{4}/)?.[0]||'',rarity:target.rarity,grader:'PSA',grade,language:'日本語',imageUrl,url:target.url,provenance:`ALT公開商品ページ／${asOf}確認`,checkedAt:asOf,checkState:sales.length?'verified':'no_sales',sales};
}
