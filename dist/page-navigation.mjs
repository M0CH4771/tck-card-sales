const link=document.getElementById('back-to-top');
const batchBar=document.getElementById('batch-bar');
function updateTopLink(){
 link.hidden=window.scrollY<320;
 const rect=batchBar?.getBoundingClientRect();
 const visible=rect&&rect.height>0&&rect.bottom>0&&rect.top<window.innerHeight;
 const bottom=visible?Math.max(20,window.innerHeight-rect.top+12):20;
 link.style.setProperty('--back-top-bottom',bottom+'px');
}
let scheduled=false;
function scheduleUpdate(){
 if(scheduled)return;scheduled=true;
 requestAnimationFrame(()=>{scheduled=false;updateTopLink();});
}
window.addEventListener('scroll',scheduleUpdate,{passive:true});
window.addEventListener('resize',scheduleUpdate);
if(batchBar&&typeof ResizeObserver!=='undefined')new ResizeObserver(scheduleUpdate).observe(batchBar);
updateTopLink();
