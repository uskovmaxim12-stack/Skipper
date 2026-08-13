import{patch,getState}from'./state.js';
const valid=new Set(['home','feed','forum','crew','messages','games','profile','settings']);
export function navigate(route){if(!valid.has(route))route='home';if(getState().route===route)return;history.pushState({route},'',`#${route}`);patch({route,activeChat:route==='messages'?getState().activeChat:null});}
export function initRouter(){addEventListener('popstate',()=>patch({route:valid.has(location.hash.slice(1))?location.hash.slice(1):'home'}));const initial=location.hash.slice(1);if(valid.has(initial))patch({route:initial});}
export function bindRouter(root){root.addEventListener('click',e=>{const a=e.target.closest('[data-route]');if(a){e.preventDefault();navigate(a.dataset.route)}})}
