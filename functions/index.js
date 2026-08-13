const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');
const NEWS = require('../data/official-news.json');

admin.initializeApp();
const db = admin.database();
const BOT = defineSecret('SKIPPER_BOT_TOKEN');
const OWNER_TELEGRAM_ID = defineSecret('SKIPPER_OWNER_TELEGRAM_ID');

const ROLES = Object.freeze({
  owner:{rank:100,label:'Владелец'},
  superadmin:{rank:90,label:'Суперадмин'},
  admin:{rank:80,label:'Администратор'},
  security_admin:{rank:78,label:'Админ безопасности'},
  content_lead:{rank:75,label:'Руководитель контента'},
  content_creator:{rank:72,label:'Контент-мейкер'},
  editor:{rank:70,label:'Редактор'},
  moderator_lead:{rank:65,label:'Старший модератор'},
  moderator:{rank:60,label:'Модератор'},
  community_manager:{rank:55,label:'Комьюнити-менеджер'},
  analyst:{rank:50,label:'Аналитик'},
  support:{rank:40,label:'Поддержка'},
  game_master:{rank:38,label:'Game Master'},
  user:{rank:10,label:'Пилот'},
  guest:{rank:0,label:'Гость'}
});
const ROLE_RANK = Object.fromEntries(Object.entries(ROLES).map(([k,v]) => [k,v.rank]));
const XP_RULES = Object.freeze({
  publish: { amount: 30, daily: 5 },
  comment: { amount: 5, daily: 30 },
  message: { amount: 2, daily: 50 },
  game: { amount: 10, daily: 20 },
  daily: { amount: 10, daily: 1 }
});

const rankOf = role => ROLE_RANK[role] ?? 0;
const nowIso = () => new Date().toISOString();
const dayKey = () => new Date().toISOString().slice(0,10);

function safeText(v,max){ return String(v ?? '').trim().slice(0,max); }

function checkTelegramInitData(initData, botToken){
  const params = new URLSearchParams(initData || '');
  const hash = params.get('hash');
  if(!hash) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256','WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256',secret).update(dataCheckString).digest('hex');
  if(expected.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(hash))) return null;
  const authDate = Number(params.get('auth_date') || 0);
  const age = Math.floor(Date.now()/1000) - authDate;
  if(!authDate || age < -300 || age > 86400) return null;
  try { return JSON.parse(params.get('user') || '{}'); } catch { return null; }
}

async function actor(req, minRank = 0){
  const h = req.get('authorization') || '';
  if(!h.startsWith('Bearer ')) throw Object.assign(new Error('Authentication required'),{status:401});
  let decoded;
  try{ decoded = await admin.auth().verifyIdToken(h.slice(7), true); }
  catch { throw Object.assign(new Error('Authentication required'),{status:401}); }
  const snap = await db.ref(`users/${decoded.uid}/access`).once('value');
  const access = snap.val() || { role:'user', rank:10, status:'active' };
  const role = ROLE_RANK[access.role] != null ? access.role : 'user';
  const rank = rankOf(role);
  const status = access.status || 'active';const settings=await db.ref('system/settings').once('value');const systemSettings=settings.val()||{};
  if(systemSettings.maintenance && rank<60) throw Object.assign(new Error('Система временно находится на техническом обслуживании'),{status:503});
  if(status === 'suspended') throw Object.assign(new Error('Account suspended'),{status:403});
  if(status === 'restricted' && rank < 50) throw Object.assign(new Error('Account restricted'),{status:403});
  if(rank < minRank) throw Object.assign(new Error('Insufficient permissions'),{status:403});
  return { uid:decoded.uid, role, rank, status };
}

async function audit(uid, action, target, meta = {}){
  return db.ref('adminAudit').push({ uid, action, target, meta, createdAt:nowIso() });
}

async function notify(uid, payload){
  if(!uid) return;
  await db.ref(`notifications/${uid}`).push({ ...payload, read:false, createdAt:nowIso() });
}

