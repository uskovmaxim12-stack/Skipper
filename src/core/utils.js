export const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
export const timeAgo=iso=>{const t=new Date(iso).getTime();if(!t)return'';const s=Math.max(0,(Date.now()-t)/1000);if(s<60)return'сейчас';if(s<3600)return`${Math.floor(s/60)} мин`;if(s<86400)return`${Math.floor(s/3600)} ч`;return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short'}).format(new Date(iso));};
export const initials=n=>String(n||'Ш').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'Ш';
export const formatNum=n=>new Intl.NumberFormat('ru-RU').format(Number(n||0));

export const debounce=(fn,ms=200)=>{let t;return (...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms);};};
export const formatDate=iso=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',year:'numeric'}).format(d);};
