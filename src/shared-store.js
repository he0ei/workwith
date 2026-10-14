import {SUPABASE_URL,SUPABASE_KEY} from './config.js';
export class SharedStore{
 constructor(fetcher=(...args)=>fetch(...args),storage=sessionStorage,config={url:SUPABASE_URL,key:SUPABASE_KEY}){
  this.fetcher=fetcher;this.storage=storage;this.config=config;this.refreshing=null;this.recoveryPending=storage.getItem('workwith-recovery-pending')==='1';
  try{this.session=JSON.parse(storage.getItem('workwith-supabase-session')||'null');}catch{this.session=null;storage.removeItem('workwith-supabase-session');}
 }
 configured(){return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(this.config.url)&&Boolean(this.config.key);}
 saveSession(s){this.session={access_token:s.access_token,refresh_token:s.refresh_token,expires_at:s.expires_at||Math.floor(Date.now()/1000)+s.expires_in};this.storage.setItem('workwith-supabase-session',JSON.stringify(this.session));}
 clearSession(){this.session=null;this.storage.removeItem('workwith-supabase-session');this.recoveryPending=false;this.storage.removeItem('workwith-recovery-pending');}
 async http(path,body,token,method){
  if(!this.configured())throw Error('Supabase 프로젝트 연결 설정이 필요합니다. 관리자가 배포 설정을 확인하세요.');
  const r=await this.fetcher(this.config.url+path,{method:method||(body===undefined?'GET':'POST'),cache:'no-store',headers:{apikey:this.config.key,...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const text=await r.text();let value={};try{value=text?JSON.parse(text):{};}catch{throw Error('서버 응답 형식 오류');}
  if(!r.ok){const error=Error(value.error_description||value.msg||value.message||value.error||'서버 연결에 실패했습니다.');error.status=r.status;throw error;}return value;
 }
 async access(){
  if(!this.session) {const e=Error('로그인이 필요합니다.');e.status=401;throw e;}
  if(this.session.expires_at<=Date.now()/1000+60){
   if(!this.refreshing)this.refreshing=this.http('/auth/v1/token?grant_type=refresh_token',{refresh_token:this.session.refresh_token}).then(s=>this.saveSession(s)).catch(err=>{if(err.status===400||err.status===401)this.clearSession();throw err;}).finally(()=>{this.refreshing=null;});
   await this.refreshing;
  }
  return this.session.access_token;
 }
 async requestRecovery(email){return this.http('/auth/v1/recover?redirect_to='+encodeURIComponent('https://he0ei.github.io/workwith/'),{email});}
 async importRecovery(fragment){
  const p=new URLSearchParams(fragment.replace(/^#/,''));if(p.get('type')!=='recovery')return false;
  const access_token=p.get('access_token'),refresh_token=p.get('refresh_token'),expires_in=Number(p.get('expires_in'));
  if(!access_token||!refresh_token||!Number.isFinite(expires_in)||expires_in<=0)throw Error('복구 링크가 올바르지 않습니다. 새 링크를 요청하세요.');
  // Verify with Auth before accepting any token from the URL.
  const user=await this.http('/auth/v1/user',undefined,access_token);if(!user.id)throw Error('복구 계정을 확인할 수 없습니다.');
  this.saveSession({access_token,refresh_token,expires_in});this.recoveryPending=true;this.storage.setItem('workwith-recovery-pending','1');return true;
 }
 async updatePassword(password){
  if(!this.recoveryPending)throw Error('이메일의 복구 링크에서 다시 시작하세요.');
  if(typeof password!=='string'||password.length<8||password.length>128)throw Error('새 비밀번호는 8~128자로 입력하세요.');
  await this.http('/auth/v1/user',{password},await this.access(),'PUT');this.recoveryPending=false;this.storage.removeItem('workwith-recovery-pending');
 }
 async login(email,password){
  this.recoveryPending=false;this.storage.removeItem('workwith-recovery-pending');
  const s=await this.http('/auth/v1/token?grant_type=password',{email,password});this.saveSession(s);
  try{return await this.read();}catch(err){await this.logout().catch(()=>{});throw err;}
 }
 async logout(){try{if(this.session)await this.http('/auth/v1/logout?scope=local',{},await this.access());}finally{this.clearSession();}}
 async request(path,body){
  if(path==='status')return {configured:this.configured()};
  if(path==='setup')throw Error('Supabase Auth에서 관리자가 계정을 생성해야 합니다.');
  if(path==='state')return this.read();if(path==='version')return this.version();
  throw Error('지원하지 않는 요청입니다.');
 }
 async read(){return this.http('/rest/v1/rpc/workwith_snapshot',{},await this.access());}
 async version(){return this.http('/rest/v1/rpc/workwith_revision',{},await this.access());}
 async change(action,revision,baseVersion){return this.http('/functions/v1/workspace',{action,revision,baseVersion},await this.access());}
}
