import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const roots=['src','functions'];
const files=[];
function walk(d){for(const n of fs.readdirSync(d)){const p=path.join(d,n);const st=fs.statSync(p);if(st.isDirectory())walk(p);else if(p.endsWith('.js'))files.push(p);}}
for(const r of roots)walk(r);
if(fs.existsSync('src/modules/forum.js.tmp'))throw new Error('Temporary source file remains: src/modules/forum.js.tmp');
for(const f of files){const txt=fs.readFileSync(f,'utf8');if(!txt.trim())throw new Error(`Empty JS: ${f}`);execFileSync(process.execPath,['--check',f],{stdio:'ignore'});if(txt.includes('callFunction'))throw new Error(`Unknown API helper remains in ${f}`);}
for(const f of ['database.rules.json','firebase.json','package.json','functions/package.json','manifest.webmanifest','data/official-news.json'])JSON.parse(fs.readFileSync(f,'utf8'));
const catalog=JSON.parse(fs.readFileSync('data/official-news.json','utf8'));
if(catalog.length<50||catalog.length>70)throw new Error(`Official catalog size must be 50..70, got ${catalog.length}`);
if(new Set(catalog.map(x=>x.id)).size!==catalog.length)throw new Error('Duplicate catalog IDs');
if(catalog.some(x=>x.status!=='published'||x.verified!==true))throw new Error('Catalog contains non-published or unverified seed records');
const router=fs.readFileSync('src/core/router.js','utf8');if(!router.includes("'feed'"))throw new Error('Feed route missing');
const state=fs.readFileSync('src/core/state.js','utf8');if(!state.includes('filters:'))throw new Error('Feed filters state missing');
const chatRules=JSON.parse(fs.readFileSync('database.rules.json','utf8')).rules;if(!chatRules.userChats || !chatRules.postStats)throw new Error('userChats security index missing');
const api=fs.readFileSync('src/services/api.js','utf8');if(!api.includes('authorization'))throw new Error('API auth header missing');
console.log(`Checked ${files.length} JS files.`);
console.log(`Checked official catalog: ${catalog.length} real-source records.`);
console.log('Router/state/security smoke checks: OK.');
console.log('Configuration JSON: OK.');

const source=fs.readFileSync('functions/index.js','utf8');
const exportsSet=new Set([...source.matchAll(/^exports\.([A-Za-z0-9_]+)\s*=/gm)].map(m=>m[1]));
const allText=[...files, 'admin.html'].map(f=>fs.readFileSync(f,'utf8')).join('\n');
const apiRefs=new Set([...allText.matchAll(/call\(['\"]([A-Za-z0-9_]+)['\"]/g)].map(m=>m[1]));
const missing=[...apiRefs].filter(x=>!exportsSet.has(x));
if(missing.length) throw new Error(`Frontend endpoint coverage: missing ${missing.join(', ')}`);
const forbidden=allText.match(/\b(?:mock|fake|lorem ipsum|TODO|FIXME)\b/ig)||[];
if(forbidden.length) throw new Error(`Forbidden placeholder markers detected: ${[...new Set(forbidden)].join(', ')}`);
console.log(`Endpoint coverage: ${apiRefs.size} frontend calls / ${exportsSet.size} exports`);
