import {safeUrl} from './core.mjs';
import {availabilityLabel} from './catalog.mjs';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function renderPendingDetail(element,p){
  const image=safeUrl(p.catalogImageUrl),url=safeUrl(p.url,{altOnly:true});
  const query=[p.nameEn||p.name,p.number.split('/')[0],p.setCode,'PSA '+p.grade].filter(Boolean).join(' ');
  const searchUrl='https://alt.xyz/browse?query='+encodeURIComponent(query);
  const message=p.checkState==='no_sales'?'このPSAグレードの公開欄に成約履歴がないことを確認しました。':p.checkState==='unavailable'?'この商品のPSAグレード別履歴を確認できていません。':p.checkState==='error'?'直近の取得に失敗しました。成約価格は未確認です。':p.url?'ALTの商品ページは見つかりました。成約価格はまだ確認できていません。':'カード一覧には登録済みです。対応するALTの商品ページをまだ照合できていません。';
  const checked=p.checkedAt?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'short'}).format(new Date(p.checkedAt)):'未確認';
  element.innerHTML=`<div class="detail-head"><div class="detail-topline"><div class="detail-tags"><span class="tag grade">PSA ${escapeHtml(p.grade)}</span><span class="tag rarity">${escapeHtml(p.rarity)}</span><span class="tag">日本語</span></div><a class="source-link" href="${escapeHtml(url||searchUrl)}" target="_blank" rel="noopener noreferrer">${url?'ALTで見る':'ALTで検索'} ↗</a></div><h2>${escapeHtml(p.name)}</h2><p class="detail-subtitle">${escapeHtml([p.number,p.set,p.setCode].filter(Boolean).join(' / '))}</p><div class="overview"><div class="product-image">${image?`<img src="${escapeHtml(image)}" alt="${escapeHtml(p.name)} カード単体の参考画像" referrerpolicy="no-referrer"><small class="image-caption">参考画像（カード単体）</small>`:'<div class="no-image">画像なし</div>'}</div><div class="latest"><div class="latest-label">直近の成約価格</div><div class="pending-heading">${escapeHtml(availabilityLabel(p))}</div><p class="pending-description">${message}</p></div></div><dl class="detail-facts"><div><dt>鑑定グレード</dt><dd>PSA ${escapeHtml(p.grade)}</dd></div><div><dt>収録した取引</dt><dd>0件</dd></div><div><dt>履歴の確認日時</dt><dd>${escapeHtml(checked)}</dd></div></dl></div><section class="history-section"><div class="history-title"><h3>最近の取引</h3></div><p class="history-empty">確認できた成約履歴がありません。</p><div class="provenance">カード一覧：<a href="${escapeHtml(safeUrl(p.catalogSource))}" target="_blank" rel="noopener noreferrer">収録弾別一覧</a><br>出品価格は成約価格に含めていません。</div></section>`;
  element.querySelector('img')?.addEventListener('error',e=>{e.target.parentElement.innerHTML='<div class="no-image">画像を表示できません</div>';});
}