async function grantXp(uid, reason, eventId){
  const rule=XP_RULES[reason];if(!rule||!uid||!eventId)return{ok:false,amount:0};const settings=(await db.ref('system/settings').once('value')).val()||{};const multiplier=Math.max(0.1,Math.min(5,Number(settings.xpMultiplier)||1));const amount=Math.max(1,Math.round(rule.amount*multiplier));
  const ledgerRef=db.ref(`xpLedger/${uid}/${dayKey()}/${eventId}`);let duplicate=false;
  const tx=await ledgerRef.transaction(v=>{if(v!==null){duplicate=true;return v;}return{reason,createdAt:nowIso()};});
  if(duplicate||!tx.committed)return{ok:false,amount:0,reason:'duplicate'};
  const countRef=db.ref(`xpDaily/${uid}/${dayKey()}/${reason}`);let allowed=false;let newCount=0;
  const countTx=await countRef.transaction(v=>{const n=Number(v||0);if(n>=rule.daily){newCount=n;return v;}allowed=true;newCount=n+1;return newCount;});
  if(!allowed||!countTx.committed){await ledgerRef.remove();return{ok:false,amount:0,reason:'daily_limit'};}
  const statsRef=db.ref(`users/${uid}/stats`);let after={};
  await statsRef.transaction(s=>{s=s||{xp:0,level:1,messages:0,comments:0,games:0,posts:0};s.xp=Math.max(0,Number(s.xp||0))+amount;s.level=Math.max(1,Math.floor(s.xp/100)+1);if(reason==='publish')s.posts=Number(s.posts||0)+1;if(reason==='comment')s.comments=Number(s.comments||0)+1;if(reason==='message')s.messages=Number(s.messages||0)+1;if(reason==='game')s.games=Number(s.games||0)+1;after=s;return s;});
  await db.ref(`publicProfiles/${uid}`).update({xp:Number(after.xp||0),level:Number(after.level||1)});
  return{ok:true,amount,xp:Number(after.xp||0),level:Number(after.level||1),dailyCount:newCount};
}
function writeError(res,e){ console.error(e); return res.status(e.status || 500).json({error:e.message || 'Internal error'}); }

exports.telegramLogin = onRequest({region:'europe-west1',cors:true,secrets:[BOT,OWNER_TELEGRAM_ID]}, async(req,res)=>{
  try{
    if(req.method !== 'POST') return res.status(405).json({error:'POST only'});
    const u = checkTelegramInitData(req.body?.initData, BOT.value());
    if(!u?.id) return res.status(401).json({error:'Invalid Telegram initData'});
    await ensureOfficialCatalog();
    const uid = `tg_${u.id}`;
    const ref = db.ref(`users/${uid}`);
    const systemSettings=(await db.ref('system/settings').once('value')).val()||{};
    if(systemSettings.allowRegistration===false){const already=(await ref.once('value')).exists();const ownerTelegramId=String(OWNER_TELEGRAM_ID.value()||'').trim();if(!already && String(u.id)!==ownerTelegramId)return res.status(403).json({error:'Регистрация новых пользователей временно закрыта'});}
    const snap = await ref.once('value');
    const old = snap.val() || {};
    const ownerTelegramId = String(OWNER_TELEGRAM_ID.value() || '').trim();
    const isConfiguredOwner = (ownerTelegramId && String(u.id) === ownerTelegramId) || (existingOwner.exists() && existingOwner.val() === uid);
    const existingOwner = await db.ref('privateSystem/ownerUid').once('value');
    if (isConfiguredOwner && existingOwner.exists() && existingOwner.val() !== uid) return res.status(409).json({error:'Owner account already bound to another Telegram account'});
    const oldRole = old.access?.role || old.role || 'user';
    const role = isConfiguredOwner ? 'owner' : (ROLE_RANK[oldRole] != null && oldRole !== 'owner' ? oldRole : 'user');
    const timestamp = nowIso();
    const profile = {
      name:[u.first_name,u.last_name].filter(Boolean).join(' ') || 'Пилот',
      username:u.username || '',
      photo:u.photo_url || '',
      bio:old.profile?.bio || ''
    };
    const xp = Number(old.stats?.xp ?? old.xp ?? 0);
    const level = Math.max(1, Math.floor(xp/100)+1);
    const user = {
      profile,
      access:{ role, rank:ROLE_RANK[role], status:old.access?.status||'active' },
      stats:{ ...(old.stats||{}), xp, level },
      meta:{ ...(old.meta||{}), telegramId:u.id, provider:'telegram', createdAt:old.meta?.createdAt||timestamp, lastSeenAt:timestamp }
    };
    await ref.set(user);
    if (isConfiguredOwner) await db.ref('privateSystem/ownerUid').set(uid);
    await db.ref(`publicProfiles/${uid}`).update({
      name:profile.name, username:profile.username, photo:profile.photo, bio:profile.bio,
      role, rank:ROLE_RANK[role], xp, level, lastSeenAt:timestamp
    });
    const token = await admin.auth().createCustomToken(uid,{telegramId:u.id,role,rank:ROLE_RANK[role]});
    return res.json({token,user:{id:uid,...profile,role,rank:ROLE_RANK[role],xp,level}});
  }catch(e){return writeError(res,e);}
});

