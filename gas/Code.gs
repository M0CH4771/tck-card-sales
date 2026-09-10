const PURCHASE_SHEET_ID = '1KHm_HDKALE-og1rnqxuaCfW6K6Mu_skTORW3zOZ5fCg';
const PURCHASE_LOG = '買取ログ';
const PURCHASE_HEADERS = ['操作ID','記録日時','営業日（日本時間）','カードID','カード名','型番','収録弾','PSA','増減枚数'];

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Panel');
  template.bridgeNonce = /^[a-f0-9-]{36}$/.test(String(e && e.parameter.nonce || '')) ? e.parameter.nonce : '';
  return template.evaluate().setTitle('alt相場検索 買取記録')
    .addMetaTag('viewport','width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Run once in the script editor. Does not erase or change other sheets.
function setup_() {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.openById(PURCHASE_SHEET_ID);
    let sheet = ss.getSheetByName(PURCHASE_LOG);
    if (!sheet) sheet = ss.insertSheet(PURCHASE_LOG);
    if (!sheet.getLastRow()) {
      sheet.appendRow(PURCHASE_HEADERS); sheet.setFrozenRows(1);
      sheet.getRange(1,1,1,9).setFontWeight('bold').setBackground('#eeeaff');
      sheet.getRange('B:B').setNumberFormat('yyyy-mm-dd hh:mm:ss');
      sheet.getRange('C:H').setNumberFormat('@');
      sheet.getRange('I:I').setNumberFormat('0');
      sheet.autoResizeColumns(1,9);
    }
    assertHeaders_(sheet);
    catalog_();
    return '準備完了。ウェブアプリとしてデプロイしてください。';
  } finally { lock.releaseLock(); }
}
function today_() { return Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd'); }
function validDay_(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) throw Error('日付が不正です');
  const d = new Date(day+'T00:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==day) throw Error('日付が不正です');
  return day;
}
function assertHeaders_(sheet) {
  if (JSON.stringify(sheet.getRange(1,1,1,9).getValues()[0])!==JSON.stringify(PURCHASE_HEADERS)) throw Error('買取ログの列が異なります。列名・順序を確認してください');
}
function log_() {
  const sheet = SpreadsheetApp.openById(PURCHASE_SHEET_ID).getSheetByName(PURCHASE_LOG);
  if (!sheet) throw Error('GASで setup_ を実行してください');
  assertHeaders_(sheet); return sheet;
}
function rows_(sheet) { return sheet.getLastRow()>1 ? sheet.getRange(2,1,sheet.getLastRow()-1,9).getValues() : []; }
function summarize_(rows,day) {
  const items = {};
  rows.filter(r=>String(r[2])===day).forEach(r=>{
    const key=r[3]+'-psa'+r[7];
    if (!items[key]) items[key]={id:String(r[3]),name:String(r[4]),number:String(r[5]),set:String(r[6]),grade:String(r[7]),quantity:0};
    if (!Number.isInteger(Number(r[8]))) throw Error('買取ログに不正な枚数があります');
    items[key].quantity+=Number(r[8]);
  });
  const list=Object.values(items).filter(x=>x.quantity!==0).sort((a,b)=>a.name.localeCompare(b.name,'ja')||a.number.localeCompare(b.number)||Number(a.grade)-Number(b.grade));
  if (list.some(x=>x.quantity<0)) throw Error('買取ログの枚数がマイナスです');
  return {day,today:today_(),items:list,total:list.reduce((n,x)=>n+x.quantity,0),updatedAt:new Date().toISOString()};
}
function catalog_() {
  const cache=CacheService.getScriptCache();
  const saved=cache.get('purchase-catalog'); if(saved)return JSON.parse(saved);
  const response=UrlFetchApp.fetch('https://raw.githubusercontent.com/M0CH4771/tck-card-sales/main/dist/catalog.json');
  const cards=JSON.parse(response.getContentText()).cards.map(c=>({id:c.id,name:c.name,number:c.number,set:c.set}));
  const text=JSON.stringify(cards);
  if (Utilities.newBlob(text).getBytes().length<95000) cache.put('purchase-catalog',text,1800);
  return cards;
}
function purchaseBootstrap() { return {cards:catalog_(),summary:purchaseList(today_())}; }
function purchaseList(day) {
  validDay_(day); const lock=LockService.getScriptLock();lock.waitLock(20000);
  try {return summarize_(rows_(log_()),day);} finally {lock.releaseLock();}
}
function validateOperation_(op) {
  if (!op || !/^[a-f0-9-]{36}$/.test(String(op.id)) || !/^jp-[a-z0-9-]+$/.test(String(op.cardId))) throw Error('操作情報が不正です');
  validDay_(op.day);
  if (!['8','9','10'].includes(op.grade) || !Number.isInteger(op.delta) || op.delta===0 || Math.abs(op.delta)>1000) throw Error('枚数は1〜1000枚で指定してください');
}
function purchaseAdd(op) {
  try { validateOperation_(op); } catch(e) {return {ok:false,retryable:false,error:e.message};}
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    const sheet=log_(),rows=rows_(sheet),existing=rows.find(r=>r[0]===op.id);
    // A replay must have the same payload, including its original day.
    if(existing) {
      if(String(existing[2])!==op.day || existing[3]!==op.cardId || String(existing[7])!==op.grade || Number(existing[8])!==op.delta)
        return {ok:false,retryable:false,error:'同じ操作IDに異なる内容が指定されました'};
      return {ok:true,summary:summarize_(rows,op.day),replayed:true};
    }
    if(op.day!==today_())return {ok:false,retryable:false,error:'日付が変わりました。本日を表示して入力し直してください'};
    const card=catalog_().find(c=>c.id===op.cardId);
    if(!card)return {ok:false,retryable:false,error:'カード一覧にない商品です'};
    const current=summarize_(rows,op.day).items.find(x=>x.id===op.cardId && x.grade===op.grade);
    if((current?current.quantity:0)+op.delta<0)return {ok:false,retryable:false,error:'記録済みの枚数より多く減らすことはできません'};
    const row=[op.id,Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd HH:mm:ss'),op.day,card.id,card.name,card.number,card.set,op.grade,op.delta];
    // Values come from the verified catalog, not a caller-supplied name or formula.
    sheet.getRange(sheet.getLastRow()+1,1,1,9).setValues([row]);SpreadsheetApp.flush();
    rows.push(row);return {ok:true,summary:summarize_(rows,op.day),replayed:false};
  } finally {lock.releaseLock();}
}
function escape_(s) {return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function purchasePdf(day) {
  const summary=purchaseList(day);
  if(!summary.items.length)throw Error('この日の買取記録はありません');
  const html='<!doctype html><html lang="ja"><meta charset="utf-8"><style>@page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;font-size:10pt}h1{font-size:18pt}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#eee}thead{display:table-header-group}tr{page-break-inside:avoid}.num{text-align:right}</style><h1>alt相場検索 買取リスト</h1><p>'+escape_(day)+'（日本時間）　合計 '+summary.total+'枚</p><table><thead><tr><th>カード名</th><th>型番・収録弾</th><th>PSA</th><th>枚数</th></tr></thead><tbody>'+summary.items.map(x=>'<tr><td>'+escape_(x.name)+'</td><td>'+escape_(x.number)+'<br>'+escape_(x.set)+'</td><td>'+escape_(x.grade)+'</td><td class="num">'+x.quantity+'</td></tr>').join('')+'</tbody></table><p>出力時点：'+escape_(Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy/MM/dd HH:mm:ss'))+'</p></html>';
  const blob=HtmlService.createHtmlOutput(html).getAs(MimeType.PDF);
  return {name:'alt-purchases-'+day+'.pdf',base64:Utilities.base64Encode(blob.getBytes())};
}
