import {USERS} from '../src/model.js';
import {digest,passwordHash,randomToken,equal,session,rateLimit,cookie} from './auth.js';
import {ApiError,load,publicState,mutate} from './data.js';
const json=(value,status=200,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}});
async function body(request){if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new ApiError(415,'JSON 요청만 허용합니다.');const text=await request.text();if(text.length>100000)throw new ApiError(413,'요청이 너무 큽니다.');try{return JSON.parse(text);}catch{throw new ApiError(400,'요청 형식 오류');}}
export default {async fetch(request,env){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
 const origin=request.headers.get('Origin'),allowed=!origin||origin===url.origin||origin===env.ALLOWED_ORIGIN;
 const headers={'Vary':'Origin'};if(origin&&allowed){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Credentials']='true';}
 if(!allowed)return json({error:'허용되지 않은 사이트입니다.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'86400'}});
 try{
  if(!env.DB)throw new ApiError(503,'D1 데이터베이스 연결을 설정해야 합니다.');
  const db=env.DB,path=url.pathname;
  if(path==='/api/status'&&request.method==='GET'){
   const r=await db.prepare('SELECT COUNT(*) AS count FROM users').first();return json({configured:r.count===USERS.length},200,headers);
  }
  if(path==='/api/setup'&&request.method==='POST'){
   if(!env.SETUP_TOKEN||env.SETUP_TOKEN.length<32)throw new ApiError(503,'관리자가 Worker의 SETUP_TOKEN Secret을 먼저 설정해야 합니다.');
   const b=await body(request);if(!equal(b.token,env.SETUP_TOKEN))throw new ApiError(403,'설정 코드가 올바르지 않습니다.');
   if((await db.prepare('SELECT COUNT(*) AS count FROM users').first()).count)throw new ApiError(409,'이미 계정 설정이 완료되었습니다.');
   if(!Array.isArray(b.users)||b.users.length!==USERS.length||new Set(b.users.map(u=>u.id)).size!==USERS.length||b.users.some(u=>!USERS.some(x=>x.id===u.id)||typeof u.password!=='string'||u.password.length<12||u.password.length>128))throw new ApiError(400,'네 사용자 모두 12~128자의 개별 비밀번호를 설정하세요.');
   const statements=[];for(const u of b.users){const salt=randomToken();statements.push(db.prepare('INSERT INTO users(id,salt,password_hash) VALUES(?,?,?)').bind(u.id,salt,await passwordHash(u.password,salt)));}
   await db.batch(statements);return json({ok:true},200,headers);
  }
  if(path==='/api/login'&&request.method==='POST'){
   if(!await rateLimit(request,db))throw new ApiError(429,'로그인 시도가 너무 많습니다. 다음 시간대에 다시 시도하세요.');
   const b=await body(request);if(typeof b.password!=='string'||b.password.length>128)throw new ApiError(401,'사용자 또는 비밀번호를 확인하세요.');
   const u=await db.prepare('SELECT * FROM users WHERE id=?').bind(typeof b.user==='string'?b.user:'').first();
   const hash=await passwordHash(b.password,u?.salt||'invalid-user-salt');if(!u||!equal(hash,u.password_hash))throw new ApiError(401,'사용자 또는 비밀번호를 확인하세요.');
   const token=randomToken(),expires=Date.now()+28800000;
   await db.batch([db.prepare('DELETE FROM sessions WHERE expires<=?').bind(Date.now()),db.prepare('DELETE FROM login_attempts WHERE expires<=?').bind(Date.now()),db.prepare('INSERT INTO sessions(hash,user_id,expires) VALUES(?,?,?)').bind(await digest(token),u.id,expires)]);
   return json({user:u.id,token,expires},200,{...headers,'Set-Cookie':cookie(token)});
  }
  const auth=await session(request,db);if(!auth)throw new ApiError(401,'로그인이 필요하거나 세션이 만료되었습니다.');
  if(path==='/api/logout'&&request.method==='POST'){await db.prepare('DELETE FROM sessions WHERE hash=?').bind(auth.hash).run();return json({ok:true},200,{...headers,'Set-Cookie':cookie('',0)});}
  if(path==='/api/version'&&request.method==='GET')return json(await db.prepare('SELECT revision FROM workspace WHERE id=1').first(),200,headers);
  if(path==='/api/state'&&request.method==='GET')return json(publicState(await load(db),auth.user_id),200,headers);
  if(path==='/api/change'&&request.method==='POST')return json(await mutate(db,await body(request),auth.user_id),200,headers);
  throw new ApiError(404,'API 경로가 없습니다.');
 }catch(err){return json({error:err instanceof ApiError?err.message:'서버 또는 DB를 확인해야 합니다. 저장을 완료하지 못했습니다.'},err.status||503,headers);}
}};