exports.createDirectChat = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{
    const me = await actor(req,10);
    const otherUid = safeText(req.body?.otherUid,128);
    if(!otherUid || otherUid === me.uid) return res.status(400).json({error:'Invalid participant'});
    const exists = await db.ref(`publicProfiles/${otherUid}`).once('value');
    if(!exists.exists()) return res.status(404).json({error:'User not found'});
    const chatId = [me.uid,otherUid].sort().join('_');
    const ref = db.ref(`chats/${chatId}`);
    const snap = await ref.once('value');
    const timestamp=nowIso();if(!snap.exists()) await ref.set({type:'direct',members:{[me.uid]:true,[otherUid]:true},createdAt:timestamp,updatedAt:timestamp});
    const other=(await db.ref(`publicProfiles/${otherUid}`).once('value')).val()||{};
    const mine=(await db.ref(`publicProfiles/${me.uid}`).once('value')).val()||{};
    const index={id:chatId,otherUid,otherName:other.name||'Пилот',otherPhoto:other.photo||'',updatedAt:timestamp};
    const reverseIndex={id:chatId,otherUid:me.uid,otherName:mine.name||'Пилот',otherPhoto:mine.photo||'',updatedAt:timestamp};
    await db.ref().update({[`userChats/${me.uid}/${chatId}`]:index,[`userChats/${otherUid}/${chatId}`]:reverseIndex});
    return res.json({ok:true,chatId});
  }catch(e){return writeError(res,e);}
});

exports.sendMessage = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{
    const me = await actor(req,10);
    const settings=(await db.ref('system/settings').once('value')).val()||{};if(settings.messageMode==='closed' && me.rank<60)return res.status(403).json({error:'Личные сообщения закрыты'});const {chatId,receiverId} = req.body || {};
    const text = safeText(req.body?.text,4000);
    if(!chatId || !receiverId || !text) return res.status(400).json({error:'Invalid message'});
    const chat = (await db.ref(`chats/${chatId}`).once('value')).val();
    if(!chat?.members?.[me.uid] || !chat?.members?.[receiverId]) return res.status(403).json({error:'Not a chat member'});
    const msgRef = db.ref(`chats/${chatId}/messages`).push();
    await msgRef.set({senderId:me.uid,receiverId,text,createdAt:nowIso()});
    const timestamp=nowIso();await db.ref(`chats/${chatId}/updatedAt`).set(timestamp);
    const mine=(await db.ref(`publicProfiles/${me.uid}`).once('value')).val()||{};const receiver=(await db.ref(`publicProfiles/${receiverId}`).once('value')).val()||{};
    await db.ref(`userChats/${me.uid}/${chatId}`).update({updatedAt:timestamp,lastMessage:text.slice(0,160),otherUid:receiverId,otherName:receiver.name||'Пилот',otherPhoto:receiver.photo||''});
    const receiverIndexRef=db.ref(`userChats/${receiverId}/${chatId}`);await receiverIndexRef.update({updatedAt:timestamp,lastMessage:text.slice(0,160),otherUid:me.uid,otherName:mine.name||'Пилот',otherPhoto:mine.photo||''});await receiverIndexRef.child('unread').transaction(v=>Number(v||0)+1);
    await notify(receiverId,{type:'message',title:'Новое сообщение',body:text.slice(0,120),chatId});
    await grantXp(me.uid,'message',msgRef.key);
    return res.json({ok:true,messageId:msgRef.key});
  }catch(e){return writeError(res,e);}
});

exports.createPost = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{
    const me = await actor(req,10);
    const title=safeText(req.body?.title,160), text=safeText(req.body?.text,12000), category=safeText(req.body?.category||'авиация',64);
    if(!title || !text) return res.status(400).json({error:'Title and text are required'});
    const postRef = db.ref('posts').push();
    const settings=(await db.ref('system/settings').once('value')).val()||{};
    const directPublish=settings.requireModeration===false && me.rank>=70;
    const timestamp=nowIso();await postRef.set({id:postRef.key,type:'community',title,text,category,authorId:me.uid,status:directPublish?'published':'pending',createdAt:timestamp,publishedAt:directPublish?timestamp:null,sourceType:'community',moderatedBy:directPublish?me.uid:null});if(!directPublish)await db.ref(`moderation/${postRef.key}`).set({targetType:'post',targetId:postRef.key,status:'pending',authorId:me.uid,createdAt:timestamp});
    if(directPublish) await grantXp(me.uid,'publish',postRef.key);
    await notify(me.uid,{type:'moderation',title:'Материал принят',body:'Публикация отправлена на проверку',postId:postRef.key});
    return res.json({ok:true,postId:postRef.key});
  }catch(e){return writeError(res,e);}
});


exports.togglePostReaction = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{const me=await actor(req,10);const postId=safeText(req.body?.postId,128);const reaction=['like','fire','insight'].includes(req.body?.reaction)?req.body.reaction:'like';if(!postId)return res.status(400).json({error:'Invalid post'});const post=await db.ref(`posts/${postId}`).once('value');if(!post.exists()||post.val()?.status!=='published')return res.status(404).json({error:'Post not available'});const ref=db.ref(`postReactions/${postId}/${me.uid}`);const old=await ref.once('value');if(old.exists()){await ref.remove();await db.ref(`postStats/${postId}/likes`).transaction(v=>Math.max(0,Number(v||0)-1));return res.json({ok:true,active:false});}await ref.set({reaction,createdAt:nowIso()});await db.ref(`postStats/${postId}/likes`).transaction(v=>Number(v||0)+1);return res.json({ok:true,active:true});}
  catch(e){return writeError(res,e);}
});

