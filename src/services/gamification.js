import{call}from'./api.js';export const gameResult=(gameId,score)=>call('recordGame',{gameId,score});
export const createThread=(channel,title,text)=>call('createForumThread',{channel,title,text});
export const replyThread=(threadId,text)=>call('replyForumThread',{threadId,text});
export const reactThread=(threadId,reaction='like')=>call('toggleForumReaction',{threadId,reaction});
