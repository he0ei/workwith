import {SUPABASE_URL,SUPABASE_KEY} from './config.js';
import {USERS} from './model.js';
import {attachmentBytes} from './attachments.js';
export class LinkStore{
 constructor(fetcher=(...args)=>fetch(...args),storage=sessionStorage,config={url:SUPABASE_URL,key:SUPABASE_KEY},page=location,history=window.history){
  this.fetcher=fetcher;this.storage=storage;this.config=config;this.linkAccess=true;
  this.importLink(page,history);this.member=storage.getItem('workwith-display-member')||'jh';if(!USERS.some(u=>u.id===this.member))this.member='jh';
  for(const key of ['workwith-supabase-session','workwith-recovery-pending'])storage.removeItem(key);
 }
 importLink(page=location,history=window.history){
  const token=new URLSearchParams(page.hash.slice(1)).get('access');
  if(token!==null){history.replaceState(null,'',page.pathname+page.search);if(/^[A-Za-z0-9_-]{43}$/.test(token))this.storage.setItem('workwith-shared-link',token);else this.storage.removeItem('workwith-shared-link');}
  this.token=this.storage.getItem('workwith-shared-link')||'';return token!==null;
 }
 configured(){return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(this.config.url)&&Boolean(this.config.key);}
 async request(body,binary=false){
  if(!this.configured())throw Error('공유 저장소 연결 설정이 필요합니다.');
  if(!/^[A-Za-z0-9_-]{43}$/.test(this.token)){const e=Error('팀의 비공개 접속 링크로 열어 주세요.');e.status=401;throw e;}
  const r=await this.fetcher(this.config.url+'/functions/v1/workspace',{method:'POST',cache:'no-store',referrerPolicy:'no-referrer',headers:{apikey:this.config.key,Authorization:'Bearer '+this.token,'Content-Type':'application/json'},body:JSON.stringify({...body,member:this.member})});
  if(!r.ok){const value=await r.json().catch(()=>({}));const e=Error(value.error||'공유 작업을 완료하지 못했습니다.');e.status=r.status;throw e;}
  return binary?r.blob():r.json();
 }
 read(){return this.request({op:'state'});}
 version(){return this.request({op:'version'});}
 change(action,revision,baseVersion){return this.request({op:'change',action,revision,baseVersion});}
 setMember(member){if(!USERS.some(u=>u.id===member))throw Error('작성 이름을 선택해 주세요.');this.member=member;this.storage.setItem('workwith-display-member',member);}
 async uploadAttachment(file,{taskId}={}){const bytes=await attachmentBytes(file);let data='';for(let i=0;i<bytes.length;i+=16384)data+=String.fromCharCode(...bytes.subarray(i,i+16384));return this.request({op:'file.upload',taskId,name:file.name,type:file.type,data:btoa(data)});}
 downloadAttachment(attachment){return this.request({op:'file.read',attachment},true);}
 async removeAttachment(attachment){const removed=await this.request({op:'file.remove',attachment});if(!Array.isArray(removed)||!removed.some(x=>x.name===attachment.path))throw Error('파일 삭제를 확인하지 못했습니다.');return removed;}
}