exports.addComment = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{
    const me=await actor(req,10);const postId=safeText(req.body?.postId,128);const text=safeText(req.body?.text,600);
    if(!postId||!text)return res.status(400).json({error:'Invalid comment'});
    const ps=await db.ref(`posts/${postId}`).once('value');
    if(!ps.exists()||ps.val()?.status!=='published')return res.status(404).json({error:'Post not available'});
    const ref=db.ref(`comments/${postId}`).push();
    await ref.set({authorId:me.uid,text,createdAt:nowIso()});
    await grantXp(me.uid,'comment',ref.key);
    const authorId=ps.val()?.authorId;if(authorId&&authorId!==me.uid)await notify(authorId,{type:'comment',title:'Новый комментарий',body:text.slice(0,120),postId});
    return res.json({ok:true,commentId:ref.key});
  }catch(e){return writeError(res,e);}
});

exports.recordGame = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{
    const me=await actor(req,10);const gameId=safeText(req.body?.gameId,64);const score=Math.max(0,Math.min(100000,Number(req.body?.score)||0));
    if(!gameId)return res.status(400).json({error:'Invalid game'});
    const ref=db.ref(`gameScores/${gameId}/${me.uid}`);
    let best=score;await ref.transaction(v=>{const cur=Number(v?.score||0);best=Math.max(cur,score);return{score:best,updatedAt:nowIso()};});
    const xp=await grantXp(me.uid,'game',`${gameId}:${dayKey()}`);
    await audit(me.uid,'game_score',gameId,{score,best});
    return res.json({ok:true,score,best, xp});
  }catch(e){return writeError(res,e);}
});

exports.createReport = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{
    const me=await actor(req,10);const targetType=safeText(req.body?.targetType,32);const targetId=safeText(req.body?.targetId,128);const reason=safeText(req.body?.reason,64);const details=safeText(req.body?.details,1000);
    if(!targetType||!targetId||!reason)return res.status(400).json({error:'Invalid report'});
    const ref=db.ref('reports').push();await ref.set({reporterId:me.uid,targetType,targetId,reason,details,status:'open',createdAt:nowIso()});
    await db.ref('system/counters/openReports').transaction(v=>Number(v||0)+1);
    return res.json({ok:true,reportId:ref.key});
  }catch(e){return writeError(res,e);}
});


exports.createForumThread = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{
    const me=await actor(req,10);const channel=safeText(req.body?.channel,32),title=safeText(req.body?.title,140),text=safeText(req.body?.text,12000);
    const allowed=['safety','ops','sim','tech','community'];
    if(!allowed.includes(channel)||!title||!text)return res.status(400).json({error:'Invalid thread'});
    const ref=db.ref('forumThreads').push();
    await ref.set({id:ref.key,channel,title,text,authorId:me.uid,status:'pending',replyCount:0,reactionCount:0,createdAt:nowIso(),updatedAt:nowIso()});
    await db.ref(`moderation/${ref.key}`).set({targetType:'forumThread',targetId:ref.key,status:'pending',authorId:me.uid,createdAt:nowIso()});
    await notify(me.uid,{type:'moderation',title:'Тред принят',body:'Тред отправлен на модерацию',threadId:ref.key});
    return res.json({ok:true,threadId:ref.key});
  }catch(e){return writeError(res,e);}
});

exports.replyForumThread = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{
    const me=await actor(req,10);const threadId=safeText(req.body?.threadId,128),text=safeText(req.body?.text,1200);if(!threadId||!text)return res.status(400).json({error:'Invalid reply'});
    const t=(await db.ref(`forumThreads/${threadId}`).once('value')).val();if(!t||t.status!=='published')return res.status(404).json({error:'Thread not available'});
    const ref=db.ref(`forumThreads/${threadId}/replies`).push();await ref.set({authorId:me.uid,text,createdAt:nowIso()});
    await db.ref(`forumThreads/${threadId}/replyCount`).transaction(v=>Number(v||0)+1);await db.ref(`forumThreads/${threadId}/updatedAt`).set(nowIso());
    if(t.authorId&&t.authorId!==me.uid)await notify(t.authorId,{type:'forum_reply',title:'Новый ответ в треде',body:text.slice(0,120),threadId});
    await grantXp(me.uid,'comment',ref.key);return res.json({ok:true,replyId:ref.key});
  }catch(e){return writeError(res,e);}
});

