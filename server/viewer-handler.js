// Read-only access for the separate viewer site (marketing-board), which calls
// this from its own server with VIEWER_SECRET. It never writes, never returns
// private tasks or history, and only serves files attached to shared work.
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

function secretMatches(given,expected){
 if(typeof given!=='string'||typeof expected!=='string'||expected.length<32||given.length!==expected.length)return false;
 let diff=0;for(let i=0;i<expected.length;i++)diff|=given.charCodeAt(i)^expected.charCodeAt(i);return diff===0;
}

export function viewerState(state){
 return {...state,tasks:state.tasks.filter(t=>t.visibility==='shared'),history:[]};
}

export async function handleViewer(request,env,fetcher=fetch){
 if(request.method!=='POST')return json({error:'POST only'},405);
 if(!secretMatches(request.headers.get('x-viewer-secret'),env.VIEWER_SECRET))return json({error:'Not found'},404);
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return json({error:'not configured'},503);
 let body;try{body=await request.json();}catch{return json({error:'bad request'},400);}
 const admin={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY};
 const snapshot=async()=>{const r=await fetcher(env.SUPABASE_URL+'/rest/v1/rpc/workwith_snapshot',{method:'POST',headers:{...admin,'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error('snapshot '+r.status);return r.json();};
 try{
  if(body?.op==='state')return json({state:viewerState((await snapshot()).state)});
  if(body?.op==='file.read'){
   const a=body.attachment,state=viewerState((await snapshot()).state);
   const ref=[...state.tasks,...state.artifacts].map(x=>x.attachment).find(x=>x&&a&&x.bucket===a.bucket&&x.path===a.path);
   if(!ref)return json({error:'Not found'},404);
   const r=await fetcher(env.SUPABASE_URL+'/storage/v1/object/authenticated/'+ref.bucket+'/'+ref.path,{headers:admin});
   if(!r.ok)return json({error:'Not found'},404);
   return new Response(r.body,{headers:{'Content-Type':ref.type,'Cache-Control':'no-store'}});
  }
  return json({error:'unsupported'},400);
 }catch{return json({error:'unavailable'},503);}
}
