import{call}from'./api.js';
export const adminSetRole=(uid,role)=>call('adminSetRole',{uid,role});
export const adminModeratePost=(postId,decision,reason='')=>call('adminModeratePost',{postId,decision,reason});
export const adminSyncNews=()=>call('adminSyncNews');
export const adminSetSystem=patch=>call('adminSetSystem',patch);
export const adminSetUserStatus=(uid,status)=>call('adminSetUserStatus',{uid,status});
export const ownerDeleteUser=uid=>call('ownerDeleteUser',{uid});
export const ownerSnapshot=()=>call('ownerSnapshot');