exports.toggleForumReaction = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{
    const me=await actor(req,10);const threadId=safeText(req.body?.threadId,128),reaction=['like','fire','insight'].includes(req.body?.reaction)?req.body.reaction:'like';
    const t=await db.ref(`forumThreads/${threadId}`).once('value');if(!t.exists()||t.val()?.status!=='published')return res.status(404).json({error:'Thread not available'});
    const ref=db.ref(`forumReactions/${threadId}/${me.uid}`);const old=await ref.once('value');
    if(old.exists()) {await ref.remove();await db.ref(`forumThreads/${threadId}/reactionCount`).transaction(v=>Math.max(0,Number(v||0)-1));return res.json({ok:true,active:false});}
    await ref.set({reaction,createdAt:nowIso()});await db.ref(`forumThreads/${threadId}/reactionCount`).transaction(v=>Number(v||0)+1);return res.json({ok:true,active:true});
  }catch(e){return writeError(res,e);}
});

exports.markNotificationRead = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{const me=await actor(req,10);const id=safeText(req.body?.id,128);if(!id)return res.status(400).json({error:'Invalid notification'});const ref=db.ref(`notifications/${me.uid}/${id}`);const snap=await ref.once('value');if(!snap.exists())return res.status(404).json({error:'Notification not found'});await ref.update({read:true,readAt:nowIso()});return res.json({ok:true});}
  catch(e){return writeError(res,e);}
});

exports.markChatRead = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{const me=await actor(req,10);const chatId=safeText(req.body?.chatId,128);if(!chatId)return res.status(400).json({error:'Invalid chat'});const chat=(await db.ref(`chats/${chatId}`).once('value')).val();if(!chat?.members?.[me.uid])return res.status(403).json({error:'Not a member'});await db.ref(`userChats/${me.uid}/${chatId}/unread`).set(0);return res.json({ok:true});}
  catch(e){return writeError(res,e);}
});

exports.updatePresence = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{const me=await actor(req,10);const stamp=nowIso();await db.ref(`presence/${me.uid}`).set({online:true,lastSeenAt:stamp});await db.ref(`users/${me.uid}/meta/lastSeenAt`).set(stamp);await db.ref(`publicProfiles/${me.uid}/lastSeenAt`).set(stamp);return res.json({ok:true});}
  catch(e){return writeError(res,e);}
});

exports.setTyping = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{const me=await actor(req,10);const chatId=safeText(req.body?.chatId,128),typing=!!req.body?.typing;if(!chatId)return res.status(400).json({error:'Invalid chat'});const chat=(await db.ref(`chats/${chatId}`).once('value')).val();if(!chat?.members?.[me.uid])return res.status(403).json({error:'Not a member'});await db.ref(`typing/${chatId}/${me.uid}`).set(typing?{typing:true,at:nowIso()}:null);return res.json({ok:true});}
  catch(e){return writeError(res,e);}
});

exports.adminDashboard = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{
    const me=await actor(req,50);const [users,posts,reports,moderation]=await Promise.all([db.ref('users').once('value'),db.ref('posts').once('value'),db.ref('reports').once('value'),db.ref('moderation').once('value')]);
    const us=users.val()||{},ps=posts.val()||{},rs=reports.val()||{},ms=moderation.val()||{};
    const staff=Object.entries(us).map(([uid,v])=>({uid,name:v?.profile?.name||'Пилот',username:v?.profile?.username||'',role:v?.access?.role||'user',rank:Number(v?.access?.rank||10),xp:Number(v?.stats?.xp||0),lastSeenAt:v?.meta?.lastSeenAt||null})).filter(x=>x.rank>10).sort((a,b)=>b.rank-a.rank);
    return res.json({ok:true,viewer:{uid:me.uid,role:me.role,rank:me.rank},counters:{users:Object.keys(us).length,posts:Object.keys(ps).length,openReports:Object.values(rs).filter(x=>x?.status==='open').length,pendingModeration:Object.values(ms).filter(x=>x?.status==='pending').length,online:Object.values(us).filter(x=>x?.meta?.lastSeenAt&&Date.now()-new Date(x.meta.lastSeenAt).getTime()<300000).length},staff});
  }catch(e){return writeError(res,e);}
});

exports.adminResolveReport = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{
    const me=await actor(req,60);const reportId=safeText(req.body?.reportId,128);const status=['resolved','dismissed','escalated'].includes(req.body?.status)?req.body.status:null;const note=safeText(req.body?.note,500);
    if(!reportId||!status)return res.status(400).json({error:'Invalid report resolution'});
    const ref=db.ref(`reports/${reportId}`);const snap=await ref.once('value');if(!snap.exists())return res.status(404).json({error:'Report not found'});
    await ref.update({status,note,resolvedBy:me.uid,resolvedAt:nowIso()});
    if(snap.val().status==='open')await db.ref('system/counters/openReports').transaction(v=>Math.max(0,Number(v||0)-1));
    await audit(me.uid,'resolve_report',reportId,{status,note});return res.json({ok:true});
  }catch(e){return writeError(res,e);}
});

