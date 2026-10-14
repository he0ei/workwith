import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {empty} from '../src/model.js';
export const ids={sj:'00000000-0000-4000-8000-000000000001',sy:'00000000-0000-4000-8000-000000000002',jh:'00000000-0000-4000-8000-000000000003',ceo:'00000000-0000-4000-8000-000000000004',outsider:'00000000-0000-4000-8000-000000000005'};
export async function postgres(){
 const db=new PGlite();await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$; grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;`);
 await db.exec(await readFile(new URL('../supabase/migrations/202610140001_workspace.sql',import.meta.url),'utf8'));
 for(const [name,id]of Object.entries(ids)){await db.query('insert into auth.users(id) values($1)',[id]);if(name!=='outsider')await db.query('insert into public.workwith_members values($1,$2)',[id,name]);}
 // A single PGlite instance runs one SQL session. Role scopes are serialized for tests.
 let pending=Promise.resolve();
 async function as(role,user,fn){const next=pending.then(async()=>{await db.exec('set role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[ids[user]||'',role]);try{return await fn();}finally{await db.exec('reset role');}});pending=next.catch(()=>{});return next;}
 const rpc=async(role,user,fn,args=[])=>as(role,user,async()=>{const params=args.map((_,i)=>'$'+(i+1)).join(',');const {rows}=await db.query('select public.'+fn+'('+params+') as value',args);return rows[0].value;});
 const repository={load:()=>rpc('service_role',null,'workwith_snapshot'),commit:(rev,upserts,deletes)=>rpc('service_role',null,'workwith_commit',[rev,JSON.stringify(upserts),JSON.stringify(deletes)])};
 return {db,as,rpc,repository,close:()=>db.close()};
}
