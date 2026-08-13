import{closeModal,getState,openModal}from'../core/state.js';import{navigate}from'../core/router.js';
import{esc,formatDate,initials}from'../core/utils.js';
import{addComment,watchComments,markAllNotificationsRead}from'../services/data.js';import{gameResult as saveGameResult}from'../services/gamification.js';
import{toast}from'./toast.js';
let commentStop=null;
let activeGame=null;
const QUIZES={
  quiz:{title:'Aviation Quiz',questions:[
    {q:'Какой код ИКАО используется для аэропорта Шереметьево?',a:['UUEE','UUDD','ULLI'],ok:0},
    {q:'Что означает GNSS spoofing?',a:['Имитация/подмена навигационного сигнала','Потеря радиосвязи','Обледенение крыла'],ok:0},
    {q:'Какой орган является специализированным учреждением ООН по международной гражданской авиации?',a:['ICAO','IATA','EASA'],ok:0}
  ]},
  icao:{title:'ICAO Challenge',questions:[
    {q:'Сколько государств-членов у ICAO?',a:['193','180','220'],ok:0},
    {q:'Какой документ ICAO является частью международной системы SARPs?',a:['Annexes','METAR','NOTAM'],ok:0}
  ]}
};
export function renderModal(){const m=getState().modal;if(!m)return'';if(m.type==='onboarding')return onboarding();if(m.type==='notifications')return notice();if(m.type==='global-search')return search();if(m.type==='comments')return comments(m.postId);if(m.type==='game')return game(m.gameId);if(m.type==='game-result')return gameResult(m);return'';}
function onboarding(){return `<div class="modal-backdrop"><div class="modal-card onboarding"><div class="modal-emoji">🐧</div><span class="eyebrow darktext">WELCOME ABOARD</span><h2>Шкипер начинается с тебя</h2><p>Гостевой режим предназначен только для просмотра. Открой Mini App из Telegram, чтобы получить реальный аккаунт, экипаж, XP, чаты и достижения.</p><a class="btn primary" href="${esc(getState().channel||'#')}" target="_blank" rel="noopener">Открыть канал</a><button class="btn ghost" data-close-modal>Остаться гостем</button></div></div>`;}
function notice(){const s=getState();return `<div class="modal-backdrop"><div class="modal-card side-modal"><div class="modal-head"><div><span class="eyebrow darktext">INBOX</span><h2>Уведомления</h2></div><div class="modal-head-actions">${s.notifications.some(n=>!n.read)?'<button class="btn small" id="readAll">Прочитать всё</button>':''}<button class="icon-btn" data-close-modal>✕</button></div></div>${s.notifications.map(n=>`<article class="notification ${n.read?'':'unread'}"><div>${esc(n.icon||'🔔')}</div><div><b>${esc(n.title||'Уведомление')}</b><p>${esc(n.body||n.text||'')}</p><small>${formatDate(n.createdAt)}</small></div></article>`).join('')||'<div class="empty"><b>🔔</b><strong>Пока пусто</strong><span>Новые события появятся здесь.</span></div>'}</div></div>`;}
function search(){return `<div class="modal-backdrop"><div class="modal-card wide"><div class="modal-head"><div><span class="eyebrow darktext">GLOBAL SEARCH</span><h2>Поиск по Skipper</h2></div><button class="icon-btn" data-close-modal>✕</button></div><div class="search"><span>⌕</span><input id="globalSearchInput" autofocus placeholder="Публикация или пилот…"></div><div id="globalSearchResults" class="search-results"><div class="empty"><b>⌕</b><strong>Начни вводить</strong></div></div></div></div>`;}
function comments(postId){const p=getState().posts.find(x=>x.id===postId),items=window.__skipperComments||[];return `<div class="modal-backdrop"><div class="modal-card wide"><div class="modal-head"><div><span class="eyebrow darktext">DISCUSSION</span><h2>${esc(p?.title||'Обсуждение')}</h2></div><button class="icon-btn" data-close-modal>✕</button></div><div id="commentsBox" class="comments-box">${items.map(commentItem).join('')||'<div class="empty"><b>💬</b><strong>Пока тихо</strong><span>Стань первым участником обсуждения.</span></div>'}</div>${getState().authMode==='telegram'?`<form id="commentForm" class="comment-form"><textarea id="commentInput" maxlength="600" placeholder="Напиши комментарий…"></textarea><div class="comment-foot"><small>600 символов</small><button class="btn primary">Отправить</button></div></form>`:'<div class="callout">🔐 Для комментариев нужен подтверждённый Telegram-аккаунт.</div>'}</div></div>`;}
function game(id){const cfg=QUIZES[id];const meta={quiz:{title:'Aviation Quiz',icon:'✦'},icao:{title:'ICAO Challenge',icon:'◈'}}[id];if(!cfg)return ''; activeGame={id,index:0,score:0};const q=cfg.questions[0];return quizMarkup(cfg,q,0);}
function quizMarkup(cfg,q,index){return `<div class="modal-backdrop"><div class="modal-card"><div class="modal-head"><div><span class="eyebrow darktext">SKIPPER PLAY · ${index+1}/${cfg.questions.length}</span><h2>${esc(cfg.title)}</h2></div><button class="icon-btn" data-close-modal>✕</button></div><div class="quiz"><div class="quiz-progress"><i style="width:${((index+1)/cfg.questions.length)*100}%"></i></div><div class="quiz-q">${esc(q.q)}</div>${q.a.map((x,i)=>`<button data-answer="${i}" data-correct="${q.ok}">${esc(x)}</button>`).join('')}</div></div></div>`;}
function gameResult(m){return `<div class="modal-backdrop"><div class="modal-card result-card"><div class="result-emoji">🏆</div><span class="eyebrow darktext">MISSION COMPLETE</span><h2>${esc(m.title||'Результат')}</h2><div class="result-score">${Number(m.score||0)} <span>баллов</span></div><p>${esc(m.message||'Результат сохранён в профиле.')}</p><button class="btn primary" data-close-modal>Продолжить</button></div></div>`;}
function commentItem(c){const u=getState().profiles?.[c.authorId]||{};return `<article class="comment"><div class="avatar mini">${u?.photo?`<img src="${esc(u.photo)}" alt="">`:esc(initials(u?.name||'Пилот'))}</div><div><b>${esc(u?.name||'Пилот')}</b><small>${formatDate(c.createdAt)}</small><p>${esc(c.text)}</p></div></article>`;}
function searchResults(q){const s=getState(),query=q.trim().toLowerCase(),box=document.getElementById('globalSearchResults');if(!box)return;if(!query){box.innerHTML='<div class="empty"><b>⌕</b><strong>Начни вводить</strong></div>';return;}const us=Object.entries(s.profiles||{}).map(([id,u])=>({id,...u})).filter(u=>`${u.name} ${u.username}`.toLowerCase().includes(query)).slice(0,8),ps=s.posts.filter(p=>`${p.title} ${p.text} ${p.category}`.toLowerCase().includes(query)).slice(0,8);box.innerHTML=[...us.map(u=>`<button class="search-result" data-route="crew" data-close-modal><b>👤 ${esc(u.name)}</b><span>${u.username?'@'+esc(u.username):'участник'} · ${Number(u.xp||0)} XP</span></button>`),...ps.map(p=>`<button class="search-result" data-route="feed" data-close-modal><b>📰 ${esc(p.title)}</b><span>${esc(p.category||'авиация')} · ${formatDate(p.createdAt)}</span></button>`)].join('')||'<div class="empty"><b>⌕</b><strong>Ничего не найдено</strong></div>';}
export function bindModalActions(){
  const overlay=document.getElementById('overlay');
  if(!overlay)return;
  overlay.onclick=async e=>{
    if(e.target.classList.contains('modal-backdrop')){closeModal();return;}
    if(e.target.closest('[data-close-modal]')){
      const route=e.target.closest('[data-route]')?.dataset.route;
      closeModal();
      if(route)navigate(route);
      return;
    }
    if(e.target.id==='readAll'){
      await markAllNotificationsRead(getState().user?.id);
      closeModal();
      return;
    }
    const g=e.target.closest('[data-game]');
    if(g){openModal({type:'game',gameId:g.dataset.game});return;}
    const c=e.target.closest('[data-comments]');
    if(c){
      openModal({type:'comments',postId:c.dataset.comments});
      if(commentStop)commentStop();
      commentStop=watchComments(c.dataset.comments,items=>{
        window.__skipperComments=items;
        const box=document.getElementById('commentsBox');
        if(box)box.innerHTML=items.map(commentItem).join('')||'<div class="empty"><b>💬</b><strong>Пока тихо</strong></div>';
      });
      return;
    }
    const ans=e.target.closest('[data-answer]');
    if(ans&&activeGame){
      const cfg=QUIZES[activeGame.id];
      const correct=Number(ans.dataset.correct),chosen=Number(ans.dataset.answer);
      if(chosen===correct)activeGame.score+=100;
      activeGame.index+=1;
      if(activeGame.index>=cfg.questions.length){
        const score=activeGame.score;
        try{await saveGameResult(activeGame.id,score);}catch(err){toast(err.message,'error');}
        openModal({type:'game-result',title:cfg.title,score,message:`${score/100} из ${cfg.questions.length} правильных ответов. Результат сохранён.`});
        activeGame=null;
      }else{
        const q=cfg.questions[activeGame.index];
        overlay.innerHTML=quizMarkup(cfg,q,activeGame.index);
      }
      return;
    }
  };
  overlay.oninput=e=>{if(e.target.id==='globalSearchInput')searchResults(e.target.value);};
  overlay.onsubmit=async e=>{
    if(e.target.id!=='commentForm')return;
    e.preventDefault();
    const input=document.getElementById('commentInput');
    try{await addComment(getState().modal.postId,input.value);input.value='';toast('Комментарий отправлен 💬','success');}
    catch(err){toast(err.message,'error');}
  };
}
export function destroyModalBindings(){if(commentStop){commentStop();commentStop=null;}window.__skipperComments=[];activeGame=null;const overlay=document.getElementById('overlay');if(overlay){overlay.onclick=null;overlay.oninput=null;overlay.onsubmit=null;}}