exports.adminModeratePost = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{
    const me=await actor(req,60);
    const {postId,decision}=req.body||{};
    const reason=safeText(req.body?.reason,500);
    if(!postId || !['published','rejected'].includes(decision)) return res.status(400).json({error:'Invalid moderation request'});
    const ref=db.ref(`posts/${postId}`),snap=await ref.once('value');
    if(!snap.exists()) return res.status(404).json({error:'Post not found'});
    const post=snap.val();
    if(me.rank<70 && decision==='published' && post.sourceType==='official') return res.status(403).json({error:'Only editors can publish official content'});
    const moderatedAt=nowIso();await ref.update({status:decision,moderatedAt,moderatedBy:me.uid,moderationReason:reason,publishedAt:decision==='published'?moderatedAt:null});await db.ref(`moderation/${postId}`).update({status:decision,moderatedAt,moderatedBy:me.uid,reason});
    if(decision==='published') await grantXp(post.authorId,'publish',postId);
    if(post.authorId) await notify(post.authorId,{type:'moderation',title:decision==='published'?'Материал опубликован':'Материал отклонён',body:reason || (decision==='published'?'Ваш материал опубликован':'Материал не прошёл модерацию'),postId});
    await audit(me.uid,'moderate_post',postId,{decision,reason});
    return res.json({ok:true});
  }catch(e){return writeError(res,e);}
});

exports.adminSetRole = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{
    const me=await actor(req,80);
    const {uid,role}=req.body||{};
    if(!uid || ROLE_RANK[role]==null) return res.status(400).json({error:'Invalid user or role'});
    const target=(await db.ref(`users/${uid}/access`).once('value')).val()||{};
    const targetRank=rankOf(target.role);
    if(uid===me.uid) return res.status(403).json({error:'You cannot change your own rank'});
    if(target.role==='owner' || role==='owner') return res.status(403).json({error:'Owner rank is reserved for the single system owner'});
    if(targetRank>=me.rank || rankOf(role)>=me.rank) return res.status(403).json({error:'Cannot manage equal or higher ranks'});
    if(me.rank<90 && rankOf(role)>=80) return res.status(403).json({error:'Only superadmin/owner can assign admin ranks'});
    const access={role,rank:rankOf(role),updatedAt:nowIso(),updatedBy:me.uid};
    await db.ref(`users/${uid}/access`).set(access);
    await db.ref(`publicProfiles/${uid}`).update({role,rank:rankOf(role)});
    await notify(uid,{type:'role',title:'Изменён ранг',body:`Ваш новый ранг: ${ROLES[role].label}`});
    await audit(me.uid,'set_role',uid,{role,rank:rankOf(role)});
    return res.json({ok:true,role,rank:rankOf(role)});
  }catch(e){return writeError(res,e);}
});

exports.adminSetUserStatus = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{
    const me=await actor(req,80);const uid=safeText(req.body?.uid,128);const status=['active','restricted','suspended'].includes(req.body?.status)?req.body.status:null;
    if(!uid||!status)return res.status(400).json({error:'Invalid user or status'});
    if(uid===me.uid)return res.status(403).json({error:'Cannot change your own status'});
    const ref=db.ref(`users/${uid}/access`);const snap=await ref.once('value');if(!snap.exists())return res.status(404).json({error:'User not found'});
    const access=snap.val()||{};const targetRank=rankOf(access.role);if(targetRank>=me.rank)return res.status(403).json({error:'Cannot manage equal or higher rank'});
    await ref.update({status,updatedAt:nowIso(),updatedBy:me.uid});await db.ref(`publicProfiles/${uid}`).update({status});await notify(uid,{type:'account',title:'Статус аккаунта изменён',body:`Новый статус: ${status}`});await audit(me.uid,'set_user_status',uid,{status});return res.json({ok:true,status});
  }catch(e){return writeError(res,e);}
});

exports.ownerDeleteUser = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{
    const me=await actor(req,100);const uid=safeText(req.body?.uid,128);if(!uid||uid===me.uid)return res.status(400).json({error:'Invalid target'});
    const access=(await db.ref(`users/${uid}/access`).once('value')).val()||{};if(access.role==='owner')return res.status(403).json({error:'Owner cannot be deleted'});
    const paths=[`users/${uid}`,`publicProfiles/${uid}`,`notifications/${uid}`,`presence/${uid}`,`userChats/${uid}`,`xpLedger/${uid}`,`xpDaily/${uid}`];const updates={};for(const path of paths)updates[path]=null;
    const chats=(await db.ref(`userChats/${uid}`).once('value')).val()||{};for(const chatId of Object.keys(chats)){const chat=(await db.ref(`chats/${chatId}`).once('value')).val()||{};updates[`chats/${chatId}`]=null;updates[`typing/${chatId}`]=null;for(const memberUid of Object.keys(chat.members||{})){updates[`userChats/${memberUid}/${chatId}`]=null;}}
    await db.ref().update(updates);try{await admin.auth().deleteUser(uid);}catch(e){if(e?.code!=='auth/user-not-found')throw e;}await audit(me.uid,'delete_user',uid,{});return res.json({ok:true});
  }catch(e){return writeError(res,e);}
});

