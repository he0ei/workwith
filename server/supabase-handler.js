import {ApiError,mutate} from './workspace.js';
const json=(body,status,headers)=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
export async function handle(request,env,fetcher=fetch){
 const origin=request.headers.get('Origin'),allowed=env.APP_ORIGIN;
 const headers={'Vary':'Origin'};
 if(origin&&origin!==allowed)return json({error:'허용되지 않은 사이트입니다.'},403,headers);
 if(origin){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization, apikey, content-type, x-client-info';headers['Access-Control-Allow-Methods']='POST, OPTIONS';}
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return json({error:'POST 요청만 허용합니다.'},405,headers);
 try{
  const url=env.SUPABASE_URL,service=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!service)throw new ApiError(503,'프로젝트 설정을 확인해야 합니다.');
  const authorization=request.headers.get('Authorization');
  if(!authorization?.startsWith('Bearer '))throw new ApiError(401,'로그인이 필요합니다.');
  const auth=await fetcher(url+'/auth/v1/user',{headers:{apikey:service,Authorization:authorization}});
  if(!auth.ok)throw new ApiError(401,'세션이 만료되었거나 로그인 정보가 올바르지 않습니다.');
  const user=await auth.json();if(typeof user.id!=='string')throw new ApiError(401,'인증 정보 오류');
  async function db(path,body){
   const r=await fetcher(url+path,{method:body===undefined?'GET':'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
   if(!r.ok)throw new ApiError(503,'공유 DB 작업을 완료하지 못했습니다.');return r.json();
  }
  const members=await db('/rest/v1/workwith_members?select=member_id&user_id=eq.'+encodeURIComponent(user.id));
  if(members.length!==1)throw new ApiError(403,'관리자가 등록한 팀원만 이용할 수 있습니다.');
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new ApiError(415,'JSON 요청만 허용합니다.');
  const text=await request.text();if(text.length>100000)throw new ApiError(413,'요청이 너무 큽니다.');
  let body;try{body=JSON.parse(text);}catch{throw new ApiError(400,'요청 형식 오류');}
  const repository={load:()=>db('/rest/v1/rpc/workwith_snapshot',{}),commit:(p_revision,p_upserts,p_deletes)=>db('/rest/v1/rpc/workwith_commit',{p_revision,p_upserts,p_deletes})};
  return json(await mutate(repository,body,members[0].member_id),200,headers);
 }catch(err){return json({error:err instanceof ApiError?err.message:'서버 연결을 확인해야 합니다.'},err instanceof ApiError?err.status:503,headers);}
}
