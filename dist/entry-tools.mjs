
export function kanaGroup(name){
 const first=String(name).normalize('NFKC').normalize('NFD').replace(/[\u3099\u309a]/g,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).trim()[0]||'';
 for(const [group,letters] of Object.entries({あ:'あいうえおぁぃぅぇぉ',か:'かきくけこ',さ:'さしすせそ',た:'たちつてとっ',な:'なにぬねの',は:'はひふへほ',ま:'まみむめも',や:'やゆよゃゅょ',ら:'らりるれろ',わ:'わをんゎ'}))if(letters.includes(first))return group;
 return '他';
}
export const draftKey=(cardId,grade)=>cardId+':'+grade;
export function validQuantity(value){return Number.isInteger(value)&&value>=1&&value<=1000;}
export function draftSummary(drafts){
 const values=[...drafts.values()],active=values.filter(x=>validQuantity(x.quantity));
 return {cards:new Set(active.map(x=>x.cardId)).size,entries:active.length,total:active.reduce((n,x)=>n+x.quantity,0),invalid:values.some(x=>x.quantity!==0&&!validQuantity(x.quantity))};
}
export function acknowledgeDrafts(drafts,operations){
 for(const op of operations){const key=draftKey(op.cardId,op.grade),draft=drafts.get(key);if(draft&&draft.revision===op.revision)drafts.delete(key);}
}
