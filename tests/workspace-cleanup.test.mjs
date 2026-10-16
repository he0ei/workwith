import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {postgres,ids} from './postgres-helper.mjs';
test('cleanup removes only history, blocks future history, and records one-time password setup in trusted DB state',async()=>{
 const pg=await postgres();try{
  await pg.db.exec('alter table auth.users add column encrypted_password text, add column last_sign_in_at timestamptz;');
  await pg.db.query('update auth.users set last_sign_in_at=now() where id=$1',[ids.jh]);
  const project={id:'p',title:'Keep project',owner:'jh',goal:'',start:'',due:''};
  await pg.repository.commit(0,[{entity:'projects',id:'p',payload:project},{entity:'history',id:'h',payload:{id:'h',at:'2026-10-16',message:'remove',actor:'jh',owner:'jh',visibility:'shared',projectId:'p'}}],[]);
  const before=(await pg.db.query("select * from public.workwith_records where entity<>'history'")).rows;
  await pg.db.exec(await readFile(new URL('../supabase/migrations/202610160001_workspace_cleanup.sql',import.meta.url),'utf8'));
  assert.deepEqual((await pg.db.query("select * from public.workwith_records where entity<>'history'")).rows,before);
  assert.equal((await pg.repository.load()).state.history.length,0);
  assert.deepEqual(await pg.rpc('authenticated','sj','workwith_password_status'),{user:'sj',required:true});
  assert.deepEqual(await pg.rpc('authenticated','jh','workwith_password_status'),{user:'jh',required:false});
  await assert.rejects(pg.rpc('authenticated','sj','workwith_snapshot'),/등록된 팀원/);
  assert.equal((await pg.as('authenticated','sj',()=>pg.db.query('select * from public.workwith_records'))).rows.length,0);
  await assert.rejects(pg.rpc('authenticated','outsider','workwith_password_status'),/등록된 팀원/);
  await assert.rejects(pg.rpc('anon',null,'workwith_password_status'),/permission denied/);
  await assert.rejects(pg.as('authenticated','sj',()=>pg.db.query('update public.workwith_members set password_change_required=false')),/permission denied/);
  await pg.db.query('update auth.users set last_sign_in_at=now() where id=$1',[ids.sj]);
  assert.equal((await pg.rpc('authenticated','sj','workwith_password_status')).required,true);
  await pg.db.query('update auth.users set encrypted_password=$1 where id=$2',['synthetic-hash',ids.sj]);
  assert.equal((await pg.rpc('authenticated','sj','workwith_password_status')).required,false);
  assert.equal((await pg.rpc('authenticated','sj','workwith_snapshot')).state.projects[0].title,project.title);
  await pg.db.query('update auth.users set last_sign_in_at=now() where id=$1',[ids.sj]);
  assert.equal((await pg.rpc('authenticated','sj','workwith_password_status')).required,false);
  const current=await pg.repository.load();await pg.repository.commit(current.state.revision,[{entity:'history',id:'legacy-log',payload:{id:'legacy-log'}}],[]);
  assert.equal((await pg.repository.load()).state.history.length,0);
 }finally{await pg.close();}
});
