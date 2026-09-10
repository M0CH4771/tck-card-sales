// Only visible population controls; no application state or internal API access.
export function readPopulation(){
 const main=document.querySelector('main');
 if(!main)return {grades:[],selected:''};
 const label=[...main.querySelectorAll('span')].find(e=>/^PSA population$/i.test(e.textContent.trim()));
 if(!label)return {grades:[],selected:''};
 const buttons=[...label.parentElement.querySelectorAll('button')].filter(e=>e.getClientRects().length);
 const controls=buttons.map(e=>{
  const grade=e.querySelector('span')?.textContent.trim()||'';
  const style=getComputedStyle(e);
  const selected=Number(style.borderBottomWidth.replace('px',''))>0&&style.borderBottomStyle==='solid'&&style.borderBottomColor==='rgb(124, 80, 252)';
  return {grade,selected};
 }).filter(x=>/^\d+(?:\.5)?$/.test(x.grade));
 const selected=controls.filter(c=>c.selected);
 return {grades:controls.map(c=>c.grade),selected:selected.length===1?selected[0].grade:''};
}

export function historySignature(raw){
 return JSON.stringify({rows:raw.rows,noSales:raw.noSales});
}

// A new selection alone is insufficient: old transaction rows may still be visible.
export function freshGradeHistory(raw,population,grade,before,sawLoading){
 return population.selected===grade&&raw.historyReady&&
  (before===null||sawLoading||historySignature(raw)!==before);
}