exports.ownerSnapshot = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{const me=await actor(req,100);const [users,profiles,posts,threads,reports,notifications,system,privateSystem,chats,userChats,moderation,auditLog,gameScores,xpLedger,xpDaily,comments,postReactions,postStats,typing,presence]=await Promise.all([db.ref('users').once('value'),db.ref('publicProfiles').once('value'),db.ref('posts').once('value'),db.ref('forumThreads').once('value'),db.ref('reports').once('value'),db.ref('notifications').once('value'),db.ref('system').once('value'),db.ref('privateSystem').once('value'),db.ref('chats').once('value'),db.ref('userChats').once('value'),db.ref('moderation').once('value'),db.ref('adminAudit').limitToLast(500).once('value'),db.ref('gameScores').once('value'),db.ref('xpLedger').once('value'),db.ref('xpDaily').once('value'),db.ref('comments').once('value'),db.ref('postReactions').once('value'),db.ref('postStats').once('value'),db.ref('typing').once('value'),db.ref('presence').once('value')]);
    let authUsers=[];let pageToken;do{const page=await admin.auth().listUsers(1000,pageToken);authUsers.push(...page.users.map(u=>({uid:u.uid,email:u.email||'',disabled:u.disabled,createdAt:u.metadata.creationTime,lastSignInAt:u.metadata.lastSignInTime||null,providerIds:u.providerData.map(p=>p.providerId)})));pageToken=page.pageToken;}while(pageToken);
    await audit(me.uid,'owner_snapshot','system',{});return res.json({ok:true,generatedAt:nowIso(),authUsers,users:users.val()||{},publicProfiles:profiles.val()||{},posts:posts.val()||{},forumThreads:threads.val()||{},reports:reports.val()||{},notifications:notifications.val()||{},system:system.val()||{},privateSystem:privateSystem.val()||{},chats:chats.val()||{},userChats:userChats.val()||{},moderation:moderation.val()||{},adminAudit:auditLog.val()||{},gameScores:gameScores.val()||{},xpLedger:xpLedger.val()||{},xpDaily:xpDaily.val()||{},comments:comments.val()||{},postReactions:postReactions.val()||{},postStats:postStats.val()||{},typing:typing.val()||{},presence:presence.val()||{}});}catch(e){return writeError(res,e);}
});

exports.ownerEditPost = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{const me=await actor(req,100);const postId=safeText(req.body?.postId,128);const title=safeText(req.body?.title,160);const text=safeText(req.body?.text,12000);if(!postId||!title||!text)return res.status(400).json({error:'Invalid post data'});const ref=db.ref(`posts/${postId}`);const snap=await ref.once('value');if(!snap.exists())return res.status(404).json({error:'Post not found'});await ref.update({title,text,updatedAt:nowIso(),updatedBy:me.uid});await audit(me.uid,'owner_edit_post',postId,{});return res.json({ok:true});}catch(e){return writeError(res,e);}
});
exports.ownerDeletePost = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{const me=await actor(req,100);const postId=safeText(req.body?.postId,128);if(!postId)return res.status(400).json({error:'Invalid post'});const exists=await db.ref(`posts/${postId}`).once('value');if(!exists.exists())return res.status(404).json({error:'Post not found'});const updates={[`posts/${postId}`]:null,[`moderation/${postId}`]:null,[`comments/${postId}`]:null,[`postReactions/${postId}`]:null};await db.ref().update(updates);await audit(me.uid,'owner_delete_post',postId,{});return res.json({ok:true});}catch(e){return writeError(res,e);}
});

exports.adminSetSystem = onRequest({region:'europe-west1'}, async(req,res)=>{
  try{
    const me=await actor(req,90);
    const b=req.body||{};
    const patch={maintenance:!!b.maintenance,feedMode:b.feedMode==='official-only'?'official-only':'mixed',allowRegistration:b.allowRegistration!==false,requireModeration:b.requireModeration!==false,messageMode:['open','crew-only','closed'].includes(b.messageMode)?b.messageMode:'open',xpMultiplier:Math.max(0.1,Math.min(5,Number(b.xpMultiplier)||1)),updatedAt:nowIso(),updatedBy:me.uid};
    await db.ref('system/settings').update(patch);
    await audit(me.uid,'set_system','system',patch);
    return res.json({ok:true,settings:patch});
  }catch(e){return writeError(res,e);}
});

