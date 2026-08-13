if(!window.SKIPPER_FIREBASE_CONFIG)throw new Error('SKIPPER_FIREBASE_CONFIG is missing');
if(!firebase.apps.length)firebase.initializeApp(window.SKIPPER_FIREBASE_CONFIG);
export const auth=firebase.auth();
export const db=firebase.database();
export const storage=firebase.storage();
