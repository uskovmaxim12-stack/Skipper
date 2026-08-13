const state={route:'home',user:null,authMode:'loading',posts:[],profiles:{},officialMetrics:null,notifications:[],chats:[],activeChat:null,chatMessages:[],typingUid:null,forumTab:'all',filters:{query:'',category:'all'},crewQuery:'',modal:null,system:null,onlineCount:0};
const listeners=new Set();
export const getState=()=>state;
export const patch=p=>{Object.assign(state,p);listeners.forEach(fn=>fn(state));};
export const subscribe=fn=>(listeners.add(fn),()=>listeners.delete(fn));
export const openModal=modal=>patch({modal});export const closeModal=()=>patch({modal:null});