function stripHtml(html){return String(html||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();}
function parseDateNear(text){
  const m=text.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})\b|\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i);
  if(!m)return null;
  if(m[1]){const y=Number(m[3])<100?2000+Number(m[3]):Number(m[3]);return `${y}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[1])).padStart(2,'0')}`;}
  const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  return `${m[6]}-${String(months[m[5].slice(0,3).toLowerCase()]).padStart(2,'0')}-${String(Number(m[4])).padStart(2,'0')}`;
}
async function fetchLiveHeadlines(url,publisher){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const r=await fetch(url,{signal:controller.signal,headers:{'user-agent':'Skipper-Ecosystem/13.0 (+official-feed-sync)'}});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const html=await r.text();const re=/<a[^>]+href=["']([^"']*\/news[^"']*)["'][^>]*>([\s\S]{5,500}?)<\/a>/gi;const out=[];let m;
    while((m=re.exec(html))&&out.length<20){
      const title=stripHtml(m[2]);const href=m[1].startsWith('http')?m[1]:new URL(m[1],url).href;if(!title||title.length<12||title.length>240)continue;
      const windowText=stripHtml(html.slice(Math.max(0,m.index-900),Math.min(html.length,m.index+900)));const date=parseDateNear(windowText);if(!date)continue;
      const id=`${publisher.toLowerCase()}-live-${crypto.createHash('sha1').update(href).digest('hex').slice(0,12)}`;
      out.push({id,publisher,title,publishedAt:date,category:'Официальные новости',sourceUrl:href,summary:'Заголовок и дата получены непосредственно с официальной страницы источника.',sourceType:'official-live',status:'published'});
    }
    return out;
  }finally{clearTimeout(timer);}
}
async function collectOfficialNews(){
  const merged=[...NEWS];
  try{merged.push(...await fetchLiveHeadlines('https://www.icao.int/news','ICAO'));}catch(e){console.warn('ICAO live sync failed',e.message);}
  try{merged.push(...await fetchLiveHeadlines('https://www.easa.europa.eu/en/newsroom-and-events/news','EASA'));}catch(e){console.warn('EASA live sync failed',e.message);}
  try{merged.push(...await fetchLiveHeadlines('https://www.eurocontrol.int/newsroom','EUROCONTROL'));}catch(e){console.warn('EUROCONTROL live sync failed',e.message);}
  const byUrl=new Map();for(const n of merged)byUrl.set(n.sourceUrl||n.id,n);return [...byUrl.values()].sort((a,b)=>String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0,80);
}
async function ensureOfficialCatalog(){const marker=await db.ref('system/contentSync/seedVersion').once('value');if(marker.exists()&&marker.val()==='v12')return;const list=NEWS.map(n=>({...n,sourceType:'official-curated',status:'published',verified:true}));await upsertOfficialNews(list);await db.ref('system/contentSync/seedVersion').set('v13');}
async function upsertOfficialNews(list){
  const writes={};
  for(const n of list){writes[`posts/${n.id}`]={...n,id:n.id,authorId:`source_${String(n.publisher).toLowerCase()}`,type:'official',sourceType:n.sourceType||'official',status:'published',createdAt:`${n.publishedAt}T09:00:00.000Z`,updatedAt:nowIso(),publishedAt:`${n.publishedAt}T09:00:00.000Z`};}
  writes['publicProfiles/source_icao']={name:'International Civil Aviation Organization',username:'ICAO',photo:'',bio:'Официальный источник ICAO',role:'official',rank:1000,xp:0,level:1};
  writes['publicProfiles/source_easa']={name:'European Union Aviation Safety Agency',username:'EASA',photo:'',bio:'Официальный источник EASA',role:'official',rank:1000,xp:0,level:1};
  writes['publicProfiles/source_eurocontrol']={name:'EUROCONTROL',username:'EUROCONTROL',photo:'',bio:'Официальный источник EUROCONTROL',role:'official',rank:1000,xp:0,level:1};
  writes['system/contentSync']={sources:['ICAO','EASA','EUROCONTROL'],count:list.length,lastSyncAt:nowIso(),mode:'live-official-with-curated-fallback'};
  await db.ref().update(writes);return list.length;
}
exports.adminSyncNews=onRequest({region:'europe-west1'},async(req,res)=>{try{const me=await actor(req,70);const list=await collectOfficialNews();const count=await upsertOfficialNews(list);await audit(me.uid,'sync_official_news','system',{count,mode:'live'});return res.json({ok:true,count,lastSyncAt:nowIso()});}catch(e){return writeError(res,e);}});
exports.syncOfficialNews=onSchedule({schedule:'every 6 hours',region:'europe-west1'},async()=>{const list=await collectOfficialNews();const count=await upsertOfficialNews(list);console.log(`Official live sync: ${count}`);});

exports.recalculateLevels = onSchedule({schedule:'every 6 hours',region:'europe-west1'}, async()=>{
  const snap=await db.ref('users').once('value');const updates={};
  for(const [uid,u] of Object.entries(snap.val()||{})){
    const xp=Number(u?.stats?.xp||0),level=Math.max(1,Math.floor(xp/100)+1);
    updates[`users/${uid}/stats/xp`]=xp;updates[`users/${uid}/stats/level`]=level;
    updates[`publicProfiles/${uid}/xp`]=xp;updates[`publicProfiles/${uid}/level`]=level;
  }
  if(Object.keys(updates).length) await db.ref().update(updates);
});
