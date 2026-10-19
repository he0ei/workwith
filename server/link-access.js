import {ApiError,mutate} from './workspace.js';
import {USERS} from '../src/model.js';
import {validAttachment,attachmentBytes,ATTACHMENT_BUCKET,TASK_ATTACHMENT_BUCKET,ATTACHMENT_TYPES,MAX_ATTACHMENT_BYTES} from '../src/attachments.js';
export function sharedLinkSnapshot(snapshot,member){const s=structuredClone(snapshot);s.state.tasks=s.state.tasks.map(t=>({...t,visibility:'shared'}));s.state.history=[];s.user=member;s.passwordChangeRequired=false;s.sharedLink=true;return s;}
export async function verifyWorkspaceLink(authorization,hash){
 if(!/^[a-f0-9]{64}$/.test(hash||''))return false;
 const token=authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];if(!token)return false;
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(x=>x.toString(16).padStart(2,'0')).join('');let difference=0;for(let i=0;i<64;i++)difference|=digest.charCodeAt(i)^hash.charCodeAt(i);return difference===0;
}
export async function handleWorkspaceLink(request,env,fetcher,headers){
 const reply=(body,status=200)=>Response.json(body,{status,headers:{...headers,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 try{
  if(env.WORKSPACE_PUBLIC_ACCESS!==true&&!await verifyWorkspaceLink(request.headers.get('Authorization'),env.WORKSPACE_LINK_SHA256))throw new ApiError(401,'유효한 비공개 접속 링크가 필요합니다.');
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw new ApiError(503,'공유 저장소 설정을 확인해 주세요.');
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new ApiError(415,'JSON 요청만 허용합니다.');
  // Bound the streamed body before parsing; a 5 MiB attachment expands under base64.
  const reader=request.body?.getReader();let size=0,chunks=[];if(reader)while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>8*1024*1024){await reader.cancel();throw new ApiError(413,'요청이 너무 큽니다.');}chunks.push(r.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,'요청 형식 오류');}
  const member=body.member||'jh';if(!USERS.some(u=>u.id===member))throw new ApiError(400,'작성 이름을 확인해 주세요.');
  const url=env.SUPABASE_URL,service=env.SUPABASE_SERVICE_ROLE_KEY;
  const adminHeaders={apikey:service,Authorization:'Bearer '+service};
  async function db(path,value){const r=await fetcher(url+path,{method:'POST',headers:{...adminHeaders,'Content-Type':'application/json'},body:JSON.stringify(value)});if(!r.ok)throw new ApiError(503,'공유 DB 작업을 완료하지 못했습니다.');return r.json();}
  const repository={load:async()=>sharedLinkSnapshot(await db('/rest/v1/rpc/workwith_snapshot',{}),member),commit:(p_revision,p_upserts,p_deletes)=>db('/rest/v1/rpc/workwith_commit',{p_revision,p_upserts,p_deletes})};
  if(body.op==='state')return reply(await repository.load());
  if(body.op==='version')return reply(await db('/rest/v1/rpc/workwith_revision',{}));
  if(body.op==='change'){
   if(body.action?.type==='task.save'&&body.action.value?.visibility!=='shared')throw new ApiError(400,'공통 링크에서는 모든 업무를 함께 공유합니다.');
   return reply(await mutate(repository,body,member,{sharedAccess:true}));
  }
  const attachment=body.attachment;
  if(body.op==='file.upload'){
   if(!['undefined','string'].includes(typeof body.taskId)||body.taskId!==undefined&&!/^[A-Za-z0-9_-]{1,100}$/.test(body.taskId))throw new ApiError(400,'업무 파일 경로 오류');
   if(typeof body.data!=='string'||body.data.length>Math.ceil(MAX_ATTACHMENT_BYTES/3)*4)throw new ApiError(400,'첨부 크기 오류');
   let binary;try{binary=Uint8Array.from(atob(body.data),c=>c.charCodeAt(0));}catch{throw new ApiError(400,'첨부 형식 오류');}
   await attachmentBytes({name:body.name,type:body.type,size:binary.length,arrayBuffer:async()=>binary.buffer});
   // A separate namespace; the browser cannot supply paths or buckets for uploads.
   const file={bucket:body.taskId?TASK_ATTACHMENT_BUCKET:ATTACHMENT_BUCKET,path:'00000000-0000-4000-8000-000000000000/'+(body.taskId?body.taskId+'/':'')+crypto.randomUUID()+'.'+ATTACHMENT_TYPES[body.type],name:body.name,type:body.type,size:binary.length};
   if(!validAttachment(file))throw new ApiError(400,'첨부 파일 정보 오류');
   const r=await fetcher(url+'/storage/v1/object/'+file.bucket+'/'+file.path,{method:'POST',headers:{...adminHeaders,'Content-Type':file.type,'x-upsert':'false'},body:binary});if(!r.ok)throw new ApiError(503,'파일 업로드에 실패했습니다.');return reply(file);
  }
  if(!['file.read','file.remove'].includes(body.op))throw new ApiError(400,'지원하지 않는 요청입니다.');
  if(!validAttachment(attachment))throw new ApiError(400,'첨부 파일 정보 오류');
  const snapshot=await repository.load(),referenced=[...snapshot.state.tasks,...snapshot.state.artifacts].some(x=>x.attachment?.bucket===attachment.bucket&&x.attachment?.path===attachment.path),staged=attachment.path.startsWith('00000000-0000-4000-8000-000000000000/');
  if(!referenced&&!staged)throw new ApiError(403,'워크스페이스에 연결된 파일만 접근할 수 있습니다.');
  if(body.op==='file.read'){
   const r=await fetcher(url+'/storage/v1/object/authenticated/'+attachment.bucket+'/'+attachment.path,{headers:adminHeaders});if(!r.ok)throw new ApiError(404,'파일을 찾을 수 없습니다.');return new Response(r.body,{headers:{...headers,'Cache-Control':'no-store','Content-Type':attachment.type,'Content-Disposition':'inline','X-Content-Type-Options':'nosniff'}});
  }
  const removal=await fetcher(url+'/storage/v1/object/'+attachment.bucket,{method:'DELETE',headers:{...adminHeaders,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[attachment.path]})});if(!removal.ok)throw new ApiError(503,'파일 삭제에 실패했습니다.');const removed=await removal.json();
  return reply(removed);
 }catch(e){return reply({error:e instanceof ApiError?e.message:'공유 링크 작업을 완료하지 못했습니다.'},e instanceof ApiError?e.status:400);}
}
