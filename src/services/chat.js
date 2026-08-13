import{patch}from'../core/state.js';import{call}from'./api.js';
export async function openDirect(otherUid){const d=await call('createDirectChat',{otherUid});patch({activeChat:d.chatId,route:'messages'});return d.chatId;}
export async function sendMessage(chatId,receiverId,text){return call('sendMessage',{chatId,receiverId,text});}
export function watchChat(chatId){if(!chatId)return()=>{};const ref=window.db.ref(`chats/${chatId}/messages`).limitToLast(100);const fn=s=>patch({chatMessages:Object.entries(s.val()||{}).map(([id,v])=>({id,...v})).sort((a,b)=>Date.parse(a.createdAt||0)-Date.parse(b.createdAt||0))});ref.on('value',fn);return()=>ref.off('value',fn);}
export function watchMyChats(uid){if(!uid)return()=>{};const ref=window.db.ref(`userChats/${uid}`).limitToLast(100);const fn=s=>{const index=s.val()||{};const chats=Object.entries(index).map(([id,v])=>({id,...v})).sort((a,b)=>Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0));patch({chats});};ref.on('value',fn);return()=>ref.off('value',fn);}
export function watchTyping(chatId,otherUid){if(!chatId||!otherUid)return()=>{};const ref=window.db.ref(`typing/${chatId}/${otherUid}`);const fn=s=>patch({typingUid:s.val()?.typing?otherUid:null});ref.on('value',fn);return()=>ref.off('value',fn);}
export const setTyping=(chatId,typing)=>call('setTyping',{chatId,typing});
export const markChatRead=(chatId)=>call('markChatRead',{chatId});
