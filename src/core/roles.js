export const ROLES={
 owner:{rank:100,label:'Владелец',color:'gold',permissions:['*']},
 superadmin:{rank:90,label:'Суперадмин',color:'violet',permissions:['users.manage','moderation.manage','content.manage','reports.manage','analytics.read','system.manage']},
 admin:{rank:80,label:'Администратор',color:'red',permissions:['users.manage.limited','moderation.manage','content.manage','reports.manage','analytics.read']},
 security_admin:{rank:78,label:'Админ безопасности',color:'amber',permissions:['reports.manage','audit.read','security.manage']},
 content_lead:{rank:75,label:'Руководитель контента',color:'blue',permissions:['content.manage','moderation.publish_official','content.sources']},
 content_creator:{rank:72,label:'Контент-мейкер',color:'cyan',permissions:['content.create','content.media','analytics.read.own']},
 moderator_lead:{rank:65,label:'Старший модератор',color:'pink',permissions:['moderation.manage','reports.manage']},
 moderator:{rank:60,label:'Модератор',color:'orange',permissions:['moderation.queue','reports.review']},
 community_manager:{rank:55,label:'Комьюнити',color:'green',permissions:['community.manage','events.manage']},
 analyst:{rank:50,label:'Аналитик',color:'indigo',permissions:['analytics.read']},
 support:{rank:40,label:'Поддержка',color:'slate',permissions:['support.manage']},
 game_master:{rank:38,label:'Game Master',color:'lime',permissions:['games.manage']},
 user:{rank:10,label:'Пилот',color:'blue',permissions:['community.basic']}
};
export const roleInfo=r=>ROLES[r]||ROLES.user; export const can=(role,permission)=>role==='owner'||(roleInfo(role).permissions||[]).includes(permission);
