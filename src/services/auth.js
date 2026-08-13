import{CONFIG}from'../core/config.js';import{patch}from'../core/state.js';
const tg=window.Telegram?.WebApp;
export async function initAuth(){
 if(tg){tg.ready();tg.expand();}
 if(!window.firebase.apps?.length) window.firebase.initializeApp(window.SKIPPER_FIREBASE_CONFIG);
 window.db=window.firebase.database();window.storage=window.firebase.storage();
 const remembered=sessionStorage.getItem('skipper_guest')==='1';
 if(remembered){patch({authMode:'guest',ready:true});return null;}
 const initData=tg?.initData||'';
 if(!initData){patch({authMode:'guest',ready:true});return null;}
 try{const r=await fetch(`${CONFIG.apiBase}/telegramLogin`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({initData})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Telegram login failed');await window.firebase.auth().signInWithCustomToken(d.token);const snap=await window.db.ref(`users/${d.user.id}`).once('value');const u=snap.val();const user={id:d.user.id,...u.profile,role:u.access?.role||'user',rank:u.access?.rank||10,xp:u.stats?.xp||0,level:u.stats?.level||1,status:u.access?.status||'active'};patch({user,authMode:'telegram',ready:true});return user;}catch(e){console.error(e);patch({authMode:'error',ready:true,authError:e.message});return null;}
}
export function continueAsGuest(){sessionStorage.setItem('skipper_guest','1');patch({authMode:'guest',ready:true});}
export function startPresence(uid){if(!uid)return()=>{};let stopped=false;const tick=async()=>{if(stopped||!window.firebase?.auth()?.currentUser)return;try{const token=await window.firebase.auth().currentUser.getIdToken();await fetch(`${CONFIG.apiBase}/updatePresence`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:'{}'});}catch(e){console.debug('presence',e.message);}};tick();const timer=setInterval(tick,30000);return()=>{stopped=true;clearInterval(timer);};}
