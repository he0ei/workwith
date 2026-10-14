import {mkdir,copyFile,cp,rm,writeFile,readFile} from 'node:fs/promises';
import './build-functions.mjs';
const url=process.env.SUPABASE_URL||'',key=process.env.SUPABASE_PUBLISHABLE_KEY||'';
if(Boolean(url)!==Boolean(key))throw Error('Supabase URL과 공개 키를 함께 설정하세요.');
if(url&&!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))throw Error('올바른 Supabase Project URL이 필요합니다.');
if(key){
 let anon=false;try{anon=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon';}catch{}
 if(!key.startsWith('sb_publishable_')&&!anon)throw Error('publishable/anon 키만 허용합니다. secret/service_role 키를 넣지 마세요.');
}
if(process.env.REQUIRE_SUPABASE==='true'&&(!url||!key))throw Error('GitHub Variables에 Supabase URL과 공개 키를 먼저 등록하세요.');
const dist=new URL('../dist/',import.meta.url);await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
let html=await readFile(new URL('../index.html',import.meta.url),'utf8');if(url)html=html.replace("connect-src 'self'","connect-src 'self' "+url);
await writeFile(new URL('index.html',dist),html);await cp(new URL('../src/',import.meta.url),new URL('src/',dist),{recursive:true});
await writeFile(new URL('src/config.js',dist),`export const SUPABASE_URL=${JSON.stringify(url)};\nexport const SUPABASE_KEY=${JSON.stringify(key)};\n`);
await writeFile(new URL('.nojekyll',dist),'');console.log('Build complete: dist/ (GitHub Pages, static assets only)');
